const arabicDigits: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

export function normalizeInvoiceText(value: string) {
  return value
    .replace(/[٠-٩۰-۹]/g, (char) => arabicDigits[char] ?? char)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function numbersFromLine(line: string) {
  return [...line.matchAll(/(?:SAR|ر\.?\s?س\.?|﷼)?\s*(-?\d[\d,]*(?:\.\d{1,3})?)/gi)]
    .map((match) => Number((match[1] ?? "").replace(/,/g, "")))
    .filter((value) => Number.isFinite(value));
}

function findMoney(lines: string[], keywords: RegExp) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!keywords.test(lines[index])) continue;
    const values = numbersFromLine(lines[index]);
    if (values.length) return values[values.length - 1];
  }
  return null;
}

export function parseInvoiceText(rawText: string) {
  const text = normalizeInvoiceText(rawText);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  const invoiceNumber = lines
    .map((line) => line.match(/(?:invoice\s*(?:no\.?|number)?|رقم\s*الفاتورة|فاتورة\s*رقم)\s*[:#-]?\s*([A-Z0-9\/-]{2,})/i)?.[1])
    .find(Boolean) ?? null;

  const taxNumber = text.match(/(?:VAT|TIN|الرقم\s*الضريبي|الرقم\s*الضريبى)\D{0,20}(\d{15})/i)?.[1]
    ?? text.match(/\b(3\d{13}3)\b/)?.[1]
    ?? null;

  const total = findMoney(lines, /(grand\s*total|total\s*due|الإجمالي|الاجمالي|المجموع|إجمالي\s*الفاتورة)/i);
  const vat = findMoney(lines, /(vat|tax|ضريبة|الضريبة)/i);

  const candidateItemLines = lines
    .filter((line) => /[A-Za-z\u0600-\u06FF]/.test(line) && numbersFromLine(line).length >= 1)
    .slice(0, 80)
    .map((line) => ({ line, numbers: numbersFromLine(line) }));

  return {
    invoiceNumber,
    taxNumber,
    total,
    vat,
    candidateItemLines,
    rawText: text,
  };
}
