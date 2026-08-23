import { redirect } from "next/navigation";
import {
  AlertTriangle,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  LockKeyhole,
  PackageCheck,
  ShoppingBasket,
  ShoppingCart,
  Store,
  Tags,
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

function sortPartners(values: PartnerStat[]) {
  return values.sort((a, b) => b.total - a.total);
}

function StatStrip({ items }: { items: Array<{ label: string; value: string; note: string; icon: typeof Store }> }) {
  return (
    <section className="dashboardStatStrip">
      {items.map(({ label, value, note, icon: Icon }) => (
        <article className="dashboardStripItem" key={label}>
          <span className="dashboardStripIcon"><Icon size={18} /></span>
          <span className="dashboardStripLabel">{label}</span>
          <strong>{value}</strong>
          <small>{note}</small>
        </article>
      ))}
    </section>
  );
}

function RankBars({ rows, empty }: { rows: PartnerStat[]; empty: string }) {
  const max = rows[0]?.total ?? 0;
  if (!rows.length) return <div className="dashboardEmpty">{empty}</div>;
  return (
    <div className="dashboardRankList">
      {rows.slice(0, 3).map((row, index) => {
        const width = max > 0 ? Math.max(16, Math.round((row.total / max) * 100)) : 0;
        return (
          <div className="dashboardRankRow" key={row.id}>
            <span className="dashboardRankNumber">{index + 1}</span>
            <div className="dashboardRankMain">
              <div className="dashboardRankTitle"><strong>{row.name}</strong><span>{formatSar(row.total)}</span></div>
              <div className="dashboardRankTrack"><span style={{ width: `${width}%` }} /></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LockedCard({ title, subtitle, icon: Icon, children }: { title: string; subtitle: string; icon: typeof LockKeyhole; children?: React.ReactNode }) {
  return (
    <article className="dashboardCard dashboardLockedCard">
      <div className="dashboardCardHeading">
        <div><span className="dashboardEyebrow">قريبًا</span><h2>{title}</h2><p>{subtitle}</p></div>
        <span className="dashboardCardIcon"><Icon size={20} /></span>
      </div>
      <div className="dashboardLockedVisual" aria-hidden="true">{children}</div>
      <div className="dashboardGlassLock"><LockKeyhole size={16} /><span>تُفتح مع نظام المتجر وقارئ الباركود</span></div>
    </article>
  );
}

function InventoryBars({ quantities }: { quantities: number[] }) {
  const values = quantities.length ? quantities.slice(0, 9) : [2, 4, 3, 6, 5, 8, 6, 9, 7];
  const max = Math.max(1, ...values);
  return (
    <div className="inventoryMiniChart" aria-hidden="true">
      {values.map((value, index) => <span key={index} style={{ height: `${Math.max(18, (value / max) * 100)}%` }} />)}
    </div>
  );
}

function Donut({ percent, locked = false }: { percent: number; locked?: boolean }) {
  const safe = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className={`dashboardDonut ${locked ? "isLocked" : ""}`} style={{ "--donut": `${safe * 3.6}deg` } as React.CSSProperties}>
      <div><strong>{safe}%</strong><span>{locked ? "مقفول" : "سليم"}</span></div>
    </div>
  );
}

async function RetailerDashboard({ businessId, firstName }: { businessId: string; firstName: string }) {
  const start = monthStart();
  const [receivedOrders, activeOrders] = await Promise.all([
    db.marketplaceOrder.findMany({
      where: { buyerBusinessId: businessId, status: "RECEIVED" },
      include: { seller: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    db.marketplaceOrder.findMany({
      where: { buyerBusinessId: businessId, status: { in: ["PLACED", "ACCEPTED"] } },
      select: { expectedTotal: true },
    }),
  ]);

  const monthOrders = receivedOrders.filter((order) => orderDate(order) >= start);
  const monthSpend = monthOrders.reduce((sum, order) => sum + Number(order.expectedTotal), 0);
  const lifetimeSpend = receivedOrders.reduce((sum, order) => sum + Number(order.expectedTotal), 0);
  const averageOrder = receivedOrders.length ? lifetimeSpend / receivedOrders.length : 0;

  const supplierMap = new Map<string, PartnerStat>();
  for (const order of receivedOrders) {
    const previous = supplierMap.get(order.sellerBusinessId);
    const date = orderDate(order);
    supplierMap.set(order.sellerBusinessId, {
      id: order.sellerBusinessId,
      name: order.seller.name,
      city: order.seller.city,
      total: (previous?.total ?? 0) + Number(order.expectedTotal),
      count: (previous?.count ?? 0) + 1,
      lastOrder: previous && previous.lastOrder > date ? previous.lastOrder : date,
    });
  }

  const suppliers = sortPartners(Array.from(supplierMap.values()));
  const topSupplier = suppliers[0];

  return (
    <main className="approvedDashboard">
      <header className="dashboardGreeting">
        <div><span>لوحة التاجر</span><h1>مرحبًا {firstName} 👋</h1><p>هكذا يبدو أداء مشترياتك اليوم.</p></div>
        <span className="dashboardDate">{new Intl.DateTimeFormat("ar-SA", { dateStyle: "long" }).format(new Date())}</span>
      </header>

      <StatStrip items={[
        { label: "مشتريات الشهر", value: formatSar(monthSpend), note: `${monthOrders.length} طلب مستلم`, icon: ShoppingBasket },
        { label: "الطلبات الحالية", value: `${activeOrders.length}`, note: "طلبات قيد التنفيذ", icon: ClipboardList },
        { label: "الموردون", value: `${suppliers.length}`, note: "مورد بتعامل فعلي", icon: Store },
        { label: "متوسط الطلب", value: formatSar(averageOrder), note: `${receivedOrders.length} طلب إجمالًا`, icon: Tags },
      ]} />

      <section className="dashboardFeatureGrid">
        <article className="dashboardCard dashboardSupplierCard">
          <div className="dashboardCardHeading">
            <div><span className="dashboardEyebrow">أكثر مورد تتعامل معه</span><h2>{topSupplier?.name ?? "لا توجد مشتريات بعد"}</h2></div>
            <span className="dashboardCardIcon"><Store size={20} /></span>
          </div>
          {topSupplier ? (
            <div className="dashboardSupplierStats">
              <div><span>إجمالي المشتريات</span><strong>{formatSar(topSupplier.total)}</strong></div>
              <div><span>عدد الطلبات</span><strong>{topSupplier.count}</strong></div>
              <div className="dashboardSupplierLast"><span>آخر شراء</span><strong>{shortDate(topSupplier.lastOrder)}</strong></div>
            </div>
          ) : <div className="dashboardEmpty">بعد أول طلب مستلم يظهر هنا المورد الأكثر تعاملًا.</div>}
        </article>

        <LockedCard title="مبيعات الموظفين" subtitle="ترتيب مبيعات الموظفين اليوم" icon={UsersRound}>
          <div className="lockedEmployeeBars"><span style={{ width: "88%" }} /><span style={{ width: "64%" }} /><span style={{ width: "43%" }} /></div>
        </LockedCard>

        <LockedCard title="الجرد الحالي" subtitle="نسبة اكتمال الجرد والفروقات" icon={ClipboardCheck}>
          <Donut percent={92} locked />
        </LockedCard>

        <LockedCard title="المخزون" subtitle="القيمة والأصناف المنخفضة والنافدة" icon={Boxes}>
          <InventoryBars quantities={[]} />
        </LockedCard>
      </section>

      <section className="dashboardWideCard">
        <div className="dashboardCardHeading">
          <div><span className="dashboardEyebrow">الموردون</span><h2>توزيع مشترياتك</h2></div>
          <strong className="dashboardWideValue">{formatSar(lifetimeSpend)}</strong>
        </div>
        <RankBars rows={suppliers} empty="لا توجد مشتريات مستلمة بعد." />
      </section>
    </main>
  );
}

async function SupplierDashboard({ businessId, firstName }: { businessId: string; firstName: string }) {
  const start = monthStart();
  const dormantCutoff = daysAgo(30);
  const [listings, receivedOrders, activeOrders] = await Promise.all([
    db.marketplaceListing.findMany({ where: { sellerBusinessId: businessId }, orderBy: { updatedAt: "desc" }, take: 500 }),
    db.marketplaceOrder.findMany({
      where: { sellerBusinessId: businessId, status: "RECEIVED" },
      include: { buyer: true },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
    db.marketplaceOrder.findMany({
      where: { sellerBusinessId: businessId, status: { in: ["PLACED", "ACCEPTED"] } },
      select: { expectedTotal: true },
    }),
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
    buyerMap.set(order.buyerBusinessId, {
      id: order.buyerBusinessId,
      name: order.buyer.name,
      city: order.buyer.city,
      total: (previous?.total ?? 0) + Number(order.expectedTotal),
      count: (previous?.count ?? 0) + 1,
      lastOrder: previous && previous.lastOrder > date ? previous.lastOrder : date,
    });
  }

  const buyers = sortPartners(Array.from(buyerMap.values()));
  const topBuyer = buyers[0];
  const dormantBuyers = buyers.filter((buyer) => buyer.lastOrder < dormantCutoff).sort((a, b) => a.lastOrder.getTime() - b.lastOrder.getTime());
  const quantities = listings.map((item) => Number(item.quantity));

  return (
    <main className="approvedDashboard">
      <header className="dashboardGreeting">
        <div><span>لوحة المورد</span><h1>مرحبًا {firstName} 👋</h1><p>هكذا يبدو أداء مبيعاتك ومخزونك اليوم.</p></div>
        <span className="dashboardDate">{new Intl.DateTimeFormat("ar-SA", { dateStyle: "long" }).format(new Date())}</span>
      </header>

      <StatStrip items={[
        { label: "مبيعات الشهر", value: formatSar(monthSales), note: `${monthOrders.length} طلب مستلم`, icon: ShoppingCart },
        { label: "الطلبات النشطة", value: `${activeOrders.length}`, note: "بانتظار القبول أو الاستلام", icon: ClipboardList },
        { label: "قيمة المخزون", value: formatSar(stockValue), note: `${listings.length} منتج معروض`, icon: Boxes },
        { label: "متوسط الطلب", value: formatSar(averageOrder), note: `${buyers.length} تاجر تعامل معك`, icon: TrendingUp },
      ]} />

      <section className="dashboardFeatureGrid">
        <article className="dashboardCard dashboardSupplierCard">
          <div className="dashboardCardHeading">
            <div><span className="dashboardEyebrow">أفضل عميل</span><h2>{topBuyer?.name ?? "لا توجد مبيعات بعد"}</h2></div>
            <span className="dashboardCardIcon teal"><UsersRound size={20} /></span>
          </div>
          {topBuyer ? (
            <div className="dashboardSupplierStats">
              <div><span>إجمالي مشترياته</span><strong>{formatSar(topBuyer.total)}</strong></div>
              <div><span>عدد الطلبات</span><strong>{topBuyer.count}</strong></div>
              <div className="dashboardSupplierLast"><span>آخر شراء</span><strong>{shortDate(topBuyer.lastOrder)}</strong></div>
            </div>
          ) : <div className="dashboardEmpty">يظهر هنا أكثر تاجر يشتري منك بعد أول طلب مستلم.</div>}
        </article>

        <article className="dashboardCard">
          <div className="dashboardCardHeading">
            <div><span className="dashboardEyebrow">العملاء</span><h2>أعلى التجار شراءً</h2></div>
            <span className="dashboardCardIcon teal"><UsersRound size={20} /></span>
          </div>
          <RankBars rows={buyers} empty="لا توجد مبيعات مستلمة بعد." />
        </article>

        <article className="dashboardCard dashboardInventoryCard">
          <div className="dashboardCardHeading">
            <div><span className="dashboardEyebrow">المخزون</span><h2>{formatSar(stockValue)}</h2><p>قيمة المخزون المعروض</p></div>
            <span className="dashboardCardIcon"><Boxes size={20} /></span>
          </div>
          <InventoryBars quantities={quantities} />
          <div className="inventorySignals"><span><b>{lowStock}</b> منخفض</span><span className="danger"><b>{outOfStock}</b> نافد</span></div>
        </article>

        <article className="dashboardCard dashboardAuditCard">
          <div className="dashboardCardHeading">
            <div><span className="dashboardEyebrow">صحة المخزون</span><h2>التغطية الحالية</h2><p>{healthy} صنف بحالة جيدة</p></div>
            <span className="dashboardCardIcon teal"><PackageCheck size={20} /></span>
          </div>
          <Donut percent={stockHealth} />
        </article>
      </section>

      <section className="dashboardWideCard dashboardDormantCard">
        <div className="dashboardCardHeading">
          <div><span className="dashboardEyebrow danger">يحتاج متابعة</span><h2>تجار توقفوا عن الشراء منك</h2><p>سبق لهم استلام طلب ولم يسجلوا شراءً جديدًا منذ 30 يومًا أو أكثر.</p></div>
          <span className="dashboardAlertCount"><AlertTriangle size={15} /> {dormantBuyers.length}</span>
        </div>
        {dormantBuyers.length ? (
          <div className="dormantCompactList">
            {dormantBuyers.slice(0, 5).map((buyer) => (
              <div key={buyer.id}>
                <span className="dormantInitial">{buyer.name.slice(0, 1)}</span>
                <div><strong>{buyer.name}</strong><small>آخر شراء {shortDate(buyer.lastOrder)} · {buyer.count} طلب</small></div>
                <b>{formatSar(buyer.total)}</b>
              </div>
            ))}
          </div>
        ) : <div className="dashboardEmpty">ممتاز — لا يوجد تاجر سابق مضى على آخر شرائه 30 يومًا حتى الآن.</div>}
      </section>
    </main>
  );
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
