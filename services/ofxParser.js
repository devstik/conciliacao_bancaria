function getTagValue(block, tag) {
  const xmlPattern = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
  const xmlMatch = block.match(xmlPattern);
  if (xmlMatch?.[1]) return xmlMatch[1].trim();

  const sgmlPattern = new RegExp(`<${tag}>\\s*([^\\r\\n<]+)`, "i");
  const sgmlMatch = block.match(sgmlPattern);
  return sgmlMatch ? sgmlMatch[1].trim() : "";
}

function normalizeAmount(rawAmount) {
  if (!rawAmount) return 0;
  const value = String(rawAmount).trim().replace(/\s+/g, "");
  const hasComma = value.includes(",");
  const hasDot = value.includes(".");
  let normalized = value;

  if (hasComma && hasDot) {
    const lastComma = value.lastIndexOf(",");
    const lastDot = value.lastIndexOf(".");
    if (lastComma > lastDot) {
      normalized = value.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = value.replace(/,/g, "");
    }
  } else if (hasComma) {
    normalized = value.replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeOfxDate(rawDate) {
  if (!rawDate) return null;
  const clean = String(rawDate).replace(/[^0-9]/g, "").slice(0, 14);
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
  const blocks = content.match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|$)/gi) || [];

  const metadata = {
    bankName: getTagValue(content, "ORG") || "Banco não identificado",
    bankCode: getTagValue(content, "BANKID"),
    accountId: getTagValue(content, "ACCTID"),
    accountType: getTagValue(content, "ACCTTYPE"),
    currency: getTagValue(content, "CURDEF"),
    periodStart: normalizeOfxDate(getTagValue(content, "DTSTART")),
    periodEnd: normalizeOfxDate(getTagValue(content, "DTEND"))
  };

  for (const block of blocks) {
    const amount = normalizeAmount(getTagValue(block, "TRNAMT"));
    const memo = getTagValue(block, "MEMO");

    transactions.push({
      bankName: metadata.bankName,
      bankCode: metadata.bankCode,
      accountId: metadata.accountId,
      accountType: metadata.accountType,
      transactionType: getTagValue(block, "TRNTYPE") || "UNKNOWN",
      postedAt: normalizeOfxDate(getTagValue(block, "DTPOSTED")),
      amount,
      fitId: getTagValue(block, "FITID"),
      documentNumber: getTagValue(block, "CHECKNUM"),
      name: getTagValue(block, "NAME") || memo || "Sem descrição",
      memo,
      direction: amount >= 0 ? "entrada" : "saida"
    });
  }

  return { metadata, transactions };
}

module.exports = { parseOfxTransactions };
