const fs = require("fs");
const path = require("path");

const storePath = path.join(__dirname, "..", "data", "store.json");

function normalizeStore(raw) {
  return {
    insertedTransactions: Array.isArray(raw?.insertedTransactions) ? raw.insertedTransactions : [],
    auditLogs: Array.isArray(raw?.auditLogs) ? raw.auditLogs : [],
    jobs: Array.isArray(raw?.jobs) ? raw.jobs : [],
    accumulatedOfx: Array.isArray(raw?.accumulatedOfx) ? raw.accumulatedOfx : [],
    fichaClienteAnalises: raw?.fichaClienteAnalises && typeof raw.fichaClienteAnalises === "object" ? raw.fichaClienteAnalises : {}
  };
}

function readStore() {
  ensureStoreFile();
  const raw = fs.readFileSync(storePath, "utf8");
  return normalizeStore(JSON.parse(raw));
}

function saveStore(nextStore) {
  ensureStoreFile();
  const tempPath = `${storePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(normalizeStore(nextStore), null, 2), "utf8");
  fs.renameSync(tempPath, storePath);
}

function ensureStoreFile() {
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify(normalizeStore({}), null, 2), "utf8");
  }
}

function summarizeJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    sourceJobId: job.sourceJobId || null,
    error: job.error || null,
    filesSummary: Array.isArray(job.filesSummary) ? job.filesSummary : [],
    result: job.result
      ? {
          totals: job.result.totals || null,
          matchingSummary: job.result.matchingSummary || null
        }
      : null
  };
}

async function insertTransactions(transactions) {
  const payload = {
    source: "plataforma-financeira",
    importedAt: new Date().toISOString(),
    transactions
  };

  const targetUrl = process.env.DB_POST_URL;

  if (targetUrl) {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Falha ao enviar para ${targetUrl}: ${response.status} ${body}`);
    }

    return { mode: "remote", targetUrl, count: transactions.length };
  }

  const currentStore = readStore();
  const inserted = transactions.map((item) => ({
    ...item,
    insertedAt: new Date().toISOString(),
    id: `${item.fitId || "sem-fitid"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }));

  currentStore.insertedTransactions = [...inserted, ...currentStore.insertedTransactions];
  saveStore(currentStore);

  return { mode: "local", count: transactions.length };
}

function listInsertedTransactions() {
  const currentStore = readStore();
  return currentStore.insertedTransactions;
}

function appendAuditLog(entry) {
  const currentStore = readStore();
  const payload = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...entry
  };
  currentStore.auditLogs.unshift(payload);
  currentStore.auditLogs = currentStore.auditLogs.slice(0, 2000);
  saveStore(currentStore);
  return payload;
}

function listAuditLogs(limit = 200) {
  const currentStore = readStore();
  return currentStore.auditLogs.slice(0, Number(limit) || 200);
}

function createJob(job) {
  const currentStore = readStore();
  const payload = {
    id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...job
  };
  currentStore.jobs.unshift(payload);
  currentStore.jobs = currentStore.jobs.slice(0, 300);
  saveStore(currentStore);
  return payload;
}

function updateJob(jobId, patch) {
  const currentStore = readStore();
  const index = currentStore.jobs.findIndex((job) => job.id === jobId);
  if (index < 0) return null;
  const next = {
    ...currentStore.jobs[index],
    ...patch,
    updatedAt: new Date().toISOString()
  };
  currentStore.jobs[index] = next;
  saveStore(currentStore);
  return next;
}

function getJob(jobId) {
  const currentStore = readStore();
  return currentStore.jobs.find((job) => job.id === jobId) || null;
}

function listJobs(limit = 100) {
  const currentStore = readStore();
  return currentStore.jobs.slice(0, Number(limit) || 100).map(summarizeJob);
}

function getAccumulatedOfx() {
  const currentStore = readStore();
  return currentStore.accumulatedOfx;
}

function addAccumulatedOfx(transactions) {
  const currentStore = readStore();
  const items = Array.isArray(transactions) ? transactions : [];
  currentStore.accumulatedOfx = [...currentStore.accumulatedOfx, ...items];
  saveStore(currentStore);
  return currentStore.accumulatedOfx;
}

function clearAccumulatedOfx() {
  const currentStore = readStore();
  currentStore.accumulatedOfx = [];
  saveStore(currentStore);
  return currentStore.accumulatedOfx;
}

function getFichaClienteAnaliseKey(rowOrId) {
  if (rowOrId && typeof rowOrId === "object") {
    return String(rowOrId.id || "").trim();
  }
  return String(rowOrId || "").trim();
}

function saveFichaClienteAnaliseActor(id, actor) {
  const key = getFichaClienteAnaliseKey(id);
  if (!key || !actor) return null;

  const currentStore = readStore();
  const payload = {
    analisadoPor: actor,
    analisadoEm: new Date().toISOString()
  };
  currentStore.fichaClienteAnalises[key] = payload;
  saveStore(currentStore);
  return payload;
}

function applyFichaClienteAnaliseActor(row) {
  if (!row || typeof row !== "object") return row;
  const currentStore = readStore();
  const key = getFichaClienteAnaliseKey(row);
  const override = currentStore.fichaClienteAnalises[key];
  if (!override) return row;
  return {
    ...row,
    analisadoPor: override.analisadoPor || row.analisadoPor,
    analisadoEm: override.analisadoEm || row.analisadoEm
  };
}

function applyFichaClienteAnaliseActors(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(applyFichaClienteAnaliseActor);
}

module.exports = {
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
  clearAccumulatedOfx,
  saveFichaClienteAnaliseActor,
  applyFichaClienteAnaliseActor,
  applyFichaClienteAnaliseActors
};
