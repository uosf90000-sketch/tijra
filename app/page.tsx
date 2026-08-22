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
  TrendingDown,
  UsersRound,
} from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
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
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(date);
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

function PercentageBar({ value, max }: { value: number; max: number }) {
  const percent = max > 0 ? Math.max(6, Math.min(100, (value / max) * 100)) : 0;
  return <span className="statBar"><span style={{ width: `${percent}%` }} /></span>;
}

function LockedStatistic({ title, note, icon: Icon }: { title: string; note: string; icon: typeof LockKeyhole }) {
  return (
    <article className="statInsight statLocked">
      <div className="statInsightTop">
        <span className="statIcon"><Icon size={20} /></span>
        <span className="statLockBadge"><LockKeyhole size={12} /> مقفلة</span>
      </div>
      <div>
        <span className="statLabel">{title}</span>
        <strong className="statLockedValue">—</strong>
        <p>{note}</p>
      </div>
    </article>
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
  const activeValue = activeOrders.reduce((sum, order) => sum + Number(order.expectedTotal), 0);

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
  const supplierMax = topSupplier?.total ?? 0;
  const averageOrder = receivedOrders.length ? lifetimeSpend / receivedOrders.length : 0;

  return (
    <>
      <PageHeader
        eyebrow="لوحة التاجر"
        title={`مرحبًا ${firstName} 👋`}
        description="الرئيسية الآن لوحة أرقام فقط: مشترياتك، الموردون، الطلبات، والخدمات التي ستفتح لاحقًا."
      />

      <section className="metricsGrid four statMetricGrid">
        <MetricCard label="مشتريات الشهر" value={formatSar(monthSpend)} note={`${monthOrders.length} طلبات مستلمة`} icon={ShoppingBasket} />
        <MetricCard label="الطلبات الحالية" value={`${activeOrders.length}`} note={activeValue ? `بقيمة ${formatSar(activeValue)}` : "لا توجد طلبات جارية"} icon={ClipboardList} tone="amber" />
        <MetricCard label="الموردون الذين اشتريت منهم" value={`${suppliers.length}`} note="موردون بتعاملات فعلية" icon={Store} tone="blue" />
        <MetricCard label="متوسط الطلب" value={formatSar(averageOrder)} note={`${receivedOrders.length} طلبًا مستلمًا إجمالًا`} icon={ClipboardCheck} tone="violet" />
      </section>

      <section className="statisticsDashboardGrid">
        <article className="statInsight statPrimary">
          <div className="statInsightTop">
            <span className="statIcon"><Store size={20} /></span>
            <span className="statPill">الأكثر تعاملًا</span>
          </div>
          <div>
            <span className="statLabel">أكثر مورد تشتري منه</span>
            <strong className="statPartnerName">{topSupplier?.name ?? "لا توجد مشتريات بعد"}</strong>
            {topSupplier ? (
              <div className="statPartnerMeta">
                <span>{formatSar(topSupplier.total)} إجمالي مشتريات</span>
                <span>{topSupplier.count} طلب</span>
                <span>آخر شراء {shortDate(topSupplier.lastOrder)}</span>
              </div>
            ) : <p>بعد أول طلب مستلم، يظهر هنا المورد الأكثر تعاملًا معك.</p>}
          </div>
        </article>

        <article className="statInsight">
          <div className="statInsightTop">
            <span className="statIcon"><ShoppingCart size={20} /></span>
            <span className="statPill muted">إجمالي</span>
          </div>
          <div>
            <span className="statLabel">إجمالي مشترياتك عبر تِجرا</span>
            <strong className="statBigValue">{formatSar(lifetimeSpend)}</strong>
            <p>من الطلبات التي تم استلامها فعليًا.</p>
          </div>
        </article>

        <LockedStatistic title="مبيعات الموظفين" note="تظهر أرقام كل موظف بعد تفعيل الكاشير وربط عمليات البيع بالمستخدم." icon={UsersRound} />
        <LockedStatistic title="المخزون" note="مقفول للتاجر حاليًا حتى تجهيز قارئ الباركود ونقطة البيع للمتجر." icon={Boxes} />
        <LockedStatistic title="الجرد" note="سيظهر تقدم الجرد، الفروقات، وآخر جرد بعد تفعيل نظام المتجر." icon={ClipboardCheck} />
        <LockedStatistic title="الكاشير" note="خدمة زجاجية حاليًا، وتفتح عند تجهيز POS والباركود." icon={ShoppingCart} />
      </section>

      <section className="panel statisticsPanel">
        <div className="panelHeader">
          <div><span className="eyebrow">الموردون</span><h2>توزيع مشترياتك حسب المورد</h2></div>
          <span className="statisticsTotal">{formatSar(lifetimeSpend)}</span>
        </div>
        <div className="partnerRanking">
          {suppliers.slice(0, 5).map((supplier, index) => (
            <div className="partnerRankRow" key={supplier.id}>
              <span className="partnerRankNumber">{index + 1}</span>
              <div className="partnerRankBody">
                <div className="partnerRankTitle"><strong>{supplier.name}</strong><span>{formatSar(supplier.total)}</span></div>
                <PercentageBar value={supplier.total} max={supplierMax} />
                <span className="partnerRankNote">{supplier.count} طلب · {supplier.city || "المدينة غير محددة"}</span>
              </div>
            </div>
          ))}
          {!suppliers.length && <div className="infoNote">لا توجد مشتريات مستلمة بعد لعرض الإحصائيات.</div>}
        </div>
      </section>
    </>
  );
}

async function SupplierDashboard({ businessId, firstName }: { businessId: string; firstName: string }) {
  const start = monthStart();
  const dormantCutoff = daysAgo(30);
  const [listings, receivedOrders, activeOrders] = await Promise.all([
    db.marketplaceListing.findMany({
      where: { sellerBusinessId: businessId },
      orderBy: { updatedAt: "desc" },
      take: 500,
    }),
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
  const stockValue = listings.reduce((sum, item) => sum + Number(item.quantity) * Number(item.price), 0);
  const lowStock = listings.filter((item) => Number(item.quantity) > 0 && Number(item.quantity) <= Math.max(5, Number(item.minOrderQty))).length;
  const outOfStock = listings.filter((item) => Number(item.quantity) <= 0).length;
  const lastStockUpdate = listings[0]?.updatedAt ?? null;

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
  const buyerMax = topBuyer?.total ?? 0;
  const dormantBuyers = buyers
    .filter((buyer) => buyer.lastOrder < dormantCutoff)
    .sort((a, b) => a.lastOrder.getTime() - b.lastOrder.getTime());

  return (
    <>
      <PageHeader
        eyebrow="لوحة المورد"
        title={`مرحبًا ${firstName} 👋`}
        description="الرئيسية تعرض أرقام البيع والمخزون والعملاء فقط، مع تنبيه للتجار الذين توقف نشاطهم."
      />

      <section className="metricsGrid four statMetricGrid">
        <MetricCard label="مبيعات الشهر" value={formatSar(monthSales)} note={`${monthOrders.length} طلبات مستلمة`} icon={ShoppingCart} />
        <MetricCard label="طلبات نشطة" value={`${activeOrders.length}`} note="بانتظار القبول أو الاستلام" icon={ClipboardList} tone="amber" />
        <MetricCard label="قيمة المخزون" value={formatSar(stockValue)} note={`${listings.length} منتجًا معروضًا`} icon={Boxes} tone="blue" />
        <MetricCard label="تجار تعاملوا معك" value={`${buyers.length}`} note="عملاء لديهم طلب مستلم" icon={UsersRound} tone="violet" />
      </section>

      <section className="statisticsDashboardGrid supplierStatsGrid">
        <article className="statInsight statPrimary">
          <div className="statInsightTop">
            <span className="statIcon"><UsersRound size={20} /></span>
            <span className="statPill">أفضل عميل</span>
          </div>
          <div>
            <span className="statLabel">أكثر تاجر يشتري منك</span>
            <strong className="statPartnerName">{topBuyer?.name ?? "لا توجد مبيعات مستلمة بعد"}</strong>
            {topBuyer ? (
              <div className="statPartnerMeta">
                <span>{formatSar(topBuyer.total)} إجمالي شراء</span>
                <span>{topBuyer.count} طلب</span>
                <span>آخر شراء {shortDate(topBuyer.lastOrder)}</span>
              </div>
            ) : <p>يظهر هنا أفضل تاجر بعد أول طلب مستلم.</p>}
          </div>
        </article>

        <article className="statInsight">
          <div className="statInsightTop"><span className="statIcon"><Boxes size={20} /></span><span className="statPill muted">المخزون</span></div>
          <div><span className="statLabel">إجمالي قيمة المخزون</span><strong className="statBigValue">{formatSar(stockValue)}</strong><p>{listings.length} منتجًا · آخر تحديث {lastStockUpdate ? shortDate(lastStockUpdate) : "لا يوجد"}</p></div>
        </article>

        <article className="statInsight statWarning">
          <div className="statInsightTop"><span className="statIcon"><AlertTriangle size={20} /></span><span className="statPill warning">تنبيه</span></div>
          <div><span className="statLabel">أصناف منخفضة</span><strong className="statBigValue">{lowStock}</strong><p>{outOfStock} أصناف نافدة بالكامل.</p></div>
        </article>

        <article className="statInsight">
          <div className="statInsightTop"><span className="statIcon"><PackageCheck size={20} /></span><span className="statPill muted">إجمالي</span></div>
          <div><span className="statLabel">إجمالي مبيعات تِجرا</span><strong className="statBigValue">{formatSar(lifetimeSales)}</strong><p>{receivedOrders.length} طلبًا تم استلامه.</p></div>
        </article>
      </section>

      <section className="roleDashboardGrid statisticsTwoColumn">
        <article className="panel statisticsPanel dormantPanel">
          <div className="panelHeader">
            <div><span className="eyebrow dangerEyebrow">يحتاج متابعة</span><h2>تجار توقفوا عن الشراء منك</h2></div>
            <span className="dormantCount"><TrendingDown size={16} /> {dormantBuyers.length}</span>
          </div>
          <p className="panelLead">نعتبر التاجر متوقفًا عندما يكون لديه شراء مستلم سابقًا ولم يسجل شراء جديدًا منذ 30 يومًا أو أكثر.</p>
          <div className="dormantList">
            {dormantBuyers.slice(0, 6).map((buyer) => (
              <div className="dormantRow" key={buyer.id}>
                <span className="dormantAvatar">{buyer.name.slice(0, 1)}</span>
                <div><strong>{buyer.name}</strong><span>{buyer.city || "المدينة غير محددة"} · آخر شراء {shortDate(buyer.lastOrder)}</span></div>
                <div className="dormantValue"><strong>{formatSar(buyer.total)}</strong><span>{buyer.count} طلب</span></div>
              </div>
            ))}
            {!dormantBuyers.length && <div className="infoNote">ممتاز — لا يوجد تاجر سابق مضى على آخر شرائه 30 يومًا حتى الآن.</div>}
          </div>
        </article>

        <article className="panel statisticsPanel">
          <div className="panelHeader"><div><span className="eyebrow">العملاء</span><h2>أعلى التجار شراءً منك</h2></div><span className="statisticsTotal">{formatSar(lifetimeSales)}</span></div>
          <div className="partnerRanking">
            {buyers.slice(0, 5).map((buyer, index) => (
              <div className="partnerRankRow" key={buyer.id}>
                <span className="partnerRankNumber">{index + 1}</span>
                <div className="partnerRankBody">
                  <div className="partnerRankTitle"><strong>{buyer.name}</strong><span>{formatSar(buyer.total)}</span></div>
                  <PercentageBar value={buyer.total} max={buyerMax} />
                  <span className="partnerRankNote">{buyer.count} طلب · آخر شراء {shortDate(buyer.lastOrder)}</span>
                </div>
              </div>
            ))}
            {!buyers.length && <div className="infoNote">لا توجد مبيعات مستلمة بعد لعرض ترتيب التجار.</div>}
          </div>
        </article>
      </section>
    </>
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
