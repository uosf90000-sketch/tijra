/** Approximate operating contribution from recorded sale lines and explicitly logged waste.
 * Excludes taxes, payroll, payment fees and other unallocated expenses.
 */
export type ShieldLine = { id: string; name: string; qty: number; price: number; cost: number };
export type ShieldWaste = { id: string; qty: number; unitCost: number };
export function summarizeProfitShield(lines: ShieldLine[], waste: ShieldWaste[]) {
  const map = new Map<string, { id:string; name:string; qty:number; revenue:number; cost:number; waste:number }>();
  for (const x of lines) {
    if (![x.qty,x.price,x.cost].every(Number.isFinite) || x.qty<=0 || x.price<0 || x.cost<0)
      throw new Error("INVALID_SALE");
    const v = map.get(x.id) || {id:x.id,name:x.name,qty:0,revenue:0,cost:0,waste:0};
    v.qty+=x.qty; v.revenue+=Math.round(x.qty*x.price*100); v.cost+=Math.round(x.qty*x.cost*100);
    map.set(x.id,v);
  }
  for (const x of waste) {
    if (![x.qty,x.unitCost].every(Number.isFinite) || x.qty<0 || x.unitCost<0)
      throw new Error("INVALID_WASTE");
    const v=map.get(x.id);
    if(v) v.waste+=Math.round(x.qty*x.unitCost*100);
  }
  const products=[...map.values()].map(x=>({
    id:x.id,name:x.name,qty:x.qty,revenue:x.revenue/100,cost:x.cost/100,
    waste:x.waste/100,gross:(x.revenue-x.cost)/100,
    afterWaste:(x.revenue-x.cost-x.waste)/100,
    margin:x.revenue>0 ? Math.round((x.revenue-x.cost)/x.revenue*1000)/10 : null,
  })).sort((a,b)=>a.afterWaste-b.afterWaste);
  const total=products.reduce((s,x)=>({
    revenue:s.revenue+x.revenue,cost:s.cost+x.cost,waste:s.waste+x.waste,
    gross:s.gross+x.gross,afterWaste:s.afterWaste+x.afterWaste,
  }),{revenue:0,cost:0,waste:0,gross:0,afterWaste:0});
  return {products,total};
}
