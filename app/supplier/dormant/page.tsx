import { redirect } from "next/navigation";
import { ClockAlert, RefreshCcw, UsersRound } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

export const metadata = { title: "تجار توقفوا عن الشراء" };
export const dynamic = "force-dynamic";

type Buyer = { id: string; name: string; city: string | null; total: number; count: number; lastOrder: Date };

export default async function DormantCustomersPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!["SUPPLIER", "BOTH"].includes(context.business.businessType)) redirect("/");
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
  const orders = await db.marketplaceOrder.findMany({ where: { sellerBusinessId: context.business.id, status: "RECEIVED" }, include: { buyer: true }, orderBy: { receivedAt: "desc" }, take: 2000 });
  const map = new Map<string, Buyer>();
  for (const order of orders) {
    const date = order.receivedAt ?? order.createdAt;
    const current = map.get(order.buyerBusinessId);
    if (!current) map.set(order.buyerBusinessId, { id: order.buyerBusinessId, name: order.buyer.name, city: order.buyer.city, total: Number(order.expectedTotal), count: 1, lastOrder: date });
    else { current.total += Number(order.expectedTotal); current.count += 1; if (date > current.lastOrder) current.lastOrder = date; }
  }
  const all = [...map.values()];
  const dormant = all.filter((buyer) => buyer.lastOrder < cutoff).sort((a, b) => a.lastOrder.getTime() - b.lastOrder.getTime());
  const dormantValue = dormant.reduce((sum, buyer) => sum + buyer.total, 0);

  return <><PageHeader eyebrow="العملاء" title="تجار توقفوا عن الشراء" description="التاجر يظهر هنا فقط إذا سبق واشترى منك طلبًا مستلمًا ثم مر 30 يومًا أو أكثر بدون شراء جديد." /><section className="metricsGrid three"><MetricCard label="يحتاجون متابعة" value={`${dormant.length}`} note="30+ يوم بدون شراء" icon={ClockAlert} /><MetricCard label="إجمالي تعاملاتهم السابقة" value={formatSar(dormantValue)} note="قيمة تاريخية" icon={RefreshCcw} tone="amber" /><MetricCard label="كل التجار السابقين" value={`${all.length}`} note="لديهم طلبات مستلمة" icon={UsersRound} tone="blue" /></section><section className="panel tablePanel workflowTable"><div className="panelHeader tableHeader"><div><span className="eyebrow">المتابعة</span><h2>العملاء غير النشطين</h2></div></div><div className="tableScroll"><table className="dataTable"><thead><tr><th>التاجر</th><th>المدينة</th><th>آخر شراء</th><th>منذ</th><th>عدد الطلبات</th><th>إجمالي التعامل</th></tr></thead><tbody>{dormant.map((buyer) => { const days = Math.floor((Date.now() - buyer.lastOrder.getTime()) / 86400000); return <tr key={buyer.id}><td><strong>{buyer.name}</strong></td><td>{buyer.city || "غير محددة"}</td><td>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(buyer.lastOrder)}</td><td className="dangerText">{days} يوم</td><td>{buyer.count}</td><td>{formatSar(buyer.total)}</td></tr>; })}{!dormant.length && <tr><td colSpan={6}><div className="infoNote">ممتاز — لا يوجد تاجر سابق متوقف عن الشراء لأكثر من 30 يوم.</div></td></tr>}</tbody></table></div></section></>;
}
