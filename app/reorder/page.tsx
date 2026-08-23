import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgePercent, RotateCcw, ShoppingBasket } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { RepeatOrderButton } from "@/components/repeat-order-button";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

export const metadata = { title: "إعادة الطلب" };
export const dynamic = "force-dynamic";

function normalize(value: string) {
  return value.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export default async function ReorderPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!["RETAILER", "BOTH"].includes(context.business.businessType)) redirect("/");

  const orders = await db.marketplaceOrder.findMany({
    where: { buyerBusinessId: context.business.id, status: "RECEIVED" },
    include: { seller: true, items: { include: { listing: true } } },
    orderBy: { receivedAt: "desc" },
    take: 30,
  });

  const listings = await db.marketplaceListing.findMany({
    where: { active: true, quantity: { gt: 0 }, sellerBusinessId: { not: context.business.id } },
    include: { seller: true },
    orderBy: { price: "asc" },
    take: 2500,
  });

  return (
    <>
      <PageHeader eyebrow="الشراء" title="إعادة الطلب" description="اطلب نفس الطلب السابق بضغطة. قبل الإعادة، تِجرا يفحص السعر الحالي ويشير لو ظهر مورد أرخص لنفس الصنف." />
      <section className="workflowStack">
        {orders.map((order) => {
          const currentTotal = order.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.listing.price), 0);
          let bestAlternative: { name: string; seller: string; price: number; saving: number } | null = null;
          if (order.items.length === 1) {
            const item = order.items[0];
            const key = normalize(item.listing.name);
            const matches = listings.filter((listing) => item.listing.barcode ? listing.barcode === item.listing.barcode : normalize(listing.name) === key && listing.unit === item.listing.unit);
            const best = matches[0];
            if (best) {
              const saving = (Number(item.listing.price) - Number(best.price)) * Number(item.quantity);
              if (saving > 0.01) bestAlternative = { name: best.name, seller: best.seller.name, price: Number(best.price), saving };
            }
          }
          return <article className="panel reorderCard" key={order.id}>
            <div className="reorderMain"><div className="reorderIcon"><RotateCcw size={20} /></div><div><span className="eyebrow">{order.seller.name}</span><h2>{order.items.map((item) => item.listing.name).join("، ")}</h2><p>{order.items.map((item) => `${Number(item.quantity).toLocaleString("ar-SA")} ${item.listing.unit}`).join(" · ")} · آخر استلام {new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(order.receivedAt ?? order.createdAt)}</p></div></div>
            <div className="reorderPrice"><span>السعر الحالي لنفس الطلب</span><strong>{formatSar(currentTotal)}</strong><small>السابق {formatSar(Number(order.expectedTotal))}</small></div>
            {bestAlternative ? <div className="savingHint"><BadgePercent size={17} /><div><strong>يوجد خيار أرخص الآن</strong><span>{bestAlternative.seller} · {formatSar(bestAlternative.price)} · توفير تقريبي {formatSar(bestAlternative.saving)}</span></div><Link className="textLink" href={`/marketplace?q=${encodeURIComponent(bestAlternative.name)}`}>مقارنة</Link></div> : null}
            <RepeatOrderButton orderId={order.id} />
          </article>;
        })}
        {!orders.length && <section className="panel workflowEmpty"><ShoppingBasket size={28} /><h2>لا توجد طلبات مستلمة بعد</h2><p>بعد أول طلب تستلمه من مورد سيظهر هنا ويمكنك إعادته بضغطة.</p><Link className="button primary" href="/marketplace">فتح السوق</Link></section>}
      </section>
    </>
  );
}
