/** Manufacturing order quantity math with exact 0.001-unit input precision. */
export function milli(value: string | number): bigint {
  const text = String(value);
  if (!/^\d{1,9}(?:\.\d{1,3})?$/.test(text)) throw new Error("INVALID_MANUFACTURING_QUANTITY");
  const [whole,fraction=""]=text.split(".");
  const units=BigInt(whole)*1000n + BigInt(fraction.padEnd(3,"0"));
  if (units<=0n) throw new Error("INVALID_MANUFACTURING_QUANTITY");
  return units;
}
export function requiredMaterial(perBatch: number, outputBatch: number, plannedOutput: number): number {
  const a=milli(perBatch),b=milli(outputBatch),c=milli(plannedOutput);
  const n=a*c;
  if(n%b!==0n)throw new Error("BOM_FRACTIONAL_QUANTITY");
  const units=n/b;
  if(units<=0n || units>100000000000n)throw new Error("BOM_QUANTITY_TOO_LARGE");
  return Number(units)/1000;
}
export function productionUnitCost(materials: Array<{ quantity: number; unitCost: number }>, output: number) {
  if (!Number.isFinite(output)||output<=0)throw new Error("PRODUCTION_INVALID_OUTPUT");
  let totalCents=0;
  for(const m of materials){
    if (![m.quantity,m.unitCost].every(Number.isFinite)||m.quantity<=0||m.unitCost<0)
      throw new Error("PRODUCTION_INVALID_COST");
    totalCents+=Math.round(m.quantity*m.unitCost*100);
  }
  if (!Number.isSafeInteger(totalCents))throw new Error("PRODUCTION_COST_OVERFLOW");
  return { totalCost:totalCents/100, unitCost:Math.round(totalCents/output)/100 };
}
