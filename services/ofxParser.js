function getTagValue(block, tag) {
  const match = block.match(new RegExp(`<${tag}>([^\\r\\n<]+)`, "i"));
  return match ? match[1].trim() : "";
}

function normalizeOfxDate(rawDate) {
  if (!rawDate) return null;
  const clean = rawDate.replace(/[^0-9]/g, "").slice(0, 14);
  if (clean.length < 8) return null;

  const year = clean.slice(0, 4);
  const month = clean.slice(4, 6);
  const day = clean.slice(6, 8);
  const hour = clean.slice(8, 10) || "00";
  const minute = clean.slice(10, 12) || "00";
  const second = clean.slice(12, 14) || "00";

  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

function parseOfxTransactions(ofxRawContent) {
  const content = ofxRawContent.replace(/\r/g, "");
  const transactions = [];
  const blocks = content.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|$)/gi) || [];

  for (const block of blocks) {
    const amount = Number(getTagValue(block, "TRNAMT") || 0);

    transactions.push({
      transactionType: getTagValue(block, "TRNTYPE") || "UNKNOWN",
      postedAt: normalizeOfxDate(getTagValue(block, "DTPOSTED")),
      amount,
      fitId: getTagValue(block, "FITID"),
      documentNumber: getTagValue(block, "CHECKNUM"),
      name: getTagValue(block, "NAME"),
      memo: getTagValue(block, "MEMO"),
      direction: amount >= 0 ? "entrada" : "saida"
    });
  }

  return transactions;
}

module.exports = { parseOfxTransactions };
