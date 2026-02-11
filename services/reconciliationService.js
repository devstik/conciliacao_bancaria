const fs = require("fs");
const path = require("path");

const storePath = path.join(__dirname, "..", "data", "store.json");

function readStore() {
  const raw = fs.readFileSync(storePath, "utf8");
  return JSON.parse(raw);
}

function saveStore(nextStore) {
  fs.writeFileSync(storePath, JSON.stringify(nextStore, null, 2), "utf8");
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

module.exports = { insertTransactions, listInsertedTransactions };
