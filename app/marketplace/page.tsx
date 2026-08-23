import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, MapPin, PackageSearch, Search, ShoppingBasket } from "lucide-react";
import { MarketplaceStorefront } from "@/components/marketplace-storefront";
import { PageHeader } from "@/components/page-header";
import { firstPermissionHref, hasAppPermission } from "@/lib/access";
import { getSessionContext } from "@/lib/auth";
import { normalizeCityKey } from "@/lib/city";
import { db } from "@/lib/db";
import { expandProductSearchTerms, productNameSearchScore } from "@/lib/product-search";

export const metadata = { title: "سوق تِجرا" };
export const dynamic = "force-dynamic";

type CityOption = { key: string; label: string; variants: string[] };

export default async function MarketplacePage({ searchParams }: { searchParams: Promise<{ q?: string; city?: string; category?: string }> }) {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (context.membership.role === "STAFF" && !hasAppPermission(context.membership, "PURCHASES")) redirect(firstPermissionHref(context.membership));
  if (context.business.businessType === "SUPPLIER") redirect("/marketplace/seller");

  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const selectedCategory = params.category?.trim() ?? "";
  const searchTerms = expandProductSearchTerms(q);
  const nameSearchFilters = searchTerms.map((term) => ({ name: { contains: term, mode: "insensitive" as const } }));

  const supplierCityRows = await db.business.findMany({
    where: {
      id: { not: context.business.id },
      businessType: { in: ["SUPPLIER", "BOTH"] },
      city: { not: null },
      marketplaceListings: { some: { active: true, quantity: { gt: 0 } } },
    },
    select: { city: true },
    orderBy: { city: "asc" },
  });

  const cityMap = new Map<string, CityOption>();
  for (const row of supplierCityRows) {
    const city = row.city?.trim();
    if (!city) continue;
    const key = normalizeCityKey(city);
    if (!key) continue;
    const existing = cityMap.get(key);
    if (existing) {
      if (!existing.variants.includes(city)) existing.variants.push(city);
    } else {
      cityMap.set(key, { key, label: city, variants: [city] });
    }
  }

  const ownCity = context.business.city?.trim() ?? "";
  const ownCityKey = normalizeCityKey(ownCity);
  if (ownCityKey && !cityMap.has(ownCityKey)) cityMap.set(ownCityKey, { key: ownCityKey, label: ownCity, variants: [] });

  const requestedCity = params.city?.trim() ?? "";
  const selectedCityKey = requestedCity === "all" ? "all" : requestedCity ? normalizeCityKey(requestedCity) : ownCityKey || "all";
  const cityOptions = [...cityMap.values()].sort((a, b) => a.label.localeCompare(b.label, "ar"));
  const selectedCity = selectedCityKey === "all" ? null : cityMap.get(selectedCityKey) ?? null;
  const selectedCityLabel = selectedCityKey === "all" ? "كل المدن" : selectedCity?.label || ownCity || requestedCity || "المدينة المحددة";
  const selectedCityVariants = selectedCity?.variants ?? [];
  const cityFilter = selectedCityKey !== "all"
    ? { seller: { city: { in: selectedCityVariants.length ? selectedCityVariants : ["__TIJRA_NO_CITY_MATCH__"] } } }
    : {};

  const baseWhere = {
    active: true,
    quantity: { gt: 0 },
    sellerBusinessId: { not: context.business.id },
    ...cityFilter,
  };

  const [rawListings, categoryRows, recentOrders] = await Promise.all([
    db.marketplaceListing.findMany({
      where: {
        ...baseWhere,
        ...(!q ? { activity: context.business.businessActivity } : {}),
        ...(selectedCategory ? { category: selectedCategory } : {}),
        ...(q ? { OR: [
          ...nameSearchFilters,
          { category: { contains: q, mode: "insensitive" as const } },
          { seller: { name: { contains: q, mode: "insensitive" as const } } },
          ...(/\d/.test(q) ? [{ barcode: { contains: q } }] : []),
        ] } : {}),
      },
      include: { seller: true },
      orderBy: [{ name: "asc" }, { price: "asc" }],
      take: 120,
    }),
    db.marketplaceListing.findMany({
      where: { ...baseWhere, activity: context.business.businessActivity, category: { not: null } },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
      take: 16,
    }),
    db.marketplaceOrder.findMany({
      where: { buyerBusinessId: context.business.id, status: { not: "CANCELLED" } },
      include: { items: { include: { listing: { include: { seller: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const listings = [...rawListings].sort((a, b) => {
    if (q) {
      const scoreDelta = productNameSearchScore(b.name, q) - productNameSearchScore(a.name, q);
      if (scoreDelta) return scoreDelta;
    }
    return a.name.localeCompare(b.name, "ar") || Number(a.price) - Number(b.price);
  });

  const bestByKey = new Map<string, number>();
  for (const listing of listings) {
    const key = listing.barcode || listing.name.trim().toLowerCase();
    const price = Number(listing.price);
    bestByKey.set(key, Math.min(bestByKey.get(key) ?? price, price));
  }

  const serializedListings = listings.map((listing) => {
    const key = listing.barcode || listing.name.trim().toLowerCase();
    return {
      id: listing.id,
      name: listing.name,
      category: listing.category,
      unit: listing.unit,
      price: Number(listing.price),
      quantity: Number(listing.quantity),
      minOrderQty: Number(listing.minOrderQty),
      sellerBusinessId: listing.sellerBusinessId,
      sellerName: listing.seller.name,
      sellerCity: listing.seller.city || "السعودية",
      isBest: Number(listing.price) === bestByKey.get(key),
    };
  });

  const reorderMap = new Map<string, { count: number; previousQuantity: number; listing: (typeof recentOrders)[number]["items"][number]["listing"] }>();
  for (const order of recentOrders) {
    for (const item of order.items) {
      const listing = item.listing;
      if (!listing.active || Number(listing.quantity) < Number(listing.minOrderQty) || listing.sellerBusinessId === context.business.id) continue;
      const current = reorderMap.get(listing.id);
      if (current) current.count += 1;
      else reorderMap.set(listing.id, { count: 1, previousQuantity: Number(item.quantity), listing });
    }
  }

  const reorders = [...reorderMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map(({ listing, previousQuantity }) => ({
      id: listing.id,
      name: listing.name,
      category: listing.category,
      unit: listing.unit,
      price: Number(listing.price),
      quantity: Number(listing.quantity),
      minOrderQty: Number(listing.minOrderQty),
      sellerBusinessId: listing.sellerBusinessId,
      sellerName: listing.seller.name,
      sellerCity: listing.seller.city || "السعودية",
      isBest: false,
      previousQuantity: Math.min(Number(listing.quantity), Math.max(Number(listing.minOrderQty), previousQuantity)),
    }));

  const categories = categoryRows.map((row) => row.category).filter((value): value is string => Boolean(value));
  const cityParam = selectedCityKey === "all" ? "all" : selectedCityKey;
  const categoryHref = (category: string) => `/marketplace?city=${encodeURIComponent(cityParam)}&category=${encodeURIComponent(category)}`;

  return (
    <>
      <PageHeader
        eyebrow="سوق الجملة"
        title="السوق"
        description="ابحث، اختر الكمية، وأرسل سلة واحدة. تِجرا يقسمها تلقائيًا حسب المورد."
        actions={<Link className="button secondary" href="/marketplace/orders"><ClipboardList size={17} /> طلباتي</Link>}
      />

      <section className="simpleMarketSearch panel">
        <div className="simpleMarketSearchTitle"><ShoppingBasket size={22} /><div><strong>وش تحتاج اليوم؟</strong><span>ابحث باسم المنتج أو المورد، ثم أضفه للسلة.</span></div></div>
        <form className="marketSearch" action="/marketplace">
          <label className="marketCityFilter"><MapPin size={18} /><span className="srOnly">مدينة المورد</span><select name="city" defaultValue={cityParam} aria-label="اختر مدينة المورد"><option value="all">كل المدن</option>{cityOptions.map((city) => <option key={city.key} value={city.key}>{city.label}</option>)}</select></label>
          <label className="marketQueryField"><Search size={19} /><span className="srOnly">بحث السوق</span><input name="q" defaultValue={q} placeholder="مثال: حليب شوفان، أكواب، مياه..." /></label>
          {selectedCategory ? <input type="hidden" name="category" value={selectedCategory} /> : null}
          <button className="button primary"><PackageSearch size={17} /> بحث</button>
        </form>

        {categories.length ? <div className="marketCategoryRow"><Link className={!selectedCategory ? "active" : ""} href={`/marketplace?city=${encodeURIComponent(cityParam)}`}>الكل</Link>{categories.map((category) => <Link key={category} className={selectedCategory === category ? "active" : ""} href={categoryHref(category)}>{category}</Link>)}</div> : null}
        <div className="simpleMarketContext"><MapPin size={14} /><span>{selectedCityLabel}</span>{q ? <span>· نتائج «{q}»</span> : null}{selectedCategory ? <span>· {selectedCategory}</span> : null}</div>
      </section>

      <MarketplaceStorefront listings={serializedListings} reorders={reorders} />
    </>
  );
}
