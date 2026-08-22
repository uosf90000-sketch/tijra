const aliasGroups = [
  ["بيبسي", "بيبيسي", "pepsi"],
  ["كوكا كولا", "كوكاكولا", "coca cola", "coke"],
  ["سفن اب", "سفن أب", "7up", "7 up"],
  ["سبرايت", "sprite"],
  ["ميرندا", "mirinda"],
  ["فانتا", "fanta"],
  ["ماونتن ديو", "ديو", "mountain dew"],
] as const;

export function normalizeProductText(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function expandProductSearchTerms(query: string) {
  const normalized = normalizeProductText(query);
  if (!normalized) return [];

  const terms = new Set<string>([query.trim(), normalized]);

  for (const group of aliasGroups) {
    const normalizedAliases = group.map((alias) => normalizeProductText(alias));
    for (const alias of normalizedAliases) {
      if (!alias || !normalized.includes(alias)) continue;
      for (const replacement of normalizedAliases) {
        terms.add(normalized.replace(alias, replacement));
      }
    }
  }

  return [...terms].filter(Boolean);
}

export function productNameSearchScore(name: string, query: string) {
  const normalizedName = normalizeProductText(name);
  const terms = expandProductSearchTerms(query).map(normalizeProductText).filter(Boolean);
  if (!terms.length) return 0;

  let score = 0;
  for (const term of terms) {
    if (normalizedName === term) score = Math.max(score, 100);
    else if (normalizedName.startsWith(term)) score = Math.max(score, 85);
    else if (normalizedName.includes(term)) score = Math.max(score, 70);

    const tokens = term.split(" ").filter((token) => token.length > 1);
    if (tokens.length > 1 && tokens.every((token) => normalizedName.includes(token))) {
      score = Math.max(score, 78);
    }
  }

  return score;
}
