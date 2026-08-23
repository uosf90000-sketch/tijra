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
      <PageHeader eyebrow="الشراء" title="إعادة الطلب" description="تِجرا يذكّرك بالمورد السابق أولًا، ثم ينبهك إذا وجد نفس الصنف بسعر أرخص عند مورد آخر. القرار يبقى لك." />
      <section className="workflowStack">
        {orders.map((order) => {
          const currentTotal = order.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.listing.price), 0);
          const cheaperItems = order.items.flatMap((item) => {
            const requestedQty = Number(item.quantity);
            const key = normalize(item.listing.name);
            const best = listings.find((listing) => {
              if (listing.sellerBusinessId === order.sellerBusinessId || listing.id === item.listing.id) return false;
              if (Number(listing.quantity) < requestedQty || Number(listing.minOrderQty) > requestedQty) return false;
              if (item.listing.barcode) return listing.barcode === item.listing.barcode;
              return normalize(listing.name) === key && listing.unit === item.listing.unit;
            });
            if (!best) return [];
            const saving = (Number(item.listing.price) - Number(best.price)) * requestedQty;
            if (saving <= 0.01) return [];
            return [{
              name: best.name,
              seller: best.seller.name,
              price: Number(best.price),
              saving,
              originalName: item.listing.name,
            }];
          });
          const totalSaving = cheaperItems.reduce((sum, item) => sum + item.saving, 0);
          const firstCheaper = cheaperItems[0];

          return <article className="panel reorderCard" key={order.id}>
            <div className="reorderMain"><div className="reorderIcon"><RotateCcw size={20} /></div><div><span className="eyebrow">المورد السابق · {order.seller.name}</span><h2>{order.items.map((item) => item.listing.name).join("، ")}</h2><p>{order.items.map((item) => `${Number(item.quantity).toLocaleString("ar-SA")} ${item.listing.unit}`).join(" · ")} · آخر استلام {new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(order.receivedAt ?? order.createdAt)}</p></div></div>
            <div className="reorderPrice"><span>إعادة الطلب من المورد السابق</span><strong>{formatSar(currentTotal)}</strong><small>{order.seller.name} · السعر السابق {formatSar(Number(order.expectedTotal))}</small></div>
            {firstCheaper ? <div className="savingHint"><BadgePercent size={17} /><div><strong>يوجد أرخص</strong><span>{cheaperItems.length === 1 ? `${firstCheaper.originalName} عند ${firstCheaper.seller} بسعر ${formatSar(firstCheaper.price)} · توفير تقريبي ${formatSar(firstCheaper.saving)}` : `${cheaperItems.length} أصناف لها سعر أرخص عند موردين آخرين · توفير تقريبي ${formatSar(totalSaving)}`}</span></div><Link className="textLink" href={`/marketplace?q=${encodeURIComponent(firstCheaper.name)}`}>عرض الأرخص</Link></div> : null}
            <RepeatOrderButton orderId={order.id} />
          </article>;
        })}
        {!orders.length && <section className="panel workflowEmpty"><ShoppingBasket size={28} /><h2>لا توجد طلبات مستلمة بعد</h2><p>بعد أول طلب تستلمه من مورد سيظهر هنا ويمكنك إعادته من نفس المورد، مع تنبيه إذا وجد تِجرا سعرًا أرخص.</p><Link className="button primary" href="/marketplace">فتح السوق</Link></section>}
      </section>
    </>
  );
}
