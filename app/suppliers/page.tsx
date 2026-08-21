import Link from "next/link";
import { redirect } from "next/navigation";
import { CirclePlus, ExternalLink, Phone, Search, Store, Tags } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

export const metadata = { title: "الموردون" };
export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  const businessId = context.business.id;

  const [suppliers, offers, openOrders] = await Promise.all([
    db.supplier.findMany({
      where: { businessId },
      include: {
        _count: { select: { products: true } },
        purchaseOrders: { where: { status: { in: ["DRAFT", "SENT", "CONFIRMED", "PARTIALLY_RECEIVED"] } }, select: { id: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.supplierProduct.findMany({
      where: { supplier: { businessId }, product: { active: true } },
      include: { supplier: true, product: true },
      orderBy: [{ productId: "asc" }, { price: "asc" }],
      take: 200,
    }),
    db.purchaseOrder.count({ where: { businessId, status: { in: ["DRAFT", "SENT", "CONFIRMED", "PARTIALLY_RECEIVED"] } } }),
  ]);

  const bestOfferByProduct = new Map<string, (typeof offers)[number]>();
  for (const offer of offers) {
    const current = bestOfferByProduct.get(offer.productId);
    if (!current || Number(offer.price) < Number(current.price)) bestOfferByProduct.set(offer.productId, offer);
  }
  const comparison = Array.from(bestOfferByProduct.values()).slice(0, 20);

  return (
    <>
      <PageHeader
        eyebrow="شبكة التوريد"
        title="الموردون"
        description="احتفظ بمورديك الحاليين وسجّل أسعارهم وقارن بينهم. التوصيل والاتفاقات اللوجستية تبقى مباشرة بينكما."
        actions={
          <>
            <Link className="button secondary" href="/suppliers/prices/new"><Tags size={17} /> تسجيل سعر</Link>
            <Link className="button primary" href="/suppliers/new"><CirclePlus size={17} /> إضافة مورد</Link>
          </>
        }
      />

      <section className="metricsGrid three">
        <MetricCard label="الموردون" value={`${suppliers.length}`} note="مرتبطون بمنشأتك" icon={Store} />
        <MetricCard label="طلبات مفتوحة" value={`${openOrders}`} note="بانتظار الإكمال" icon={ExternalLink} tone="blue" />
        <MetricCard label="أسعار مسجلة" value={`${offers.length}`} note="تستخدم في المقارنة" icon={Tags} tone="amber" />
      </section>

      <section className="supplierGrid">
        {suppliers.map((supplier) => (
          <article className="panel supplierCard" key={supplier.id}>
            <div className="supplierTop">
              <div className="supplierLogo">{supplier.name.slice(0, 1)}</div>
              <div className="grow"><strong>{supplier.name}</strong><span>{supplier._count.products} أسعار/أصناف مسجلة</span></div>
            </div>
            <div className="supplierStats">
              <div><span>طلبات مفتوحة</span><strong>{supplier.purchaseOrders.length}</strong></div>
              <div><span>طريقة التوصيل</span><strong>بينكما</strong></div>
            </div>
            <div className="supplierContact"><Phone size={15} /> {supplier.phone || "لا يوجد رقم مسجل"}</div>
            <div className="logisticsNote">{supplier.notes || "لا توجد ملاحظات لهذا المورد."}</div>
          </article>
        ))}
        {!suppliers.length && <article className="panel"><div className="infoNote">لم تضف موردين بعد. أضف موردك الحالي أولًا ثم سجّل أسعاره.</div></article>}
      </section>

      <section className="panel tablePanel">
        <div className="panelHeader tableHeader">
          <div><span className="eyebrow">مقارنة الأسعار</span><h2>أفضل سعر مسجل لكل صنف</h2></div>
          <div className="searchField small"><Search size={17} /><input aria-label="بحث بعروض الموردين" placeholder="ابحث عن صنف" /></div>
        </div>
        <div className="tableScroll">
          <table className="dataTable">
            <thead><tr><th>الصنف</th><th>المورد الأفضل</th><th>السعر</th><th>الحد الأدنى</th><th>آخر تحديث</th></tr></thead>
            <tbody>
              {comparison.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.product.name}</strong></td>
                  <td>{item.supplier.name}</td>
                  <td><strong>{formatSar(Number(item.price))}</strong></td>
                  <td>{item.minOrderQty == null ? "—" : `${Number(item.minOrderQty).toLocaleString("ar-SA")} ${item.product.unit}`}</td>
                  <td>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(item.lastQuotedAt)}</td>
                </tr>
              ))}
              {!comparison.length && <tr><td colSpan={5}><div className="infoNote">لا توجد أسعار مسجلة بعد. استخدم زر «تسجيل سعر» لبدء المقارنة.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
