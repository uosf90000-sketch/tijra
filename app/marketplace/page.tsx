import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, PackageSearch, ShoppingBasket, Store, Tags } from "lucide-react";
import { MarketplaceBuyButton } from "@/components/marketplace-buy-button";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

export const metadata = { title: "سوق تِجرا" };
export const dynamic = "force-dynamic";

export default async function MarketplacePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const canBuy = ['RETAILER', 'BOTH'].includes(context.business.businessType);
  const canSell = ['SUPPLIER', 'BOTH'].includes(context.business.businessType);

  const listings = await db.marketplaceListing.findMany({
    where: {
      active: true,
      quantity: { gt: 0 },
      sellerBusinessId: { not: context.business.id },
      ...(q ? { OR: [
        { name: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
        { barcode: { contains: q } },
        { seller: { name: { contains: q, mode: "insensitive" } } },
      ] } : {}),
    },
    include: { seller: true },
    orderBy: [{ name: "asc" }, { price: "asc" }],
    take: 120,
  });

  const bestByKey = new Map<string, number>();
  for (const listing of listings) {
    const key = listing.barcode || listing.name.trim().toLowerCase();
    const price = Number(listing.price);
    bestByKey.set(key, Math.min(bestByKey.get(key) ?? price, price));
  }

  return (
    <>
      <PageHeader
        eyebrow="TIJRA MARKET"
        title="سوق الموردين"
        description="تصفح بضائع الموردين مباشرة، قارن نفس المنتج بين أكثر من مورد، واطلب بالسعر الأنسب."
        actions={<>{canBuy && <Link className="button secondary" href="/marketplace/orders"><ClipboardList size={17} /> طلباتي</Link>}{canSell && <Link className="button secondary" href="/marketplace/seller"><Store size={17} /> لوحة المورد</Link>}</>}
      />

      <section className="marketHero panel">
        <div><span className="eyebrow"><ShoppingBasket size={14} /> شراء جملة مباشر</span><h2>مثل السوق الإلكتروني، لكن لتجار التجزئة والموردين</h2><p>السعر والمخزون والحد الأدنى للطلب ظاهر قبل الشراء. التوصيل يتم بالاتفاق المباشر بين الطرفين.</p></div>
        <Link className="button secondary" href="/alerts"><Tags size={17} /> السعر الأذكى</Link>
      </section>

      <form className="marketSearch" action="/marketplace">
        <PackageSearch size={19} />
        <input name="q" defaultValue={q} placeholder="ابحث: بيبسي، مياه، باركود أو اسم مورد..." />
        <button className="button primary">بحث</button>
      </form>

      <section className="marketGrid">
        {listings.map((listing) => {
          const key = listing.barcode || listing.name.trim().toLowerCase();
          const isBest = Number(listing.price) === bestByKey.get(key);
          return (
            <article className="panel marketCard" key={listing.id}>
              <div className="marketCardTop">
                <div><h3>{listing.name}</h3><div className="marketMeta">{listing.category || "بدون تصنيف"}{listing.barcode ? ` · ${listing.barcode}` : ""}</div></div>
                <div className="marketProductIcon"><ShoppingBasket size={21} /></div>
              </div>
              <div className="marketPrice"><div><strong>{formatSar(Number(listing.price))}</strong><span> / {listing.unit}</span></div>{isBest && <span className="bestPriceTag">أفضل سعر</span>}</div>
              <div className="marketStock"><span className="marketChip good">متوفر {Number(listing.quantity).toLocaleString("ar-SA")}</span><span className="marketChip">حد الطلب {Number(listing.minOrderQty).toLocaleString("ar-SA")}</span></div>
              <div className="marketSeller"><strong>{listing.seller.name}</strong><span>{listing.seller.city || "السعودية"}</span></div>
              {canBuy ? <MarketplaceBuyButton listingId={listing.id} minOrderQty={Number(listing.minOrderQty)} available={Number(listing.quantity)} /> : <div className="infoNote">أنت داخل حساب مورد. استخدم حساب تاجر أو «الاثنان» للشراء.</div>}
            </article>
          );
        })}
        {!listings.length && <article className="panel smartPriceEmpty"><div className="softIcon brand"><PackageSearch size={21} /></div><h2>لا توجد منتجات مطابقة</h2><p>عندما ينشر الموردون منتجاتهم ستظهر هنا مباشرة للتجار.</p></article>}
      </section>
    </>
  );
}
