export type PayrollInput = {
  baseSalary: number;
  allowances?: number;
  deductions?: number;
  advances?: number;
};

export function calculateNetSalary(input: PayrollInput) {
  const allowances = input.allowances ?? 0;
  const deductions = input.deductions ?? 0;
  const advances = input.advances ?? 0;
  const gross = input.baseSalary + allowances;
  const totalDeductions = deductions + advances;
  const net = Math.max(0, gross - totalDeductions);

  return { gross, totalDeductions, net };
}

export function calculatePayrollRun(items: PayrollInput[]) {
  return items.reduce(
    (summary, item) => {
      const result = calculateNetSalary(item);
      summary.gross += result.gross;
      summary.deductions += result.totalDeductions;
      summary.net += result.net;
      return summary;
    },
    { gross: 0, deductions: 0, net: 0 },
  );
}
