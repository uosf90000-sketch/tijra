import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Boxes,
  Calculator,
  ClipboardList,
  LockKeyhole,
  ScanBarcode,
  ShoppingBag,
  ShoppingBasket,
  ShoppingCart,
  Store,
  Tags,
  UsersRound,
} from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { firstPermissionHref } from "@/lib/access";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

export const dynamic = "force-dynamic";

const orderStatus: Record<string, string> = {
  PLACED: "بانتظار المورد",
  ACCEPTED: "مقبول",
  RECEIVED: "مستلم",
  CANCELLED: "ملغي",
};

function monthStart() {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

async function RetailerDashboard({ businessId, firstName, city }: { businessId: string; firstName: string; city?: string | null }) {
  const start = monthStart();
  const [monthOrders, recentOrders, favoriteRows, marketOfferCount] = await Promise.all([
    db.marketplaceOrder.findMany({
      where: { buyerBusinessId: businessId, createdAt: { gte: start } },
      select: { status: true, expectedTotal: true },
    }),
    db.marketplaceOrder.findMany({
      where: { buyerBusinessId: businessId },
      include: { seller: true, items: { include: { listing: true } } },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    db.favoriteSupplier.findMany({
      where: { buyerBusinessId: businessId },
      include: { seller: { include: { marketplaceListings: { where: { active: true, quantity: { gt: 0 } }, take: 1 } } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    db.marketplaceListing.count({
      where: {
        active: true,
        quantity: { gt: 0 },
        sellerBusinessId: { not: businessId },
        ...(city ? { seller: { city } } : {}),
      },
    }),
  ]);

  const received = monthOrders.filter((item) => item.status === "RECEIVED");
  const active = monthOrders.filter((item) => item.status === "PLACED" || item.status === "ACCEPTED");
  const receivedTotal = received.reduce((sum, item) => sum + Number(item.expectedTotal), 0);
  const activeTotal = active.reduce((sum, item) => sum + Number(item.expectedTotal), 0);

  return (
    <>
      <PageHeader
        eyebrow="لوحة التاجر"
        title={`مرحبًا ${firstName} 👋`}
        description="إليك ملخص مشترياتك والموردين وفرص الشراء الذكي اليوم."
        actions={<Link className="button primary" href="/marketplace"><ShoppingBag size={17} /> تسوق الآن</Link>}
      />

      <section className="metricsGrid four">
        <MetricCard label="مشتريات الشهر" value={formatSar(receivedTotal)} note={`${received.length} طلبات مستلمة`} icon={ShoppingBasket} />
        <MetricCard label="الطلبات الحالية" value={`${active.length}`} note={activeTotal ? `بقيمة ${formatSar(activeTotal)}` : "لا توجد طلبات جارية"} icon={ClipboardList} tone="amber" />
        <MetricCard label="الموردون المفضلون" value={`${favoriteRows.length}`} note="للوصول السريع والمقارنة" icon={Store} tone="blue" />
        <MetricCard label="عروض متاحة" value={`${marketOfferCount}`} note={city ? `من ${city} حسب الفلتر` : "في سوق تِجرا"} icon={Tags} tone="violet" />
      </section>

      <section className="roleHero">
        <div><h2>السعر الأذكى يعمل لصالحك ✨</h2><p>ابحث باسم المنتج، قارن الموردين داخل مدينتك أو كل المدن، واختر أفضل سعر لنفس العبوة والوحدة.</p></div>
        <div className="roleHeroIcon"><Tags size={25} /></div>
      </section>

      <section className="roleDashboardGrid">
        <article className="panel">
          <div className="panelHeader"><div><span className="eyebrow">آخر الحركة</span><h2>طلباتك الأخيرة</h2></div><Link className="textLink" href="/marketplace/orders">عرض الكل</Link></div>
          <div className="roleTable">
            {recentOrders.map((order) => (
              <div className="roleTableRow" key={order.id}>
                <div><strong>{order.seller.name}</strong><span>{order.items.map((item) => item.listing.name).slice(0, 2).join("، ")}</span></div>
                <div><strong>{formatSar(Number(order.expectedTotal))}</strong><span>{orderStatus[order.status] ?? order.status}</span></div>
                <div><span>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "short" }).format(order.createdAt)}</span></div>
              </div>
            ))}
            {!recentOrders.length && <div className="infoNote">لم تطلب من السوق بعد.</div>}
          </div>
        </article>

        <article className="panel">
          <div className="panelHeader"><div><span className="eyebrow">موردون مفضلون</span><h2>ابدأ من المورد</h2></div><Store size={19} /></div>
          <div className="roleTable">
            {favoriteRows.map((row) => (
              <div className="roleTableRow" key={row.id}>
                <div><strong>{row.seller.name}</strong><span>{row.seller.city || "السعودية"}</span></div>
                <div><strong>{row.seller.marketplaceListings.length ? "متوفر" : "لا عروض"}</strong><span>في السوق</span></div>
                <div><Link className="textLink" href={`/marketplace?q=${encodeURIComponent(row.seller.name)}`}>عرض</Link></div>
              </div>
            ))}
            {!favoriteRows.length && <div className="infoNote">أضف الموردين المفضلين من السوق لتظهر هنا.</div>}
          </div>
        </article>
      </section>

      <section className="panel" style={{ marginTop: 12, padding: 19 }}>
        <div className="panelHeader"><div><span className="eyebrow">اختصارات</span><h2>كل ما يحتاجه التاجر</h2></div></div>
        <div className="roleActionGrid" style={{ marginTop: 14 }}>
          <Link className="roleActionCard" href="/marketplace"><ShoppingBag size={20} /><div><strong>السوق</strong><span>منتجات وموردون حسب مدينتك</span></div></Link>
          <Link className="roleActionCard" href="/alerts"><Tags size={20} /><div><strong>السعر الأذكى</strong><span>مقارنة أفضل العروض والتوفير</span></div></Link>
          <Link className="roleActionCard" href="/accounting"><Calculator size={20} /><div><strong>الملخص المالي</strong><span>مشترياتك والتزاماتك المؤكدة</span></div></Link>
          <Link className="roleActionCard locked" href="/inventory"><Boxes size={20} /><div><strong>المخزون</strong><span>خدمة زجاجية حتى تجهيز قارئ المتجر</span></div></Link>
          <Link className="roleActionCard locked" href="/sales"><ShoppingCart size={20} /><div><strong>الكاشير</strong><span>خدمة زجاجية حتى تجهيز POS والباركود</span></div></Link>
          <Link className="roleActionCard" href="/employees"><UsersRound size={20} /><div><strong>الموظفون</strong><span>المستخدمون والصلاحيات والرواتب</span></div></Link>
        </div>
      </section>
    </>
  );
}

async function SupplierDashboard({ businessId, firstName }: { businessId: string; firstName: string }) {
  const start = monthStart();
  const [listings, monthOrders, recentOrders] = await Promise.all([
    db.marketplaceListing.findMany({ where: { sellerBusinessId: businessId }, orderBy: { updatedAt: "desc" }, take: 120 }),
    db.marketplaceOrder.findMany({ where: { sellerBusinessId: businessId, createdAt: { gte: start } }, select: { status: true, expectedTotal: true, buyerBusinessId: true } }),
    db.marketplaceOrder.findMany({
      where: { sellerBusinessId: businessId },
      include: { buyer: true, items: { include: { listing: true } } },
      orderBy: { createdAt: "desc" },
      take: 7,
    }),
  ]);

  const received = monthOrders.filter((item) => item.status === "RECEIVED");
  const open = monthOrders.filter((item) => item.status === "PLACED" || item.status === "ACCEPTED");
  const salesTotal = received.reduce((sum, item) => sum + Number(item.expectedTotal), 0);
  const stockValue = listings.reduce((sum, item) => sum + Number(item.quantity) * Number(item.price), 0);
  const customerCount = new Set(monthOrders.map((item) => item.buyerBusinessId)).size;
  const lowStock = listings.filter((item) => Number(item.quantity) <= Math.max(5, Number(item.minOrderQty))).length;

  return (
    <>
      <PageHeader
        eyebrow="لوحة المورد"
        title={`مرحبًا ${firstName} 👋`}
        description="إليك ملخص المنتجات والمخزون والطلبات الواردة من التجار."
        actions={<Link className="button primary" href="/marketplace/seller"><Store size={17} /> إدارة المنتجات</Link>}
      />

      <section className="metricsGrid four">
        <MetricCard label="مبيعات الشهر داخل تِجرا" value={formatSar(salesTotal)} note={`${received.length} طلبات مستلمة`} icon={ShoppingCart} />
        <MetricCard label="طلبات التجار النشطة" value={`${open.length}`} note="بانتظار القبول أو الاستلام" icon={ClipboardList} tone="amber" />
        <MetricCard label="قيمة مخزون العرض" value={formatSar(stockValue)} note={`${listings.length} منتجًا معروضًا`} icon={Boxes} tone="blue" />
        <MetricCard label="تنبيهات المخزون" value={`${lowStock}`} note={`${customerCount} تجار تعاملوا معك هذا الشهر`} icon={Tags} tone="violet" />
      </section>

      <section className="roleHero">
        <div><h2>حدّث مخزونك بأقل خطوات</h2><p>أي بيع خارج تِجرا: امسح الباركود، أدخل الكمية، والمخزون الذي يراه التجار يتحدث فورًا.</p></div>
        <div className="roleHeroIcon"><ScanBarcode size={25} /></div>
      </section>

      <section className="roleDashboardGrid">
        <article className="panel">
          <div className="panelHeader"><div><span className="eyebrow">طلبات التجار</span><h2>أحدث الطلبات الواردة</h2></div><Link className="textLink" href="/marketplace/seller#orders">عرض الكل</Link></div>
          <div className="roleTable">
            {recentOrders.map((order) => (
              <div className="roleTableRow" key={order.id}>
                <div><strong>{order.buyer.name}</strong><span>{order.items.map((item) => item.listing.name).slice(0, 2).join("، ")}</span></div>
                <div><strong>{formatSar(Number(order.expectedTotal))}</strong><span>{orderStatus[order.status] ?? order.status}</span></div>
                <div><span>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "short" }).format(order.createdAt)}</span></div>
              </div>
            ))}
            {!recentOrders.length && <div className="infoNote">لا توجد طلبات واردة حتى الآن.</div>}
          </div>
        </article>

        <article className="panel">
          <div className="panelHeader"><div><span className="eyebrow">اختصارات المورد</span><h2>شغّل متجرك</h2></div></div>
          <div className="roleActionGrid" style={{ marginTop: 12 }}>
            <Link className="roleActionCard" href="/marketplace/seller"><Store size={20} /><div><strong>المنتجات</strong><span>إضافة وتعديل السعر والكمية</span></div></Link>
            <Link className="roleActionCard" href="/inventory"><Boxes size={20} /><div><strong>المخزون</strong><span>الكميات والقيمة والحالة</span></div></Link>
            <Link className="roleActionCard" href="/marketplace/seller#external-sale"><ScanBarcode size={20} /><div><strong>بيع خارجي</strong><span>مسح باركود وخصم سريع</span></div></Link>
          </div>
        </article>
      </section>

      <section className="panel" style={{ marginTop: 12, padding: 19 }}>
        <div className="panelHeader"><div><span className="eyebrow">إدارة المورد</span><h2>الأقسام الأساسية</h2></div></div>
        <div className="roleActionGrid" style={{ marginTop: 14 }}>
          <Link className="roleActionCard" href="/marketplace/seller#customers"><UsersRound size={20} /><div><strong>التجار والعملاء</strong><span>من يطلب منك داخل تِجرا</span></div></Link>
          <Link className="roleActionCard" href="/accounting"><Calculator size={20} /><div><strong>التقارير</strong><span>ملخصات البيع والتشغيل</span></div></Link>
          <Link className="roleActionCard" href="/employees"><UsersRound size={20} /><div><strong>الموظفون</strong><span>الحسابات والصلاحيات</span></div></Link>
        </div>
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
  return <RetailerDashboard businessId={context.business.id} firstName={firstName} city={context.business.city} />;
}
