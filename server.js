const express = require("express");
const multer = require("multer");
const path = require("path");
const { parseOfxTransactions } = require("./services/ofxParser");
const { insertTransactions, listInsertedTransactions } = require("./services/reconciliationService");
const { TopManagerService } = require("./services/topManagerService");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const BASE_PORT = Number(process.env.PORT) || 3000;
const topManager = new TopManagerService();

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

function unwrapRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.result)) return payload.result;
  return [];
}

function formatDateToTopManager(date) {
  const cleaned = String(date || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return `${cleaned}T00:00:00`;
  }
  return "2026-02-01T00:00:00";
}

function defaultDateRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

function buildFinanceQuery(query) {
  const defaults = defaultDateRange();
  const start = query.dataInicial || defaults.start;
  const end = query.dataFinal || defaults.end;

  return {
    empresaID: query.empresaID ?? 0,
    agenteCobradorID: query.agenteCobradorID ?? 0,
    fornecedorID: query.fornecedorID ?? 0,
    DtInicialVencimento: formatDateToTopManager(start),
    DtFinalVencimento: formatDateToTopManager(end)
  };
}

app.post("/api/auth/login", (req, res) => {
  const { usuario, senha } = req.body || {};

  if (usuario === "jpsilva" && senha === "871125") {
    return res.json({
      tokenPreview: "mock-token-jpsilva",
      user: { nome: "Joao P Silva", usuario }
    });
  }

  return res.status(401).json({ message: "Usuário ou senha inválidos." });
});

app.get("/api/receber", async (req, res) => {
  try {
    const query = buildFinanceQuery(req.query);
    const data = await topManager.get("financeiro/movimentosdedepositario/contasareceber", query, { forceRefresh: true });
    return res.json({
      rows: unwrapRows(data.payload),
      debug: data.debug
    });
  } catch (error) {
    return res.status(502).json({ message: error.message || "Falha ao consultar contas a receber no TopManager" });
  }
});

app.get("/api/pagar", async (req, res) => {
  try {
    const query = buildFinanceQuery(req.query);
    const data = await topManager.get("financeiro/movimentosdedepositario/contasapagar", query);
    return res.json({
      rows: unwrapRows(data.payload),
      debug: data.debug
    });
  } catch (error) {
    return res.status(502).json({ message: error.message || "Falha ao consultar contas a pagar no TopManager" });
  }
});

app.post("/api/reconciliation/ofx", upload.single("ofxFile"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Arquivo OFX nao enviado" });
  }

  const ofxContent = req.file.buffer.toString("utf8");
  const transactions = parseOfxTransactions(ofxContent);

  const conciliated = [];
  const toReview = [];
  const divergent = [];

  for (const tx of transactions) {
    const absAmount = Math.abs(tx.amount);
    if (absAmount >= 1000 && absAmount <= 6000) {
      conciliated.push(tx);
    } else if (absAmount < 50) {
      divergent.push({ ...tx, reason: "Valor muito baixo para regra automatica" });
    } else {
      toReview.push(tx);
    }
  }

  return res.json({
    importedAt: new Date().toISOString(),
    totals: {
      total: transactions.length,
      conciliated: conciliated.length,
      review: toReview.length,
      divergent: divergent.length
    },
    groups: {
      conciliated,
      review: toReview,
      divergent
    }
  });
});

app.post("/api/reconciliation/insert", async (req, res) => {
  try {
    const { transactions } = req.body || {};

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ message: "Nenhuma transacao para inserir" });
    }

    const result = await insertTransactions(transactions);
    return res.status(201).json({ message: "Transacoes inseridas com sucesso", result });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Erro ao inserir transacoes" });
  }
});

app.get("/api/reconciliation/history", (_req, res) => {
  const data = listInsertedTransactions();
  res.json(data);
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

function startServer(preferredPort) {
  const server = app.listen(preferredPort, () => {
    console.log(`Servidor online em http://localhost:${preferredPort}`);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && !process.env.PORT) {
      const nextPort = preferredPort + 1;
      console.warn(`Porta ${preferredPort} ocupada. Tentando ${nextPort}...`);
      startServer(nextPort);
      return;
    }

    console.error("Falha ao iniciar servidor:", error.message);
    process.exit(1);
  });
}

startServer(BASE_PORT);
