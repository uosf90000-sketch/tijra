import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, PackageSearch, ShoppingBasket, Store, Tags } from "lucide-react";
import { FavoriteSupplierButton } from "@/components/favorite-supplier-button";
import { MarketplaceBuyButton } from "@/components/marketplace-buy-button";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

export const metadata = { title: "سوق تِجرا" };
export const dynamic = "force-dynamic";

const activityLabels: Record<string, string> = {
  GROCERY: "البقالة والتموينات",
  ELECTRONICS: "الإلكترونيات",
  PHARMACY: "الصيدليات",
  RESTAURANT: "المطاعم",
  CAFE: "المقاهي",
  FASHION: "الملابس",
  BEAUTY: "العناية والتجميل",
  HARDWARE: "الأدوات والمواد",
  OFFICE: "المستلزمات المكتبية",
  OTHER: "النشاط العام",
};

export default async function MarketplacePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const canBuy = ["RETAILER", "BOTH"].includes(context.business.businessType);
  const canSell = ["SUPPLIER", "BOTH"].includes(context.business.businessType);

  const [rawListings, favoriteRows] = await Promise.all([
    db.marketplaceListing.findMany({
      where: {
        active: true,
        quantity: { gt: 0 },
        sellerBusinessId: { not: context.business.id },
        ...(!q && canBuy ? { activity: context.business.businessActivity } : {}),
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
    }),
    canBuy
      ? db.favoriteSupplier.findMany({ where: { buyerBusinessId: context.business.id }, select: { sellerBusinessId: true } })
      : Promise.resolve([]),
  ]);

  const favoriteIds = new Set(favoriteRows.map((item) => item.sellerBusinessId));
  const listings = [...rawListings].sort((a, b) => {
    const favoriteDelta = Number(favoriteIds.has(b.sellerBusinessId)) - Number(favoriteIds.has(a.sellerBusinessId));
    if (favoriteDelta) return favoriteDelta;
    return a.name.localeCompare(b.name, "ar") || Number(a.price) - Number(b.price);
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
        description={q ? "نتائج البحث من جميع أقسام السوق." : `نعرض لك تلقائيًا منتجات ${activityLabels[context.business.businessActivity] ?? "نشاطك"}، والموردون المفضلون يظهرون أولًا.`}
        actions={<>{canBuy && <Link className="button secondary" href="/marketplace/orders"><ClipboardList size={17} /> طلباتي</Link>}{canSell && <Link className="button secondary" href="/marketplace/seller"><Store size={17} /> لوحة المورد</Link>}</>}
      />

      <section className="marketHero panel">
        <div><span className="eyebrow"><ShoppingBasket size={14} /> شراء جملة مباشر</span><h2>سوق مخصص لنشاط منشأتك</h2><p>الواجهة الرئيسية تعرض المنتجات المناسبة لنشاطك فقط. تقدر تبحث عن أي منتج في السوق بالكامل متى ما احتجته.</p></div>
        <Link className="button secondary" href="/alerts"><Tags size={17} /> السعر الأذكى</Link>
      </section>

      <form className="marketSearch" action="/marketplace">
        <PackageSearch size={19} />
        <input name="q" defaultValue={q} placeholder="ابحث في كل السوق: منتج، باركود أو اسم مورد..." />
        <button className="button primary">بحث</button>
      </form>

      <section className="marketGrid">
        {listings.map((listing) => {
          const key = listing.barcode || listing.name.trim().toLowerCase();
          const isBest = Number(listing.price) === bestByKey.get(key);
          const isFavorite = favoriteIds.has(listing.sellerBusinessId);
          return (
            <article className="panel marketCard" key={listing.id}>
              <div className="marketCardTop">
                <div><h3>{listing.name}</h3><div className="marketMeta">{listing.category || activityLabels[listing.activity] || "بدون تصنيف"}{listing.barcode ? ` · ${listing.barcode}` : ""}</div></div>
                <div className="marketProductIcon"><ShoppingBasket size={21} /></div>
              </div>
              <div className="marketPrice"><div><strong>{formatSar(Number(listing.price))}</strong><span> / {listing.unit}</span></div>{isBest && <span className="bestPriceTag">أفضل سعر</span>}</div>
              <div className="marketStock"><span className="marketChip good">متوفر {Number(listing.quantity).toLocaleString("ar-SA")}</span><span className="marketChip">حد الطلب {Number(listing.minOrderQty).toLocaleString("ar-SA")}</span></div>
              <div className="marketSeller"><div><strong>{listing.seller.name}</strong><span>{listing.seller.city || "السعودية"}{isFavorite ? " · موردك المفضل" : ""}</span></div>{canBuy && <FavoriteSupplierButton sellerBusinessId={listing.sellerBusinessId} initialFavorite={isFavorite} />}</div>
              {canBuy ? <MarketplaceBuyButton listingId={listing.id} minOrderQty={Number(listing.minOrderQty)} available={Number(listing.quantity)} /> : <div className="infoNote">أنت داخل حساب مورد. استخدم حساب تاجر أو «الاثنان» للشراء.</div>}
            </article>
          );
        })}
        {!listings.length && <article className="panel smartPriceEmpty"><div className="softIcon brand"><PackageSearch size={21} /></div><h2>{q ? "لا توجد منتجات مطابقة" : "لا توجد منتجات مناسبة لنشاطك الآن"}</h2><p>{q ? "جرّب كلمة بحث أخرى." : "عندما ينشر الموردون منتجات ضمن نشاط منشأتك ستظهر هنا تلقائيًا."}</p></article>}
      </section>
    </>
  );
}
