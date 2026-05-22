const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { randomUUID, createHash } = require("crypto");
const { parseOfxTransactions } = require("./services/ofxParser");
const {
  insertTransactions,
  listInsertedTransactions,
  appendAuditLog,
  listAuditLogs,
  createJob,
  updateJob,
  getJob,
  listJobs,
  getAccumulatedOfx,
  addAccumulatedOfx,
  clearAccumulatedOfx
} = require("./services/reconciliationService");
const { TopManagerService } = require("./services/topManagerService");

loadLocalEnv();

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: Number(process.env.OFX_UPLOAD_MAX_FILES || 10),
    fileSize: Number(process.env.OFX_UPLOAD_MAX_FILE_SIZE_MB || 5) * 1024 * 1024
  }
});
const BASE_PORT = Number(process.env.PORT) || 3000;
const topManager = new TopManagerService();
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 8 * 60 * 60 * 1000);
const LOCK_WINDOW_MS = Number(process.env.LOCK_WINDOW_MS || 10 * 60 * 1000);
const LOCK_THRESHOLD = Number(process.env.LOCK_THRESHOLD || 5);
const LOCK_TIME_MS = Number(process.env.LOCK_TIME_MS || 15 * 60 * 1000);
const APP_USERNAME = String(process.env.APP_USERNAME || "jpsilva").trim();
const APP_PASSWORD = String(process.env.APP_PASSWORD || "871125").trim();
const NODE_API_BASE_URL = String(process.env.NODE_API_BASE_URL || "https://api.stiktech.com.br").trim().replace(/\/+$/, "");
const NODE_API_TOKEN = String(process.env.NODE_API_TOKEN || "").trim();
const NODE_API_USERNAME = String(process.env.NODE_API_USERNAME || "joao").trim();
const NODE_API_PASSWORD = String(process.env.NODE_API_PASSWORD || "871125").trim();
const NODE_API_APP_ID = String(process.env.NODE_API_APP_ID || "StikVendas").trim();
const sessions = new Map();
const loginAttempts = new Map();
const nodeApiSession = {
  token: NODE_API_TOKEN || null,
  expiresAt: 0
};
const metrics = {
  startedAt: new Date().toISOString(),
  totalRequests: 0,
  byMethod: {},
  byPath: {},
  errorResponses: 0,
  avgLatencyMs: 0
};

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));

const BUILD_VERSION = Date.now();
const HTML_PATH = path.join(__dirname, "public", "index.html");

app.get("/", (_req, res) => {
  let html = fs.readFileSync(HTML_PATH, "utf8");
  html = html
    .replace('href="styles.css"', `href="styles.css?v=${BUILD_VERSION}"`)
    .replace('src="app.js"', `src="app.js?v=${BUILD_VERSION}"`);
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

app.use(express.static(path.join(__dirname, "public"), { etag: false, maxAge: 0 }));
app.use((req, res, next) => {
  const start = Date.now();
  metrics.totalRequests += 1;
  metrics.byMethod[req.method] = (metrics.byMethod[req.method] || 0) + 1;
  const cleanPath = (req.path || "/").replace(/\/\d+/g, "/:id");
  metrics.byPath[cleanPath] = (metrics.byPath[cleanPath] || 0) + 1;

  res.on("finish", () => {
    const latency = Date.now() - start;
    metrics.avgLatencyMs = Number(((metrics.avgLatencyMs * (metrics.totalRequests - 1) + latency) / metrics.totalRequests).toFixed(2));
    if (res.statusCode >= 400) metrics.errorResponses += 1;
    const log = {
      ts: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      latencyMs: latency
    };
    console.log("[HTTP]", JSON.stringify(log));
  });
  next();
});

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
  const situacao = String(query.situacao ?? "").trim();

  const financeQuery = {
    empresaID: query.empresaID ?? 0,
    agenteCobradorID: query.agenteCobradorID ?? 0,
    fornecedorID: query.fornecedorID ?? 0,
    DtInicialVencimento: formatDateToTopManager(start),
    DtFinalVencimento: formatDateToTopManager(end)
  };

  if (situacao !== "") {
    financeQuery.situacao = Number.isNaN(Number(situacao)) ? situacao : Number(situacao);
  }

  return financeQuery;
}

function decodeJwtExpiry(token) {
  try {
    const [, payload] = String(token || "").split(".");
    if (!payload) return 0;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
    return Number(json?.exp || 0) * 1000;
  } catch (_error) {
    return 0;
  }
}

async function getNodeApiToken() {
  if (NODE_API_TOKEN) return NODE_API_TOKEN;

  if (nodeApiSession.token && nodeApiSession.expiresAt - Date.now() > 60 * 1000) {
    return nodeApiSession.token;
  }

  if (!NODE_API_BASE_URL || !NODE_API_USERNAME || !NODE_API_PASSWORD) {
    throw new Error("Integração NodeAPI não configurada. Defina NODE_API_BASE_URL, NODE_API_USERNAME e NODE_API_PASSWORD.");
  }

  const body = {
    username: NODE_API_USERNAME,
    password: NODE_API_PASSWORD
  };
  if (NODE_API_APP_ID) body.appId = NODE_API_APP_ID;

  const response = await fetch(`${NODE_API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.message || "Falha ao autenticar na NodeAPI.");
  }

  nodeApiSession.token = payload.accessToken;
  nodeApiSession.expiresAt = decodeJwtExpiry(payload.accessToken) || Date.now() + 23 * 60 * 60 * 1000;
  return nodeApiSession.token;
}

async function fetchNodeApiJson(pathname, { method = "GET", query = {}, body } = {}) {
  const token = await getNodeApiToken();
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      search.set(key, String(value));
    }
  }

  const url = `${NODE_API_BASE_URL}${pathname}${search.size ? `?${search.toString()}` : ""}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.message || "Falha ao consultar NodeAPI.");
  }

  return payload;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function amountClose(a, b, tolerance = 0.01) {
  return Math.abs(Math.abs(Number(a || 0)) - Math.abs(Number(b || 0))) <= tolerance;
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysDiff(a, b) {
  const dateA = parseDate(a);
  const dateB = parseDate(b);
  if (!dateA || !dateB) return 999;
  const diff = Math.abs(dateA.getTime() - dateB.getTime());
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function getDateRangeFromTransactions(transactions) {
  const dates = transactions.map((tx) => parseDate(tx.postedAt)).filter(Boolean);
  if (!dates.length) {
    const defaults = defaultDateRange();
    return defaults;
  }

  dates.sort((a, b) => a.getTime() - b.getTime());
  return {
    start: dates[0].toISOString().slice(0, 10),
    end: dates[dates.length - 1].toISOString().slice(0, 10)
  };
}

function pickField(row, keys, fallback = "") {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return fallback;
}

function parsePositiveInt(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : 0;
}

function normalizeMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Number(Math.abs(numeric).toFixed(2));
}

function buildMatchedSettlementItem(row, entityType) {
  if (entityType === "receber") {
    return {
      documentoID: row.documentoID,
      tituloID: parsePositiveInt(pickField(row, ["tituloID", "tituloId", "tituloReceberID", "movimentoFinanceiroID", "documentoID"])),
      numeroDocumento: row.numeroDocumento,
      titulo: row.titulo,
      nome: row.cliente || "",
      vencimento: row.vencimento,
      saldo: normalizeMoney(row.saldo)
    };
  }

  return {
    documentoID: row.documentoID,
    fornecedorID: parsePositiveInt(
      pickField(row, ["fornecedorID", "fornecedorId", "entidadeID", "entidadeId", "clienteFornecedorID", "documentoID"])
    ),
    fornecedorCNPJCPF: String(
      pickField(row, ["fornecedorCNPJCPF", "cnpjCpf", "cpfCnpj", "documento", "cnpjCPF", "cnpjOuCpf"], "")
    ).trim(),
    numero: String(pickField(row, ["numeroDocumento", "numero", "documentoNumero", "documentoID"], "")).trim(),
    numeroDocumento: row.numeroDocumento,
    titulo: row.titulo,
    nome: row.fornecedor || "",
    vencimento: row.vencimento,
    saldo: normalizeMoney(row.saldo)
  };
}

function buildConciliationTxKey(tx) {
  return [tx.fitId || "", tx.postedAt || "", Number(tx.amount || 0).toFixed(2), tx.documentNumber || "", tx.name || ""].join("|");
}

function mapReceberRow(row) {
  return {
    documentoID: pickField(row, ["documentoID"]),
    tituloID: pickField(row, ["tituloID", "tituloId", "tituloReceberID", "movimentoFinanceiroID", "documentoID"]),
    numeroDocumento: String(pickField(row, ["numeroDocumento"])),
    cliente: pickField(row, ["cliente", "clienteNome", "nomeCliente", "entidadeNome"]),
    titulo: pickField(row, ["titulo", "descricao", "descricaoDoMovimento", "historico"]),
    vencimento: pickField(row, ["vencimento", "dataDeVencimento", "dtVencimento", "dataVencimento"]),
    agenteCobrador: pickField(row, ["agenteCobrador"]),
    saldo: Number(pickField(row, ["saldo", "valor", "valorDoDocumento", "valorEmAberto"], 0))
  };
}

function mapPagarRow(row) {
  return {
    documentoID: pickField(row, ["documentoID"]),
    fornecedorID: pickField(row, ["fornecedorID", "fornecedorId", "entidadeID", "entidadeId", "clienteFornecedorID", "documentoID"]),
    fornecedorCNPJCPF: pickField(row, ["fornecedorCNPJCPF", "cnpjCpf", "cpfCnpj", "documento", "cnpjCPF", "cnpjOuCpf"]),
    numeroDocumento: String(pickField(row, ["numeroDocumento"])),
    fornecedor: pickField(row, ["fornecedor", "fornecedorNome", "nomeFornecedor", "entidadeNome"]),
    titulo: pickField(row, ["titulo", "descricao", "descricaoDoMovimento", "historico"]),
    vencimento: pickField(row, ["vencimento", "dataDeVencimento", "dtVencimento", "dataVencimento"]),
    agenteCobrador: pickField(row, ["agenteCobrador"]),
    saldo: Number(pickField(row, ["saldo", "valor", "valorDoDocumento", "valorEmAberto"], 0))
  };
}

function chooseBestMatch(tx, candidates, entityType) {
  if (!candidates.length) return null;
  const txText = normalizeText(`${tx.name || ""} ${tx.memo || ""} ${tx.documentNumber || ""} ${tx.fitId || ""}`);

  const scored = candidates.map(({ row, index }) => {
    const candidateText = normalizeText(
      `${row.numeroDocumento || ""} ${row.documentoID || ""} ${row.titulo || ""} ${row.cliente || ""} ${row.fornecedor || ""}`
    );
    let score = 0;
    if (amountClose(tx.amount, row.saldo)) score += 50;
    const diff = daysDiff(tx.postedAt, row.vencimento);
    if (diff <= 0) score += 20;
    else if (diff <= 2) score += 18;
    else if (diff <= 5) score += 14;
    else if (diff <= 10) score += 8;
    if (tx.documentNumber && row.numeroDocumento && tx.documentNumber.includes(row.numeroDocumento)) score += 30;
    if (tx.documentNumber && row.documentoID && tx.documentNumber.includes(String(row.documentoID))) score += 20;
    if (txText && candidateText && txText.includes(candidateText)) score += 18;
    if (txText && row.numeroDocumento && txText.includes(normalizeText(row.numeroDocumento))) score += 12;
    return { row, index, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 50) return null;

  return {
    entityType,
    isGroup: false,
    itemCount: 1,
    documentoID: best.row.documentoID,
    numeroDocumento: best.row.numeroDocumento,
    titulo: best.row.titulo,
    nome: best.row.cliente || best.row.fornecedor || "",
    vencimento: best.row.vencimento,
    saldo: best.row.saldo,
    totalSaldo: normalizeMoney(best.row.saldo),
    score: best.score,
    items: [buildMatchedSettlementItem(best.row, entityType)],
    usedIndexes: [best.index]
  };
}

function buildGroupMatch(tx, sourceRows, usedSet, entityType) {
  const targetCents = Math.round(Math.abs(Number(tx.amount || 0)) * 100);
  if (!targetCents) return null;

  const toleranceCents = 5;
  const maxItems = 6;
  const maxCandidates = 18;
  const txText = normalizeText(`${tx.name || ""} ${tx.memo || ""} ${tx.documentNumber || ""} ${tx.fitId || ""}`);

  const pool = sourceRows
    .map((row, index) => ({
      index,
      row,
      cents: Math.round(Math.abs(Number(row.saldo || 0)) * 100),
      dateDiff: daysDiff(tx.postedAt, row.vencimento)
    }))
    .filter((item) => !usedSet.has(item.index))
    .filter((item) => item.cents > 0 && item.cents <= targetCents + toleranceCents)
    .filter((item) => item.dateDiff <= 10)
    .sort((a, b) => {
      const byCloseness = Math.abs(targetCents - a.cents) - Math.abs(targetCents - b.cents);
      if (byCloseness !== 0) return byCloseness;
      return a.dateDiff - b.dateDiff;
    })
    .slice(0, maxCandidates)
    .sort((a, b) => b.cents - a.cents);

  if (pool.length < 2) return null;

  const suffix = new Array(pool.length + 1).fill(0);
  for (let i = pool.length - 1; i >= 0; i -= 1) {
    suffix[i] = suffix[i + 1] + pool[i].cents;
  }

  let best = null;

  const evaluate = (picked, sumCents) => {
    if (picked.length < 2) return;
    const gap = Math.abs(targetCents - sumCents);
    if (gap > toleranceCents) return;

    const combinedText = normalizeText(
      picked
        .map(({ row }) => `${row.numeroDocumento || ""} ${row.documentoID || ""} ${row.titulo || ""} ${row.cliente || ""} ${row.fornecedor || ""}`)
        .join(" ")
    );
    const textScore = txText && combinedText && txText.includes(combinedText) ? 20 : 0;
    const avgDateDiff = picked.reduce((acc, cur) => acc + cur.dateDiff, 0) / picked.length;
    const score = 250 - gap - picked.length * 3 - avgDateDiff + textScore;

    if (!best || gap < best.gap || (gap === best.gap && score > best.score)) {
      best = {
        gap,
        score,
        sumCents,
        picked: [...picked]
      };
    }
  };

  const dfs = (start, sumCents, picked) => {
    if (picked.length >= 2) evaluate(picked, sumCents);
    if (picked.length >= maxItems || start >= pool.length) return;
    if (sumCents + suffix[start] < targetCents - toleranceCents) return;

    for (let i = start; i < pool.length; i += 1) {
      const next = sumCents + pool[i].cents;
      if (next > targetCents + toleranceCents) continue;
      picked.push(pool[i]);
      dfs(i + 1, next, picked);
      picked.pop();
    }
  };

  dfs(0, 0, []);
  if (!best) return null;

  const items = best.picked.map(({ row }) => buildMatchedSettlementItem(row, entityType));

  return {
    entityType,
    isGroup: true,
    itemCount: items.length,
    totalSaldo: Number((best.sumCents / 100).toFixed(2)),
    gap: Number((best.gap / 100).toFixed(2)),
    score: Number(best.score.toFixed(2)),
    items,
    usedIndexes: best.picked.map((item) => item.index)
  };
}

function decodeOfxBuffer(buffer) {
  const latin1Text = buffer.toString("latin1");
  const header = latin1Text.slice(0, 800).toUpperCase();
  const utf8Text = buffer.toString("utf8");
  const replacementCount = (utf8Text.match(/�/g) || []).length;
  const useLatin1 =
    /CHARSET:1252|CHARSET:ANSI|CHARSET:ISO-8859-1|CHARSET:LATIN1|CHARSET:8859-1/.test(header) ||
    replacementCount >= 2;
  return useLatin1 ? latin1Text : utf8Text;
}

function dedupeTransactions(transactions) {
  const seen = new Set();
  const unique = [];
  for (const tx of transactions) {
    const key = [
      tx.fitId || "",
      tx.postedAt || "",
      Number(tx.amount || 0).toFixed(2),
      tx.accountId || "",
      tx.bankCode || "",
      tx.documentNumber || "",
      (tx.name || "").slice(0, 60)
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(tx);
  }
  return unique;
}

function collectOfxPayloadFromEntries(entries) {
  const transactionsRaw = [];
  const filesSummary = [];

  for (const entry of entries) {
    const ofxContent = decodeOfxBuffer(entry.buffer);
    const parsed = parseOfxTransactions(ofxContent);
    transactionsRaw.push(...parsed.transactions);
    filesSummary.push({
      fileName: entry.fileName,
      bankName: parsed.metadata.bankName,
      accountId: parsed.metadata.accountId,
      periodStart: parsed.metadata.periodStart,
      periodEnd: parsed.metadata.periodEnd,
      transactions: parsed.transactions.length
    });
  }

  const transactions = dedupeTransactions(transactionsRaw);
  const duplicatesRemoved = Math.max(transactionsRaw.length - transactions.length, 0);
  return { transactions, filesSummary, duplicatesRemoved };
}

function getIdentityKey(req, usuario) {
  return `${String(usuario || "").toLowerCase()}|${req.ip || "unknown"}`;
}

function getConfiguredAppCredentials() {
  return APP_USERNAME && APP_PASSWORD ? { usuario: APP_USERNAME, senha: APP_PASSWORD } : null;
}

const USERS_FILE = path.join(__dirname, "users.json");

function loadLocalUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf8")) || [];
  } catch {
    return [];
  }
}

function hashPassword(password) {
  return createHash("sha256").update(String(password)).digest("hex");
}

function findLocalUser(username, password) {
  const h = hashPassword(password);
  return loadLocalUsers().find((u) => u.username === username && u.passwordHash === h) || null;
}

function getBearerToken(req) {
  const header = String(req.headers.authorization || "").trim();
  if (!header) return "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ? match[1].trim() : "";
}

function getAuthenticatedSession(req) {
  cleanupSessions();
  const token = getBearerToken(req);
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function requireAuth(req, res, next) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return res.status(401).json({ message: "Sessão inválida ou ausente." });
  }
  req.session = session;
  req.auth = { usuario: session.usuario };
  next();
}

function resolveActor(req, fallback = "system") {
  return req.auth?.usuario || fallback;
}

function buildStoredJobResult(result) {
  if (!result) return null;
  return {
    totals: result.totals || null,
    matchingSummary: result.matchingSummary || null
  };
}

function isLoginLocked(key) {
  const info = loginAttempts.get(key);
  if (!info) return { locked: false };
  if (info.lockedUntil && info.lockedUntil > Date.now()) {
    return { locked: true, remainingMs: info.lockedUntil - Date.now() };
  }
  if (info.lockedUntil && info.lockedUntil <= Date.now()) {
    loginAttempts.delete(key);
  }
  return { locked: false };
}

function registerFailedLogin(key) {
  const now = Date.now();
  const info = loginAttempts.get(key) || { count: 0, firstAt: now, lockedUntil: 0 };
  if (now - info.firstAt > LOCK_WINDOW_MS) {
    info.count = 0;
    info.firstAt = now;
  }
  info.count += 1;
  if (info.count >= LOCK_THRESHOLD) {
    info.lockedUntil = now + LOCK_TIME_MS;
  }
  loginAttempts.set(key, info);
  return info;
}

function clearLoginAttempts(key) {
  loginAttempts.delete(key);
}

function createSession(usuario) {
  const token = randomUUID();
  const now = Date.now();
  const session = {
    token,
    usuario,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString()
  };
  sessions.set(token, session);
  return session;
}

function refreshSession(oldToken) {
  const current = sessions.get(oldToken);
  if (!current) return null;
  sessions.delete(oldToken);
  return createSession(current.usuario);
}

function cleanupSessions() {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (new Date(session.expiresAt).getTime() <= now) {
      sessions.delete(token);
    }
  }
}

function classifyTransactions(transactions, receberRows, pagarRows) {
  const usedReceber = new Set();
  const usedPagar = new Set();
  const conciliated = [];
  const toReview = [];
  const divergent = [];

  for (const tx of transactions) {
    const isCredit = Number(tx.amount) >= 0;
    const sourceRows = isCredit ? receberRows : pagarRows;
    const usedSet = isCredit ? usedReceber : usedPagar;
    const entityType = isCredit ? "receber" : "pagar";
    const candidates = sourceRows
      .map((row, index) => ({ row, index }))
      .filter(({ index }) => !usedSet.has(index))
      .filter(({ row }) => amountClose(tx.amount, row.saldo))
      .filter(({ row }) => daysDiff(tx.postedAt, row.vencimento) <= 10);

    const match = chooseBestMatch(tx, candidates, entityType);

    if (match) {
      match.usedIndexes.forEach((index) => usedSet.add(index));
      const { usedIndexes, ...storedMatch } = match;
      conciliated.push({ ...tx, matched: storedMatch });
      continue;
    }

    const groupedMatch = buildGroupMatch(tx, sourceRows, usedSet, entityType);
    if (groupedMatch) {
      groupedMatch.usedIndexes.forEach((index) => usedSet.add(index));
      const { usedIndexes, ...storedMatch } = groupedMatch;
      conciliated.push({
        ...tx,
        matched: {
          ...storedMatch,
          numeroDocumento: storedMatch.items.map((item) => item.numeroDocumento).filter(Boolean).join(", "),
          titulo: `${storedMatch.itemCount} titulos`
        }
      });
      continue;
    }

    if (Math.abs(Number(tx.amount)) < 50) {
      divergent.push({ ...tx, reason: "Valor baixo sem correspondencia em pagar/receber" });
    } else {
      toReview.push({ ...tx, reason: "Sem correspondencia em pagar/receber para valor e data" });
    }
  }

  return { conciliated, review: toReview, divergent };
}

function parseYmd(value) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeDateRange(inputStart, inputEnd) {
  const now = new Date();
  const endDefault = new Date(now);
  const startDefault = new Date(now);
  startDefault.setDate(startDefault.getDate() - 30);

  let start = parseYmd(inputStart) || startDefault;
  let end = parseYmd(inputEnd) || endDefault;
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  if (start > end) {
    const tmp = start;
    start = end;
    end = tmp;
  }
  return { start, end, startYmd: toYmd(start), endYmd: toYmd(end) };
}

function linearRegression(values) {
  const n = values.length;
  if (!n) return { a: 0, b: 0 };
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = i - xMean;
    num += dx * (values[i] - yMean);
    den += dx * dx;
  }
  const b = den === 0 ? 0 : num / den;
  const a = yMean - b * xMean;
  return { a, b };
}

const FORECAST_HOURS = [10, 12, 14, 16, 18];
const INTRADAY_CURVE = [-0.35, -0.1, 0, 0.15, 0.3];

function computeObservedMetrics(points) {
  const errors = points.filter((p) => p.accuracyPercent !== null).map((p) => 100 - p.accuracyPercent);
  if (!errors.length) return { accuracyPercent: null, mapePercent: null, samples: 0 };
  const mape = errors.reduce((s, e) => s + e, 0) / errors.length;
  return {
    accuracyPercent: Number(Math.max(0, 100 - mape).toFixed(2)),
    mapePercent: Number(mape.toFixed(2)),
    samples: errors.length
  };
}

function buildIntradayPoints(daily, lastDate, avgAbsChange, realCloseByDate, model) {
  const points = [];
  for (let day = 1; day <= daily.length; day += 1) {
    const d = new Date(lastDate);
    d.setDate(d.getDate() + day);
    const ymd = toYmd(d);
    FORECAST_HOURS.forEach((hour, idx) => {
      const predicted = Number((daily[day - 1].predictedClose + avgAbsChange * INTRADAY_CURVE[idx]).toFixed(4));
      const realClose = Number(realCloseByDate.get(ymd) || 0);
      const accuracyPercent = realClose > 0 ? Number(Math.max(0, 100 - (Math.abs(predicted - realClose) / realClose) * 100).toFixed(2)) : null;
      points.push({
        model,
        date: ymd,
        hour: `${String(hour).padStart(2, "0")}:00`,
        predicted,
        realClose: realClose > 0 ? Number(realClose.toFixed(4)) : null,
        accuracyPercent,
        dayOffset: day
      });
    });
  }
  return points;
}

function computeBacktestLinear(closes) {
  const startIndex = Math.max(5, closes.length - 20);
  const errors = [];
  for (let i = startIndex; i < closes.length; i += 1) {
    const train = closes.slice(0, i);
    if (train.length < 2) continue;
    const model = linearRegression(train);
    const pred = model.a + model.b * i;
    const actual = closes[i];
    if (actual > 0) errors.push(Math.abs((actual - pred) / actual));
  }
  const mape = errors.length ? (errors.reduce((s, e) => s + e, 0) / errors.length) * 100 : 100;
  return { accuracyPercent: Number(Math.max(0, 100 - mape).toFixed(2)), mapePercent: Number(mape.toFixed(2)), samples: errors.length };
}

function holtSse(values, alpha, beta) {
  if (values.length < 2) return Number.POSITIVE_INFINITY;
  let level = values[0];
  let trend = values[1] - values[0];
  let sse = 0;
  for (let t = 1; t < values.length; t += 1) {
    const pred = level + trend;
    const err = values[t] - pred;
    sse += err * err;
    const prevLevel = level;
    level = alpha * values[t] + (1 - alpha) * pred;
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }
  return sse;
}

function optimizeHoltParams(values) {
  if (values.length < 3) return { alpha: 0.4, beta: 0.2 };
  let best = { alpha: 0.4, beta: 0.2, sse: Number.POSITIVE_INFINITY };
  for (let a = 0.1; a <= 0.9; a += 0.1) {
    for (let b = 0.1; b <= 0.9; b += 0.1) {
      const sse = holtSse(values, Number(a.toFixed(1)), Number(b.toFixed(1)));
      if (sse < best.sse) best = { alpha: Number(a.toFixed(1)), beta: Number(b.toFixed(1)), sse };
    }
  }
  return { alpha: best.alpha, beta: best.beta };
}

function holtFit(values, alpha, beta) {
  if (values.length < 2) return { level: values[0] || 0, trend: 0 };
  let level = values[0];
  let trend = values[1] - values[0];
  for (let t = 1; t < values.length; t += 1) {
    const pred = level + trend;
    const prevLevel = level;
    level = alpha * values[t] + (1 - alpha) * pred;
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }
  return { level, trend };
}

function computeBacktestHolt(closes, alpha, beta) {
  const startIndex = Math.max(5, closes.length - 20);
  const errors = [];
  for (let i = startIndex; i < closes.length; i += 1) {
    const train = closes.slice(0, i);
    if (train.length < 2) continue;
    const fit = holtFit(train, alpha, beta);
    const pred = fit.level + fit.trend;
    const actual = closes[i];
    if (actual > 0) errors.push(Math.abs((actual - pred) / actual));
  }
  const mape = errors.length ? (errors.reduce((s, e) => s + e, 0) / errors.length) * 100 : 100;
  return { accuracyPercent: Number(Math.max(0, 100 - mape).toFixed(2)), mapePercent: Number(mape.toFixed(2)), samples: errors.length };
}

function forecastLinear(history, closes, forecastDays, realCloseByDate, avgAbsChange) {
  const { a, b } = linearRegression(closes);
  const nextDayIdx = closes.length;
  const lastDate = new Date(`${history[history.length - 1].date}T00:00:00`);
  const daily = [];
  for (let day = 1; day <= forecastDays; day += 1) {
    const d = new Date(lastDate);
    d.setDate(d.getDate() + day);
    daily.push({ date: toYmd(d), predictedClose: Number((a + b * (nextDayIdx + day - 1)).toFixed(4)) });
  }
  const points = buildIntradayPoints(daily, lastDate, avgAbsChange, realCloseByDate, "linear");
  return {
    model: "linear",
    points,
    daily,
    backtest: computeBacktestLinear(closes),
    observed: computeObservedMetrics(points),
    trendSlope: Number(b.toFixed(6)),
    baselineNext: Number((a + b * nextDayIdx).toFixed(4)),
    lastClose: Number(closes[closes.length - 1].toFixed(4))
  };
}

function forecastHolt(history, closes, forecastDays, realCloseByDate, avgAbsChange) {
  const params = optimizeHoltParams(closes);
  const fit = holtFit(closes, params.alpha, params.beta);
  const lastDate = new Date(`${history[history.length - 1].date}T00:00:00`);
  const daily = [];
  for (let day = 1; day <= forecastDays; day += 1) {
    const d = new Date(lastDate);
    d.setDate(d.getDate() + day);
    daily.push({ date: toYmd(d), predictedClose: Number((fit.level + day * fit.trend).toFixed(4)) });
  }
  const points = buildIntradayPoints(daily, lastDate, avgAbsChange, realCloseByDate, "holt");
  return {
    model: "holt",
    points,
    daily,
    backtest: computeBacktestHolt(closes, params.alpha, params.beta),
    observed: computeObservedMetrics(points),
    trendSlope: Number(fit.trend.toFixed(6)),
    baselineNext: Number((fit.level + fit.trend).toFixed(4)),
    lastClose: Number(closes[closes.length - 1].toFixed(4)),
    params
  };
}

function buildDollarForecast(history, forecastDays = 15, realCloseByDate = new Map()) {
  if (!history.length) {
    return {
      model: "linear",
      points: [],
      daily: [],
      backtest: { accuracyPercent: 0, mapePercent: 100, samples: 0 },
      observed: { accuracyPercent: null, mapePercent: null, samples: 0 },
      models: {}
    };
  }

  const closes = history.map((row) => row.close);
  const avgAbsChange =
    closes.length > 1 ? closes.slice(1).reduce((s, v, i) => s + Math.abs(v - closes[i]), 0) / (closes.length - 1) : 0.005;
  const linear = forecastLinear(history, closes, forecastDays, realCloseByDate, avgAbsChange);
  const holt = forecastHolt(history, closes, forecastDays, realCloseByDate, avgAbsChange);
  const winner = holt.backtest.accuracyPercent >= linear.backtest.accuracyPercent ? holt : linear;
  return {
    ...winner,
    winnerModel: winner.model,
    models: {
      linear: {
        backtest: linear.backtest,
        observed: linear.observed
      },
      holt: {
        backtest: holt.backtest,
        observed: holt.observed,
        params: holt.params || null
      }
    }
  };
}

async function processConciliationFromTransactions(transactions, filesSummary) {
  const dateRange = getDateRangeFromTransactions(transactions);
  const query = buildFinanceQuery({
    dataInicial: dateRange.start,
    dataFinal: dateRange.end,
    empresaID: 0,
    agenteCobradorID: 0,
    fornecedorID: 0
  });

  const [receberRaw, pagarRaw] = await Promise.all([
    topManager.get("financeiro/movimentosdedepositario/contasareceber", query),
    topManager.get("financeiro/movimentosdedepositario/contasapagar", query)
  ]);
  const receberRows = unwrapRows(receberRaw.payload).map(mapReceberRow);
  const pagarRows = unwrapRows(pagarRaw.payload).map(mapPagarRow);
  const groups = classifyTransactions(transactions, receberRows, pagarRows);
  return {
    importedAt: new Date().toISOString(),
    filesSummary,
    matchingSummary: {
      rangeStart: query.DtInicialVencimento,
      rangeEnd: query.DtFinalVencimento,
      receberLoaded: receberRows.length,
      pagarLoaded: pagarRows.length
    },
    totals: {
      files: filesSummary.length,
      total: transactions.length,
      conciliated: groups.conciliated.length,
      review: groups.review.length,
      divergent: groups.divergent.length
    },
    groups
  };
}

function normalizeCatalogItems(payload, { idKeys, labelKeys }) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.rows)
        ? payload.rows
        : Array.isArray(payload?.data)
          ? payload.data
          : [];

  return rows
    .map((row) => {
      const id = parsePositiveInt(pickField(row, idKeys, row?.id));
      const label = String(pickField(row, labelKeys, row?.label || "")).trim();
      if (!id || !label) return null;
      return {
        id,
        label,
        ativo: row?.Ativo ?? row?.ativo ?? 1
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.id - b.id);
}

async function loadReconciliationCatalogsFromNodeApi() {
  const [fonteDeRecursosRaw, depositariosRaw, tiposDeOperacaoRaw, meiosDePagamentoRaw] = await Promise.all([
    fetchNodeApiJson("/api/financeiro/catalogos/fonte-de-recursos"),
    fetchNodeApiJson("/api/financeiro/catalogos/depositarios"),
    fetchNodeApiJson("/api/financeiro/catalogos/tipos-de-operacao"),
    fetchNodeApiJson("/api/financeiro/catalogos/meios-de-pagamento")
  ]);

  return {
    fonteDeRecursos: normalizeCatalogItems(fonteDeRecursosRaw, {
      idKeys: ["FonteDeRecursosID", "fonteDeRecursosID", "id"],
      labelKeys: ["FonteDeRecursos", "fonteDeRecursos", "label"]
    }),
    depositarios: normalizeCatalogItems(depositariosRaw, {
      idKeys: ["DepositarioID", "depositarioID", "id"],
      labelKeys: ["Depositario", "depositario", "label"]
    }),
    tiposDeOperacao: normalizeCatalogItems(tiposDeOperacaoRaw, {
      idKeys: ["TipoDeOperacaoID", "tipoDeOperacaoID", "id"],
      labelKeys: ["TipoDeOperacao", "tipoDeOperacao", "label"]
    }),
    meiosDePagamento: normalizeCatalogItems(meiosDePagamentoRaw, {
      idKeys: ["MeioDePagamentoID", "meioDePagamentoID", "id"],
      labelKeys: ["MeioDePagamento", "meioDePagamento", "label"]
    })
  };
}

function normalizeSettlementConfig(config = {}) {
  return {
    organizacaoId: parsePositiveInt(config.organizacaoId) || 2,
    depositarioId: parsePositiveInt(config.depositarioId),
    tipoOperacaoReceberId: parsePositiveInt(config.tipoOperacaoReceberId),
    tipoOperacaoPagarId: parsePositiveInt(config.tipoOperacaoPagarId),
    meioPagamentoId: parsePositiveInt(config.meioPagamentoId),
    fonteDeRecursosId: parsePositiveInt(config.fonteDeRecursosId)
  };
}

function validateSettlementRequest(transactions, config) {
  const messages = [];
  const hasReceber = transactions.some((tx) => tx?.matched?.entityType === "receber");
  const hasPagar = transactions.some((tx) => tx?.matched?.entityType === "pagar");

  if (!config.depositarioId) messages.push("Selecione o Depositário.");
  if (!config.meioPagamentoId) messages.push("Selecione o Meio de Pagamento.");
  if (!config.fonteDeRecursosId) messages.push("Selecione a Fonte de Recursos.");
  if (hasReceber && !config.tipoOperacaoReceberId) messages.push("Selecione o Tipo de Operação para receber.");
  if (hasPagar && !config.tipoOperacaoPagarId) messages.push("Selecione o Tipo de Operação para pagar.");

  return messages;
}

function getSettlementItems(tx) {
  return Array.isArray(tx?.matched?.items) ? tx.matched.items : [];
}

function getSettlementReference(tx) {
  return String(tx?.documentNumber || tx?.name || tx?.fitId || buildConciliationTxKey(tx)).trim();
}

function buildReceberSettlementPayload(tx, config) {
  const items = getSettlementItems(tx).map((item) => {
    const tituloID = parsePositiveInt(item.tituloID || item.documentoID);
    if (!tituloID) {
      throw new Error(`Match sem TituloID para ${getSettlementReference(tx)}.`);
    }

    return {
      Id: 0,
      MovimentoDepositarioID: 0,
      TituloID: tituloID,
      Valor: normalizeMoney(item.saldo)
    };
  });

  if (!items.length) {
    throw new Error(`Nenhum item conciliado encontrado para ${getSettlementReference(tx)}.`);
  }

  return {
    Id: 0,
    OrganizacaoID: config.organizacaoId,
    DepositarioID: config.depositarioId,
    Data: formatDateToTopManager(tx.postedAt),
    TipoDeOperacaoID: config.tipoOperacaoReceberId,
    MeioDePagamentoID: config.meioPagamentoId,
    FonteDeRecursosID: config.fonteDeRecursosId,
    ItensRcms: items
  };
}

function buildPagarSettlementPayload(tx, config) {
  const items = getSettlementItems(tx).map((item) => {
    const fornecedorID = parsePositiveInt(item.fornecedorID || item.documentoID);
    const numero = String(item.numero || item.numeroDocumento || tx.documentNumber || item.documentoID || "").trim();

    if (!fornecedorID) {
      throw new Error(`Match sem FornecedorID para ${getSettlementReference(tx)}.`);
    }
    if (!numero) {
      throw new Error(`Match sem Numero para ${getSettlementReference(tx)}.`);
    }

    return {
      Id: 0,
      MovimentoDepositarioID: 0,
      FornecedorID: fornecedorID,
      FornecedorCNPJCPF: String(item.fornecedorCNPJCPF || "").trim(),
      Numero: numero,
      Valor: normalizeMoney(item.saldo)
    };
  });

  if (!items.length) {
    throw new Error(`Nenhum item conciliado encontrado para ${getSettlementReference(tx)}.`);
  }

  return {
    Id: 0,
    OrganizacaoID: config.organizacaoId,
    DepositarioID: config.depositarioId,
    Data: formatDateToTopManager(tx.postedAt),
    TipoDeOperacaoID: config.tipoOperacaoPagarId,
    MeioDePagamentoID: config.meioPagamentoId,
    FonteDeRecursosID: config.fonteDeRecursosId,
    ItensCpms: items
  };
}

async function settleConciliationTransaction(tx, config) {
  const entityType = tx?.matched?.entityType;
  if (entityType === "receber") {
    await topManager.post("financeiro/movimentosdedepositario/incluirrcm", buildReceberSettlementPayload(tx, config));
    return {
      clientKey: buildConciliationTxKey(tx),
      entityType,
      status: "success",
      endpoint: "incluirrcm",
      itemCount: getSettlementItems(tx).length,
      processedAt: new Date().toISOString(),
      message: "Baixa de contas a receber registrada."
    };
  }

  if (entityType === "pagar") {
    await topManager.post("financeiro/movimentosdedepositario/incluircpm", buildPagarSettlementPayload(tx, config));
    return {
      clientKey: buildConciliationTxKey(tx),
      entityType,
      status: "success",
      endpoint: "incluircpm",
      itemCount: getSettlementItems(tx).length,
      processedAt: new Date().toISOString(),
      message: "Baixa de contas a pagar registrada."
    };
  }

  throw new Error(`Tipo de conciliação inválido para ${getSettlementReference(tx)}.`);
}

app.post("/api/auth/login", (req, res) => {
  const { usuario, senha } = req.body || {};
  const identityKey = getIdentityKey(req, usuario);
  const lock = isLoginLocked(identityKey);
  if (lock.locked) {
    return res.status(429).json({
      message: `Muitas tentativas. Tente novamente em ${Math.ceil(lock.remainingMs / 1000)}s.`
    });
  }

  // 1. Checar credenciais do env (usuário raiz)
  const envCreds = getConfiguredAppCredentials();
  if (envCreds && usuario === envCreds.usuario && senha === envCreds.senha) {
    clearLoginAttempts(identityKey);
    cleanupSessions();
    const session = createSession(usuario);
    appendAuditLog({ actor: usuario, action: "auth.login.success", details: { ip: req.ip, expiresAt: session.expiresAt } });
    return res.json({ tokenPreview: session.token, expiresAt: session.expiresAt, user: { nome: "Joao P Silva", usuario } });
  }

  // 2. Checar users.json
  const localUser = findLocalUser(usuario, senha);
  if (localUser) {
    clearLoginAttempts(identityKey);
    cleanupSessions();
    const session = createSession(usuario);
    appendAuditLog({ actor: usuario, action: "auth.login.success", details: { ip: req.ip, expiresAt: session.expiresAt } });
    return res.json({ tokenPreview: session.token, expiresAt: session.expiresAt, user: { nome: localUser.nome || usuario, usuario } });
  }

  // 3. Sem nenhuma credencial configurada
  if (!envCreds && loadLocalUsers().length === 0) {
    return res.status(503).json({ message: "Login da plataforma não configurado." });
  }

  const fail = registerFailedLogin(identityKey);
  appendAuditLog({ actor: usuario || "anon", action: "auth.login.failed", details: { ip: req.ip, attempts: fail.count } });
  return res.status(401).json({ message: "Usuário ou senha inválidos." });
});

app.post("/api/auth/refresh", (req, res) => {
  const oldToken = req.body?.token || getBearerToken(req);
  if (!oldToken) return res.status(400).json({ message: "Token não informado." });
  cleanupSessions();
  const session = refreshSession(oldToken);
  if (!session) return res.status(401).json({ message: "Sessão inválida ou expirada." });
  appendAuditLog({
    actor: session.usuario,
    action: "auth.refresh",
    details: { ip: req.ip, expiresAt: session.expiresAt }
  });
  return res.json({ tokenPreview: session.token, expiresAt: session.expiresAt });
});

app.get("/api/receber", requireAuth, async (req, res) => {
  try {
    const query = buildFinanceQuery(req.query);
    const data = await topManager.get("financeiro/movimentosdedepositario/contasareceber", query);
    appendAuditLog({
      actor: resolveActor(req),
      action: "finance.receber.query",
      details: { query }
    });
    return res.json({
      rows: unwrapRows(data.payload)
    });
  } catch (error) {
    return res.status(502).json({ message: error.message || "Falha ao consultar contas a receber no TopManager" });
  }
});

app.get("/api/pagar", requireAuth, async (req, res) => {
  try {
    const query = buildFinanceQuery(req.query);
    const data = await topManager.get("financeiro/movimentosdedepositario/contasapagar", query);
    appendAuditLog({
      actor: resolveActor(req),
      action: "finance.pagar.query",
      details: { query }
    });
    return res.json({
      rows: unwrapRows(data.payload)
    });
  } catch (error) {
    return res.status(502).json({ message: error.message || "Falha ao consultar contas a pagar no TopManager" });
  }
});

app.get("/api/ficha-cliente/anexo", requireAuth, async (req, res) => {
  const assetPath = req.query.path;
  if (!assetPath || typeof assetPath !== "string" || !assetPath.startsWith("/")) {
    return res.status(400).json({ message: "Caminho inválido." });
  }
  try {
    const token = await getNodeApiToken();
    const url = `${NODE_API_BASE_URL}${assetPath}`;
    const upstream = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!upstream.ok) {
      return res.status(upstream.status).json({ message: "Arquivo não encontrado na API." });
    }
    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const contentDisposition = upstream.headers.get("content-disposition") || `attachment; filename="${path.basename(assetPath)}"`;
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", contentDisposition);
    upstream.body.pipe(res);
  } catch (error) {
    return res.status(502).json({ message: error.message || "Falha ao baixar anexo." });
  }
});

app.get("/api/ficha-cliente", requireAuth, async (req, res) => {
  try {
    const data = await fetchNodeApiJson("/api/fichas-cadastro-clientes", {
      query: {
        vendedorId: req.query.vendedorId,
        dataInicial: req.query.dataInicial,
        dataFinal: req.query.dataFinal,
        tipo: req.query.tipo,
        search: req.query.search,
        limit: req.query.limit || 50
      }
    });
    return res.json({
      rows: Array.isArray(data.data) ? data.data : [],
      source: "nodeapi"
    });
  } catch (error) {
    return res.status(502).json({ message: error.message || "Falha ao consultar fichas de cliente na NodeAPI." });
  }
});

app.get("/api/ficha-cliente/:id", requireAuth, async (req, res) => {
  try {
    const data = await fetchNodeApiJson(`/api/fichas-cadastro-clientes/${req.params.id}`);
    return res.json({
      row: data.data || null,
      source: "nodeapi"
    });
  } catch (error) {
    return res.status(502).json({ message: error.message || "Falha ao consultar detalhe da ficha na NodeAPI." });
  }
});

app.patch("/api/ficha-cliente/:id/analise", requireAuth, async (req, res) => {
  try {
    const data = await fetchNodeApiJson(`/api/fichas-cadastro-clientes/${req.params.id}/analise`, {
      method: "PATCH",
      body: {
        statusAnalise: req.body?.statusAnalise,
        observacaoAnalise: req.body?.observacaoAnalise,
        analisadoPor: getAuthUser(req),
        pagamentoAnalise: {
          valorPedido: req.body?.pagamentoAnalise?.valorPedido,
          formaPagamento: req.body?.pagamentoAnalise?.formaPagamento,
          prazoEstimado: req.body?.pagamentoAnalise?.prazoEstimado
        }
      }
    });
    return res.json({
      row: data.data || null,
      source: "nodeapi"
    });
  } catch (error) {
    return res.status(502).json({ message: error.message || "Falha ao salvar análise da ficha na NodeAPI." });
  }
});

app.get("/api/checkins", requireAuth, async (req, res) => {
  try {
    const query = {};
    if (req.query.vendedorId) query.vendedorId = req.query.vendedorId;
    if (req.query.clienteId) query.clienteId = req.query.clienteId;
    if (req.query.dataInicial) query.dataInicial = req.query.dataInicial;
    if (req.query.dataFinal) query.dataFinal = req.query.dataFinal;

    const data = await fetchNodeApiJson("/api/checkins-geral", {
      query
    });
    return res.json({
      rows: Array.isArray(data.data) ? data.data : [],
      source: "nodeapi"
    });
  } catch (error) {
    return res.status(502).json({ message: error.message || "Falha ao consultar check-ins na NodeAPI." });
  }
});

app.get("/api/analytics/dolar", requireAuth, async (req, res) => {
  try {
    const range = normalizeDateRange(req.query.dataInicial, req.query.dataFinal);
    const sourceUrl = "https://economia.awesomeapi.com.br/json/daily/USD-BRL/2000";
    const response = await fetch(sourceUrl, { method: "GET" });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Falha ao consultar dólar (${response.status}): ${body}`);
    }
    const payload = await response.json();
    const rows = Array.isArray(payload) ? payload : [];
    const allNormalized = rows
      .map((row) => {
        const timestamp = Number(row.timestamp || row.create_date?.split(" ")[0] || 0);
        const date = Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp * 1000) : new Date(row.create_date || row.bidDate || "");
        if (Number.isNaN(date.getTime())) return null;
        return {
          date: toYmd(date),
          open: Number(row.open || 0),
          high: Number(row.high || 0),
          low: Number(row.low || 0),
          close: Number(row.bid || row.close || 0),
          pctChange: Number(row.pctChange || 0)
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.date.localeCompare(b.date));

    const normalized = allNormalized
      .filter((row) => row.date >= range.startYmd && row.date <= range.endYmd)
      .sort((a, b) => a.date.localeCompare(b.date));

    const realCloseByDate = new Map(allNormalized.map((row) => [row.date, row.close]));

    const requestedDays = Number(req.query.dias || 15);
    const forecastDays = Number.isFinite(requestedDays) ? Math.min(Math.max(requestedDays, 1), 30) : 15;
    const forecast = buildDollarForecast(normalized, forecastDays, realCloseByDate);
    const first = normalized[0]?.close || 0;
    const last = normalized[normalized.length - 1]?.close || 0;
    const variation = first > 0 ? ((last - first) / first) * 100 : 0;

    return res.json({
      source: sourceUrl,
      range: { dataInicial: range.startYmd, dataFinal: range.endYmd },
      stats: {
        points: normalized.length,
        firstClose: Number(first.toFixed(4)),
        lastClose: Number(last.toFixed(4)),
        variationPercent: Number(variation.toFixed(2))
      },
      history: normalized,
      forecast
    });
  } catch (error) {
    return res.status(502).json({ message: error.message || "Falha ao consultar analytics do dólar." });
  }
});

app.post("/api/reconciliation/ofx", requireAuth, upload.any(), (req, res) => {
  const files = (req.files || []).filter((file) => file?.buffer);
  const invalidFiles = files.filter((file) => !/\.(ofx|txt)$/i.test(file.originalname || ""));
  if (!files.length) {
    return res.status(400).json({ message: "Arquivo OFX nao enviado" });
  }
  if (invalidFiles.length) {
    return res.status(400).json({ message: "Envie apenas arquivos OFX ou TXT." });
  }

  const { transactions, filesSummary, duplicatesRemoved } = collectOfxPayloadFromEntries(
    files.map((f) => ({ fileName: f.originalname, buffer: f.buffer }))
  );

  const job = createJob({
    type: "reconciliation.ofx",
    status: "processing",
    filesSummary,
    transactions
  });

  processConciliationFromTransactions(transactions, filesSummary)
    .then((result) => {
      const finished = updateJob(job.id, {
        status: "completed",
        result: buildStoredJobResult(result)
      });
      appendAuditLog({
        actor: resolveActor(req),
        action: "reconciliation.ofx.processed",
        details: { jobId: finished?.id || job.id, files: files.length, total: result.totals.total, duplicatesRemoved }
      });
      return res.json({
        ...result,
        jobId: job.id,
        duplicatesRemoved
      });
    })
    .catch((error) => {
      updateJob(job.id, { status: "failed", error: error.message });
      appendAuditLog({
        actor: resolveActor(req),
        action: "reconciliation.ofx.failed",
        details: { jobId: job.id, error: error.message }
      });
      return res.status(502).json({ message: error.message || "Falha ao conciliar com contas a receber/pagar" });
    });
});

app.post("/api/reconciliation/ofx/folder", requireAuth, (req, res) => {
  try {
    const ofxDir = path.join(__dirname, "ofx");
    if (!fs.existsSync(ofxDir)) {
      return res.status(404).json({ message: "Pasta ofx não encontrada no diretório raiz." });
    }
    const allFiles = fs
      .readdirSync(ofxDir)
      .filter((name) => /\.(ofx|txt)$/i.test(name))
      .map((name) => path.join(ofxDir, name));
    if (!allFiles.length) {
      return res.status(400).json({ message: "Nenhum arquivo OFX encontrado na pasta ofx." });
    }

    const entries = allFiles.map((fullPath) => ({
      fileName: path.basename(fullPath),
      buffer: fs.readFileSync(fullPath)
    }));
    const { transactions, filesSummary, duplicatesRemoved } = collectOfxPayloadFromEntries(entries);

    const job = createJob({
      type: "reconciliation.ofx.folder",
      status: "processing",
      filesSummary,
      transactions
    });

    processConciliationFromTransactions(transactions, filesSummary)
      .then((result) => {
        updateJob(job.id, { status: "completed", result: buildStoredJobResult(result) });
        appendAuditLog({
          actor: resolveActor(req),
          action: "reconciliation.ofx.folder.processed",
          details: { jobId: job.id, files: filesSummary.length, total: result.totals.total, duplicatesRemoved }
        });
        return res.json({ ...result, jobId: job.id, duplicatesRemoved });
      })
      .catch((error) => {
        updateJob(job.id, { status: "failed", error: error.message });
        return res.status(502).json({ message: error.message || "Falha ao processar OFX da pasta." });
      });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Erro ao ler pasta OFX." });
  }
});

app.get("/api/reconciliation/catalogs", requireAuth, async (_req, res) => {
  try {
    const catalogs = await loadReconciliationCatalogsFromNodeApi();
    return res.json(catalogs);
  } catch (error) {
    return res.status(502).json({ message: error.message || "Falha ao consultar catálogos financeiros." });
  }
});

app.post("/api/reconciliation/insert", requireAuth, async (req, res) => {
  try {
    const { transactions } = req.body || {};

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ message: "Nenhuma transacao para inserir" });
    }

    const result = await insertTransactions(transactions);
    appendAuditLog({
      actor: resolveActor(req),
      action: "reconciliation.insert",
      details: { count: transactions.length, mode: result.mode }
    });
    return res.status(201).json({ message: "Transacoes inseridas com sucesso", result });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Erro ao inserir transacoes" });
  }
});

app.post("/api/reconciliation/settle", requireAuth, async (req, res) => {
  try {
    const transactions = Array.isArray(req.body?.transactions) ? req.body.transactions : [];
    if (!transactions.length) {
      return res.status(400).json({ message: "Nenhuma transação selecionada para baixa manual." });
    }

    const invalid = transactions.find((tx) => !tx?.matched?.entityType || !Array.isArray(tx?.matched?.items) || !tx.matched.items.length);
    if (invalid) {
      return res.status(400).json({ message: `Há transações sem match válido para baixa: ${getSettlementReference(invalid)}.` });
    }

    const config = normalizeSettlementConfig(req.body?.config);
    const validationErrors = validateSettlementRequest(transactions, config);
    if (validationErrors.length) {
      return res.status(400).json({ message: validationErrors.join(" ") });
    }

    const results = [];
    for (const tx of transactions) {
      try {
        const result = await settleConciliationTransaction(tx, config);
        results.push(result);
      } catch (error) {
        results.push({
          clientKey: buildConciliationTxKey(tx),
          entityType: tx?.matched?.entityType || "desconhecido",
          status: "error",
          endpoint: tx?.matched?.entityType === "receber" ? "incluirrcm" : tx?.matched?.entityType === "pagar" ? "incluircpm" : "",
          itemCount: getSettlementItems(tx).length,
          processedAt: new Date().toISOString(),
          message: error.message || "Falha ao registrar baixa no TopManager."
        });
      }
    }

    const successCount = results.filter((item) => item.status === "success").length;
    const failureCount = results.length - successCount;
    appendAuditLog({
      actor: resolveActor(req),
      action: "reconciliation.settle.manual",
      details: {
        selected: transactions.length,
        successCount,
        failureCount,
        config
      }
    });

    return res.json({
      message:
        failureCount === 0
          ? `Baixa manual concluída para ${successCount} item(ns).`
          : `Baixa manual processada com ${successCount} sucesso(s) e ${failureCount} erro(s).`,
      successCount,
      failureCount,
      results
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Erro ao processar baixa manual." });
  }
});

app.get("/api/reconciliation/history", requireAuth, (_req, res) => {
  const data = listInsertedTransactions();
  res.json(data);
});

app.get("/api/reconciliation/jobs", requireAuth, (req, res) => {
  res.json(listJobs(req.query.limit || 100));
});

app.get("/api/reconciliation/accumulated", requireAuth, (_req, res) => {
  res.json(getAccumulatedOfx());
});

app.post("/api/reconciliation/accumulated", requireAuth, (req, res) => {
  const transactions = Array.isArray(req.body?.transactions) ? req.body.transactions : [];
  if (!transactions.length) {
    return res.status(400).json({ message: "Nenhuma transação enviada para acumular." });
  }
  const next = addAccumulatedOfx(transactions);
  appendAuditLog({
    actor: resolveActor(req),
    action: "reconciliation.accumulated.add",
    details: { count: transactions.length, totalStored: next.length }
  });
  return res.status(201).json({ count: next.length, items: next });
});

app.delete("/api/reconciliation/accumulated", requireAuth, (req, res) => {
  const next = clearAccumulatedOfx();
  appendAuditLog({
    actor: resolveActor(req),
    action: "reconciliation.accumulated.clear",
    details: { totalStored: next.length }
  });
  return res.json({ count: next.length, items: next });
});

app.post("/api/reconciliation/jobs/:jobId/reprocess", requireAuth, async (req, res) => {
  const baseJob = getJob(req.params.jobId);
  if (!baseJob) {
    return res.status(404).json({ message: "Job não encontrado." });
  }
  if (!Array.isArray(baseJob.transactions) || !baseJob.transactions.length) {
    return res.status(400).json({ message: "Job não possui transações para reprocessar." });
  }
  const newJob = createJob({
    type: "reconciliation.ofx.reprocess",
    status: "processing",
    sourceJobId: baseJob.id,
    filesSummary: baseJob.filesSummary || [],
    transactions: baseJob.transactions
  });
  try {
    const result = await processConciliationFromTransactions(baseJob.transactions, baseJob.filesSummary || []);
    updateJob(newJob.id, { status: "completed", result: buildStoredJobResult(result) });
    appendAuditLog({
      actor: resolveActor(req),
      action: "reconciliation.reprocess",
      details: { sourceJobId: baseJob.id, newJobId: newJob.id, total: result.totals.total }
    });
    return res.json({ ...result, jobId: newJob.id, sourceJobId: baseJob.id });
  } catch (error) {
    updateJob(newJob.id, { status: "failed", error: error.message });
    return res.status(502).json({ message: error.message || "Falha ao reprocessar conciliação." });
  }
});

app.post("/api/audit", requireAuth, (req, res) => {
  const payload = appendAuditLog({
    actor: resolveActor(req, "frontend"),
    action: req.body?.action || "ui.event",
    details: req.body?.details || {}
  });
  res.status(201).json(payload);
});

app.get("/api/audit", requireAuth, (req, res) => {
  res.json(listAuditLogs(req.query.limit || 200));
});

app.get("/api/health", (_req, res) => {
  cleanupSessions();
  res.json({
    status: "ok",
    startedAt: metrics.startedAt,
    now: new Date().toISOString(),
    sessions: sessions.size,
    metrics
  });
});

app.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "Arquivo OFX excede o limite permitido." });
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(413).json({ message: "Quantidade de arquivos OFX acima do limite permitido." });
    }
    return res.status(400).json({ message: "Falha ao processar upload OFX." });
  }
  return next(error);
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
