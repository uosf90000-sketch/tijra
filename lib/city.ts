export function normalizeCityKey(value: string | null | undefined) {
  if (!value) return "";

  return value
    .trim()
    .toLocaleLowerCase("ar-SA")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ـ/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^مدينه\s+/, "")
    .trim();
}
