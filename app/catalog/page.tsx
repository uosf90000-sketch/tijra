import Link from "next/link";
import { redirect } from "next/navigation";
import { Boxes, PackageSearch, Store, Tags } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";

export const metadata = { title: "كتالوج المنتجات" };
export const dynamic = "force-dynamic";

function normalize(value: string) {
  return value.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

type CatalogItem = {
  key: string;
  name: string;
  unit: string;
  barcode: string | null;
  suppliers: Set<string>;
  minPrice: number;
  maxPrice: number;
  totalStock: number;
  bestSeller: string;
};

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  const params = await searchParams;
  const q = (params.q || "").trim();

  const listings = await db.marketplaceListing.findMany({
    where: {
      active: true,
      quantity: { gt: 0 },
      sellerBusinessId: { not: context.business.id },
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { barcode: { contains: q } }] } : {}),
    },
    include: { seller: true },
    orderBy: { price: "asc" },
    take: 3000,
  });

  const map = new Map<string, CatalogItem>();
  for (const listing of listings) {
    const key = listing.barcode ? `barcode:${listing.barcode}` : `name:${normalize(listing.name)}:${listing.unit}`;
    const current = map.get(key);
    if (!current) {
      map.set(key, {
        key,
        name: listing.name,
        unit: listing.unit,
        barcode: listing.barcode,
        suppliers: new Set([listing.sellerBusinessId]),
        minPrice: Number(listing.price),
        maxPrice: Number(listing.price),
        totalStock: Number(listing.quantity),
        bestSeller: listing.seller.name,
      });
    } else {
      current.suppliers.add(listing.sellerBusinessId);
      current.maxPrice = Math.max(current.maxPrice, Number(listing.price));
      current.totalStock += Number(listing.quantity);
      if (Number(listing.price) < current.minPrice) {
        current.minPrice = Number(listing.price);
        current.bestSeller = listing.seller.name;
        current.name = listing.name;
      }
    }
  }
  const items = [...map.values()].sort((a, b) => b.suppliers.size - a.suppliers.size || a.minPrice - b.minPrice);
  const multiSupplier = items.filter((item) => item.suppliers.size > 1).length;
  const totalSuppliers = new Set(listings.map((listing) => listing.sellerBusinessId)).size;

  return (
    <>
      <PageHeader eyebrow="السوق" title="كتالوج المنتجات الموحد" description="كل منتج يظهر مرة واحدة، وتحته عروض الموردين المختلفة. الباركود هو المطابقة الأدق، والاسم + الوحدة بديل عندما لا يوجد باركود." />
      <section className="metricsGrid three">
        <MetricCard label="منتجات موحدة" value={`${items.length}`} note="بعد دمج العروض المتطابقة" icon={PackageSearch} />
        <MetricCard label="لها أكثر من مورد" value={`${multiSupplier}`} note="جاهزة للمقارنة" icon={Tags} tone="blue" />
        <MetricCard label="موردون في الكتالوج" value={`${totalSuppliers}`} note="بعروض متوفرة الآن" icon={Store} tone="amber" />
      </section>
      <form className="panel catalogSearch" method="get"><input name="q" defaultValue={q} placeholder="ابحث: قودي تونة بالزيت 185 جم أو الباركود" /><button className="button primary">بحث</button></form>
      <section className="catalogGrid">
        {items.map((item) => <article className="panel catalogCard" key={item.key}>
          <div className="catalogCardIcon"><Boxes size={22} /></div>
          <div className="catalogCardBody"><span className="eyebrow">{item.suppliers.size} مورد</span><h2>{item.name}</h2><p>{item.barcode ? `باركود ${item.barcode}` : `مطابقة بالاسم والوحدة`} · {item.unit}</p></div>
          <div className="catalogPrices"><span>أفضل سعر</span><strong>{formatSar(item.minPrice)}</strong>{item.maxPrice > item.minPrice ? <small>حتى {formatSar(item.maxPrice)}</small> : null}</div>
          <div className="catalogMeta"><span>المتوفر لدى الجميع: {item.totalStock.toLocaleString("ar-SA")}</span><span>الأفضل: {item.bestSeller}</span></div>
          <Link className="button secondary compact" href={`/marketplace?q=${encodeURIComponent(item.name)}`}>عرض عروض الموردين</Link>
        </article>)}
        {!items.length && <div className="panel workflowEmpty"><PackageSearch size={28} /><h2>لا توجد نتائج</h2><p>جرّب اسمًا آخر أو افتح السوق.</p><Link className="button primary" href="/marketplace">السوق</Link></div>}
      </section>
    </>
  );
}
