export type LedgerLineInput = {
  accountId: string;
  side: "DEBIT" | "CREDIT";
  amount: string;
  description?: string;
};

export type SaleLedgerMapping = {
  cashAccountId: string; cardAccountId: string; transferAccountId: string;
  otherAccountId: string; revenueAccountId: string; cogsAccountId: string;
  inventoryAccountId: string;
};

export function buildSaleLedgerDraft(sale: {
  total: string; costTotal: string; paymentMethod: "CASH" | "CARD" | "TRANSFER" | "OTHER";
}, map: SaleLedgerMapping): LedgerLineInput[] {
  const parse = (amount: string) => {
    if (!/^\d{1,12}\.\d{2}$/.test(amount)) throw new Error("INVALID_SALE_DECIMAL");
    return BigInt(amount.replace(".", ""));
  };
  const revenue = parse(sale.total), cost = parse(sale.costTotal);
  if (revenue === 0n && cost === 0n) throw new Error("ZERO_SALE_NO_JOURNAL");
  const amount = (n: bigint) => (n / 100n) + "." + (n % 100n).toString().padStart(2, "0");
  const accountForPayment = {
    CASH: map.cashAccountId, CARD: map.cardAccountId,
    TRANSFER: map.transferAccountId, OTHER: map.otherAccountId,
  }[sale.paymentMethod];
  const lines: LedgerLineInput[] = [];
  if (revenue > 0n) lines.push(
    { accountId: accountForPayment, side: "DEBIT", amount: amount(revenue), description: "تحصيل/تسوية بيع مسجل — غير متحقق بنكيًا" },
    { accountId: map.revenueAccountId, side: "CREDIT", amount: amount(revenue), description: "إيراد البيع الإجمالي — لا يفصل ضريبة القيمة المضافة" },
  );
  if (cost > 0n) lines.push(
    { accountId: map.cogsAccountId, side: "DEBIT", amount: amount(cost), description: "تكلفة البضاعة/المكونات المباعة" },
    { accountId: map.inventoryAccountId, side: "CREDIT", amount: amount(cost), description: "خفض قيمة المخزون الدفتري" },
  );
  const debits = lines.filter((line) => line.side === "DEBIT")
    .reduce((sum, line) => sum + parse(line.amount), 0n);
  const credits = lines.filter((line) => line.side === "CREDIT")
    .reduce((sum, line) => sum + parse(line.amount), 0n);
  if (debits <= 0n || debits !== credits) throw new Error("UNBALANCED_JOURNAL");
  if (lines.some((line) => !line.accountId)) throw new Error("UNMAPPED_ACCOUNT");
  return lines;
}

export const saleLedgerAccountKinds = {
  cashAccountId: "ASSET", cardAccountId: "ASSET", transferAccountId: "ASSET",
  otherAccountId: "ASSET", revenueAccountId: "REVENUE",
  cogsAccountId: "EXPENSE", inventoryAccountId: "ASSET",
} as const;
