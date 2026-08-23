import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  PackageCheck,
  ShoppingCart,
  Store,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { firstPermissionHref } from "@/lib/access";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

export const dynamic = "force-dynamic";

function monthStart() {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function orderDate(order: { receivedAt: Date | null; createdAt: Date }) {
  return order.receivedAt ?? order.createdAt;
}

function shortDate(date: Date) {
  return new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

type PartnerStat = {
  id: string;
  name: string;
  city?: string | null;
  total: number;
  count: number;
  lastOrder: Date;
};

type SmartInsight = {
  title: string;
  note: string;
  href: string;
  tone?: "warning" | "danger" | "good";
  icon: typeof Store;
};

type StatStripItem = {
  label: string;
  value: string;
  note: string;
  icon: typeof Store;
  href?: string;
};

function sortPartners(values: PartnerStat[]) {
  return values.sort((a, b) => b.total - a.total);
}

function StatStrip({ items }: { items: StatStripItem[] }) {
  return <section className="dashboardStatStrip">{items.map(({ label, value, note, icon: Icon, href }) => {
    const content = <><span className="dashboardStripIcon"><Icon size={18} /></span><span className="dashboardStripLabel">{label}</span><strong>{value}</strong><small>{note}</small></>;
    return href
      ? <Link className="dashboardStripItem dashboardStripLink" href={href} key={label}>{content}</Link>
      : <article className="dashboardStripItem" key={label}>{content}</article>;
  })}</section>;
}

function SmartInsights({ items }: { items: SmartInsight[] }) {
  return <section className="smartOwnerPanel">
    <div className="smartOwnerPanelHead"><div><span className="dashboardEyebrow">تنبيهات ذكية</span><h2>الأشياء التي تحتاج انتباهك فقط</h2></div><span>{items.length ? `${items.length} ملاحظة` : "كل شيء جيد"}</span></div>
    {items.length ? <div className="smartOwnerList">{items.map(({ title, note, href, tone = "warning", icon: Icon }) => <Link href={href} className={`smartOwnerInsight ${tone}`} key={`${href}-${title}`}><span className="smartOwnerInsightIcon"><Icon size={19} /></span><div><strong>{title}</strong><span>{note}</span></div></Link>)}</div> : <div className="smartOwnerAllGood"><PackageCheck size={20} /><div><strong>ما عندك شيء عاجل الآن</strong><span>إذا ظهر نقص مخزون أو طلب يحتاج متابعة أو فرق جرد، يظهر هنا تلقائيًا.</span></div></div>}
  </section>;
}

function RankBars({ rows, empty }: { rows: PartnerStat[]; empty: string }) {
  const max = rows[0]?.total ?? 0;
  if (!rows.length) return <div className="dashboardEmpty">{empty}</div>;
  return <div className="dashboardRankList">{rows.slice(0, 3).map((row, index) => { const width = max > 0 ? Math.max(16, Math.round((row.total / max) * 100)) : 0; return <div className="dashboardRankRow" key={row.id}><span className="dashboardRankNumber">{index + 1}</span><div className="dashboardRankMain"><div className="dashboardRankTitle"><strong>{row.name}</strong><span>{formatSar(row.total)}</span></div><div className="dashboardRankTrack"><span style={{ width: `${width}%` }} /></div></div></div>; })}</div>;
}

function InventoryBars({ quantities }: { quantities: number[] }) {
  const values = quantities.length ? quantities.slice(0, 9) : [1, 1, 1, 1, 1, 1, 1];
  const max = Math.max(1, ...values);
  return <div className="inventoryMiniChart" aria-hidden="true">{values.map((value, index) => <span key={index} style={{ height: `${Math.max(18, (value / max) * 100)}%` }} />)}</div>;
}

function Donut({ percent }: { percent: number }) {
  const safe = Math.max(0, Math.min(100, Math.round(percent)));
  return <div className="dashboardDonut" style={{ "--donut": `${safe * 3.6}deg` } as React.CSSProperties}><div><strong>{safe}%</strong><span>مكتمل</span></div></div>;
}

async function RetailerDashboard({ businessId, firstName }: { businessId: string; firstName: string }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const auditSince = daysAgo(30);
  const [activeOrders, products, todaySales, countEvents] = await Promise.all([
    db.marketplaceOrder.findMany({ where: { buyerBusinessId: businessId, status: { in: ["PLACED", "ACCEPTED"] } }, select: { id: true, status: true } }),
    db.product.findMany({ where: { businessId, active: true }, orderBy: { quantity: "asc" }, take: 500 }),
    db.sale.findMany({ where: { businessId, soldAt: { gte: today } }, select: { total: true, costTotal: true } }),
    db.inventoryAuditEvent.findMany({ where: { businessId, action: "STORE_COUNT", occurredAt: { gte: auditSince } }, select: { itemName: true }, take: 1000 }),
  ]);

  const stockValue = products.reduce((sum, item) => sum + Number(item.quantity) * Number(item.averageCost), 0);
  const lowStock = products.filter((item) => Number(item.quantity) > 0 && Number(item.quantity) <= Math.max(1, Number(item.reorderPoint))).length;
  const outOfStock = products.filter((item) => Number(item.quantity) <= 0).length;
  const countedProducts = new Set(countEvents.map((event) => event.itemName).filter(Boolean)).size;
  const auditProgress = products.length ? (countedProducts / products.length) * 100 : 100;
  const todaySalesTotal = todaySales.reduce((sum, sale) => sum + Number(sale.total), 0);
  const todayProfit = todaySales.reduce((sum, sale) => sum + Number(sale.total) - Number(sale.costTotal), 0);

  const insights: SmartInsight[] = [];
  if (outOfStock > 0) insights.push({ title: `${outOfStock} أصناف نافدة`, note: "راجعها قبل ما تؤثر على البيع.", href: "/inventory", tone: "danger", icon: Boxes });
  if (lowStock > 0) insights.push({ title: `${lowStock} أصناف قربت تخلص`, note: "تقدر تراجع السوق والطلب حسب حاجتك.", href: "/marketplace", tone: "warning", icon: AlertTriangle });
  if (activeOrders.length > 0) insights.push({ title: `${activeOrders.length} طلبات قيد التنفيذ`, note: "تابع حالة الطلبات الحالية من مكان واحد.", href: "/marketplace/orders", tone: "warning", icon: ClipboardList });
  if (products.length > 0 && auditProgress < 100) insights.push({ title: "الجرد غير مكتمل", note: `تم جرد ${countedProducts} من ${products.length} صنف خلال آخر 30 يوم.`, href: "/inventory/audit", tone: "warning", icon: ClipboardCheck });
  if (todaySalesTotal > 0 && todayProfit < 0) insights.push({ title: "ربح اليوم يحتاج مراجعة", note: "المبيعات موجودة لكن مجمل الربح سلبي اليوم.", href: "/sales/analytics", tone: "danger", icon: TrendingUp });

  return <main className="approvedDashboard ownerSimpleHome">
    <header className="dashboardGreeting"><div><span>الرئيسية</span><h1>مرحبًا {firstName} 👋</h1><p>الأهم اليوم فقط، والتفاصيل موجودة داخل أقسامها.</p></div><span className="dashboardDate">{new Intl.DateTimeFormat("ar-SA", { dateStyle: "long" }).format(new Date())}</span></header>
    <StatStrip items={[
      { label: "مبيعات اليوم", value: formatSar(todaySalesTotal), note: `${todaySales.length} فاتورة`, icon: ShoppingCart },
      { label: "ربح اليوم", value: formatSar(todayProfit), note: "بعد تكلفة البضاعة", icon: TrendingUp },
      { label: "قيمة المخزون", value: formatSar(stockValue), note: `${products.length} صنف`, icon: Boxes },
      { label: "الطلبات الحالية", value: `${activeOrders.length}`, note: "قيد التنفيذ", icon: ClipboardList, href: "/marketplace/orders" },
    ]} />
    <SmartInsights items={insights} />
  </main>;
}

async function SupplierDashboard({ businessId, firstName }: { businessId: string; firstName: string }) {
  const start = monthStart();
  const dormantCutoff = daysAgo(30);
  const [listings, receivedOrders, activeOrders] = await Promise.all([
    db.marketplaceListing.findMany({ where: { sellerBusinessId: businessId }, orderBy: { updatedAt: "desc" }, take: 500 }),
    db.marketplaceOrder.findMany({ where: { sellerBusinessId: businessId, status: "RECEIVED" }, include: { buyer: true }, orderBy: { createdAt: "desc" }, take: 1000 }),
    db.marketplaceOrder.findMany({ where: { sellerBusinessId: businessId, status: { in: ["PLACED", "ACCEPTED"] } }, select: { expectedTotal: true } }),
  ]);
  const monthOrders = receivedOrders.filter((order) => orderDate(order) >= start);
  const monthSales = monthOrders.reduce((sum, order) => sum + Number(order.expectedTotal), 0);
  const lifetimeSales = receivedOrders.reduce((sum, order) => sum + Number(order.expectedTotal), 0);
  const averageOrder = receivedOrders.length ? lifetimeSales / receivedOrders.length : 0;
  const stockValue = listings.reduce((sum, item) => sum + Number(item.quantity) * Number(item.price), 0);
  const lowStock = listings.filter((item) => Number(item.quantity) > 0 && Number(item.quantity) <= Math.max(5, Number(item.minOrderQty))).length;
  const outOfStock = listings.filter((item) => Number(item.quantity) <= 0).length;
  const healthy = listings.filter((item) => Number(item.quantity) > Math.max(5, Number(item.minOrderQty))).length;
  const stockHealth = listings.length ? (healthy / listings.length) * 100 : 0;
  const buyerMap = new Map<string, PartnerStat>();
  for (const order of receivedOrders) {
    const previous = buyerMap.get(order.buyerBusinessId);
    const date = orderDate(order);
    buyerMap.set(order.buyerBusinessId, { id: order.buyerBusinessId, name: order.buyer.name, city: order.buyer.city, total: (previous?.total ?? 0) + Number(order.expectedTotal), count: (previous?.count ?? 0) + 1, lastOrder: previous && previous.lastOrder > date ? previous.lastOrder : date });
  }
  const buyers = sortPartners(Array.from(buyerMap.values()));
  const topBuyer = buyers[0];
  const dormantBuyers = buyers.filter((buyer) => buyer.lastOrder < dormantCutoff).sort((a, b) => a.lastOrder.getTime() - b.lastOrder.getTime());
  const quantities = listings.map((item) => Number(item.quantity));

  return <main className="approvedDashboard">
    <header className="dashboardGreeting"><div><span>لوحة المورد</span><h1>مرحبًا {firstName} 👋</h1><p>هكذا يبدو أداء مبيعاتك ومخزونك اليوم.</p></div><span className="dashboardDate">{new Intl.DateTimeFormat("ar-SA", { dateStyle: "long" }).format(new Date())}</span></header>
    <StatStrip items={[
      { label: "مبيعات الشهر", value: formatSar(monthSales), note: `${monthOrders.length} طلب مستلم`, icon: ShoppingCart },
      { label: "الطلبات النشطة", value: `${activeOrders.length}`, note: "بانتظار الإجراء", icon: ClipboardList, href: "/marketplace/seller#orders" },
      { label: "قيمة المخزون", value: formatSar(stockValue), note: `${listings.length} منتج معروض`, icon: Boxes },
      { label: "متوسط الطلب", value: formatSar(averageOrder), note: `${buyers.length} تاجر`, icon: TrendingUp },
    ]} />
    <section className="dashboardFeatureGrid">
      <article className="dashboardCard dashboardSupplierCard"><div className="dashboardCardHeading"><div><span className="dashboardEyebrow">أفضل عميل</span><h2>{topBuyer?.name ?? "لا توجد مبيعات بعد"}</h2></div><span className="dashboardCardIcon teal"><UsersRound size={20} /></span></div>{topBuyer ? <div className="dashboardSupplierStats"><div><span>إجمالي مشترياته</span><strong>{formatSar(topBuyer.total)}</strong></div><div><span>عدد الطلبات</span><strong>{topBuyer.count}</strong></div><div className="dashboardSupplierLast"><span>آخر شراء</span><strong>{shortDate(topBuyer.lastOrder)}</strong></div></div> : <div className="dashboardEmpty">يظهر هنا أكثر تاجر يشتري منك بعد أول طلب مستلم.</div>}</article>
      <article className="dashboardCard"><div className="dashboardCardHeading"><div><span className="dashboardEyebrow">العملاء</span><h2>أعلى التجار شراءً</h2></div><span className="dashboardCardIcon teal"><UsersRound size={20} /></span></div><RankBars rows={buyers} empty="لا توجد مبيعات مستلمة بعد." /></article>
      <article className="dashboardCard dashboardInventoryCard"><div className="dashboardCardHeading"><div><span className="dashboardEyebrow">المخزون</span><h2>{formatSar(stockValue)}</h2><p>قيمة المخزون المعروض</p></div><span className="dashboardCardIcon"><Boxes size={20} /></span></div><InventoryBars quantities={quantities} /><div className="inventorySignals"><span><b>{lowStock}</b> منخفض</span><span className="danger"><b>{outOfStock}</b> نافد</span></div></article>
      <article className="dashboardCard dashboardAuditCard"><div className="dashboardCardHeading"><div><span className="dashboardEyebrow">صحة المخزون</span><h2>التغطية الحالية</h2><p>{healthy} صنف بحالة جيدة</p></div><span className="dashboardCardIcon teal"><PackageCheck size={20} /></span></div><Donut percent={stockHealth} /></article>
    </section>
    <section className="dashboardWideCard dashboardDormantCard"><div className="dashboardCardHeading"><div><span className="dashboardEyebrow danger">يحتاج متابعة</span><h2>تجار توقفوا عن الشراء منك</h2><p>سبق لهم استلام طلب ولم يسجلوا شراءً جديدًا منذ 30 يومًا أو أكثر.</p></div><span className="dashboardAlertCount"><AlertTriangle size={15} /> {dormantBuyers.length}</span></div>{dormantBuyers.length ? <div className="dormantCompactList">{dormantBuyers.slice(0, 5).map((buyer) => <div key={buyer.id}><span className="dormantInitial">{buyer.name.slice(0, 1)}</span><div><strong>{buyer.name}</strong><small>آخر شراء {shortDate(buyer.lastOrder)} · {buyer.count} طلب</small></div><b>{formatSar(buyer.total)}</b></div>)}</div> : <div className="dashboardEmpty">ممتاز — لا يوجد تاجر سابق مضى على آخر شرائه 30 يومًا حتى الآن.</div>}</section>
  </main>;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (context.membership.role === "STAFF") redirect(firstPermissionHref(context.membership));
  const params = await searchParams;
  const firstName = context.user.name.split(" ")[0];
  const businessType = context.business.businessType;
  const requestedMode = params.mode === "supplier" ? "supplier" : "retailer";
  if (businessType === "SUPPLIER") return <SupplierDashboard businessId={context.business.id} firstName={firstName} />;
  if (businessType === "BOTH" && requestedMode === "supplier") return <SupplierDashboard businessId={context.business.id} firstName={firstName} />;
  return <RetailerDashboard businessId={context.business.id} firstName={firstName} />;
}
