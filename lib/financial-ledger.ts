/**
 * Accurate money math for Saudi Riyals. Keep amounts as decimal strings and
 * accumulate halalas as bigint. Never use floating point to prove balance.
 */
export type LedgerLineInput = {
  accountId: string;
  side: "DEBIT" | "CREDIT";
  amount: string;
  description?: string;
};

export function amountHalalas(value: string): bigint {
  const match = /^(\d{1,15})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error("INVALID_LEDGER_AMOUNT");
  const amount = BigInt(match[1]) * 100n + BigInt((match[2] || "").padEnd(2, "0"));
  if (amount <= 0n) throw new Error("NONPOSITIVE_LEDGER_AMOUNT");
  return amount;
}

export function balancedJournal(lines: readonly LedgerLineInput[]) {
  if (lines.length < 2 || lines.length > 500) throw new Error("JOURNAL_LINES_OUT_OF_RANGE");
  let debit = 0n, credit = 0n;
  for (const line of lines) {
    const amount = amountHalalas(line.amount);
    if (!line.accountId.trim()) throw new Error("JOURNAL_ACCOUNT_REQUIRED");
    if (line.side === "DEBIT") debit += amount;
    else if (line.side === "CREDIT") credit += amount;
    else throw new Error("JOURNAL_SIDE_INVALID");
  }
  if (debit === 0n || credit === 0n || debit !== credit) throw new Error("UNBALANCED_JOURNAL");
  return { debitHalalas: debit, creditHalalas: credit };
}

export function canPostJournal(input: {
  status: string;
  periodStatus: string;
  createdByUserId: string;
  actorUserId: string;
  actorRole: string;
  dualApproval: boolean;
}) {
  return input.status === "DRAFT" && input.periodStatus === "OPEN" &&
    ["OWNER", "ACCOUNTANT"].includes(input.actorRole) &&
    (!input.dualApproval || input.createdByUserId !== input.actorUserId);
}

export function dateWithinPeriod(value: Date, start: Date, end: Date) {
  const time = value.getTime();
  return Number.isFinite(time) && time >= start.getTime() && time <= end.getTime();
}
