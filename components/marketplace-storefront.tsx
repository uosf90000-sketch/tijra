"use client";

import { Check, Minus, PackageSearch, Plus, ShoppingCart, Sparkles, Store, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatSar } from "@/lib/format";

type MarketListing = {
  id: string;
  name: string;
  category: string | null;
  unit: string;
  price: number;
  quantity: number;
  minOrderQty: number;
  sellerBusinessId: string;
  sellerName: string;
  sellerCity: string;
  isBest: boolean;
};

type ReorderSuggestion = MarketListing & { previousQuantity: number };
type CartState = Record<string, number>;

const unitLabels: Record<string, string> = {
  piece: "حبة",
  pieces: "حبة",
  pack: "عبوة / باك",
  carton: "كرتون",
  bag: "كيس",
  box: "صندوق",
  kg: "كيلو",
  g: "غرام",
  gram: "غرام",
  liter: "لتر",
  litre: "لتر",
  l: "لتر",
  ml: "مل",
};

function unitLabel(unit: string) {
  return unitLabels[unit.trim().toLowerCase()] ?? unit;
}

function clampQuantity(listing: MarketListing, value: number) {
  if (!Number.isFinite(value)) return listing.minOrderQty;
  return Math.min(listing.quantity, Math.max(listing.minOrderQty, value));
}

export function MarketplaceStorefront({ listings, reorders }: { listings: MarketListing[]; reorders: ReorderSuggestion[] }) {
  const router = useRouter();
  const [cart, setCart] = useState<CartState>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const byId = useMemo(() => new Map(listings.concat(reorders).map((listing) => [listing.id, listing])), [listings, reorders]);
  const cartLines = useMemo(() => Object.entries(cart).map(([id, quantity]) => {
    const listing = byId.get(id);
    return listing ? { listing, quantity } : null;
  }).filter((line): line is { listing: MarketListing; quantity: number } => Boolean(line)), [cart, byId]);

  const grouped = useMemo(() => {
    const groups = new Map<string, { sellerName: string; lines: typeof cartLines }>();
    for (const line of cartLines) {
      const current = groups.get(line.listing.sellerBusinessId) ?? { sellerName: line.listing.sellerName, lines: [] };
      current.lines.push(line);
      groups.set(line.listing.sellerBusinessId, current);
    }
    return [...groups.values()];
  }, [cartLines]);

  const total = cartLines.reduce((sum, line) => sum + line.quantity * line.listing.price, 0);

  function add(listing: MarketListing, preferredQuantity?: number) {
    setMessage("");
    setCart((current) => ({ ...current, [listing.id]: clampQuantity(listing, preferredQuantity ?? current[listing.id] ?? listing.minOrderQty) }));
  }

  function setQuantity(listing: MarketListing, value: number) {
    setCart((current) => ({ ...current, [listing.id]: clampQuantity(listing, value) }));
  }

  function remove(id: string) {
    setCart((current) => { const next = { ...current }; delete next[id]; return next; });
  }

  async function checkout() {
    if (!cartLines.length || loading) return;
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/marketplace/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: cartLines.map((line) => ({ listingId: line.listing.id, quantity: line.quantity })) }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const labels: Record<string, string> = { BELOW_MINIMUM: "أحد الأصناف أقل من الحد الأدنى للطلب.", INSUFFICIENT_STOCK: "كمية أحد الأصناف لم تعد متوفرة عند المورد.", LISTING_NOT_FOUND: "أحد العروض لم يعد متاحًا.", SELF_ORDER_NOT_ALLOWED: "لا يمكنك الشراء من منشأتك نفسها." };
        setMessage(labels[data.error] ?? "تعذر إرسال الطلبات. راجع السلة وحاول مرة أخرى.");
        return;
      }
      const count = Array.isArray(data.orders) ? data.orders.length : 1;
      setCart({}); setMessage(`تم إرسال السلة إلى ${count.toLocaleString("ar-SA")} مورد بنجاح ✅`); router.refresh();
    } catch { setMessage("تعذر الاتصال بالخادم."); }
    finally { setLoading(false); }
  }

  return (
    <div className="simpleMarketLayout">
      <div className="simpleMarketMain">
        {reorders.length > 0 ? <section className="marketReorderBlock">
          <div className="simpleSectionHead"><div><span className="eyebrow"><Sparkles size={13} /> إعادة الطلب</span><h2>أصناف تشتريها عادة</h2></div><span>ضغطة واحدة تعيد الكمية السابقة</span></div>
          <div className="marketReorderRow">{reorders.map((listing) => <button key={listing.id} type="button" className="marketReorderCard" onClick={() => add(listing, listing.previousQuantity)}><span className="marketProductAvatar">{listing.name.slice(0, 1)}</span><span><strong>{listing.name}</strong><small>{listing.sellerName} · {listing.previousQuantity.toLocaleString("ar-SA")} {unitLabel(listing.unit)}</small></span><Plus size={17} /></button>)}</div>
        </section> : null}

        <section>
          <div className="simpleSectionHead"><div><span className="eyebrow">المنتجات</span><h2>اختر ما تحتاجه</h2></div><span>{listings.length.toLocaleString("ar-SA")} عرض متاح</span></div>
          <div className="simpleMarketGrid">
            {listings.map((listing) => {
              const inCart = cart[listing.id] != null;
              return <article className="simpleMarketCard" key={listing.id}>
                <div className="simpleMarketProductTop"><div className="marketProductAvatar"><PackageSearch size={20} /></div><div className="grow"><strong>{listing.name}</strong><span>{listing.category || "منتج عام"}</span></div>{listing.isBest ? <span className="bestPriceTag">أفضل سعر</span> : null}</div>
                <div className="simpleMarketPrice"><strong>{formatSar(listing.price)}</strong><span>/ {unitLabel(listing.unit)}</span></div>
                <div className="simpleSupplierLine"><Store size={15} /><span>{listing.sellerName}</span><small>{listing.sellerCity}</small></div>
                <div className="simpleMarketFacts"><span>حد الطلب {listing.minOrderQty.toLocaleString("ar-SA")} {unitLabel(listing.unit)}</span><span>متوفر {listing.quantity.toLocaleString("ar-SA")} {unitLabel(listing.unit)}</span></div>
                <button className={`button ${inCart ? "secondary" : "primary"} fullWidth`} type="button" onClick={() => add(listing)} disabled={listing.quantity < listing.minOrderQty}>{inCart ? <><Check size={17} /> في السلة</> : <><Plus size={17} /> إضافة للطلب</>}</button>
              </article>;
            })}
            {!listings.length ? <div className="panel simpleMarketEmpty"><PackageSearch size={24} /><strong>لا توجد منتجات مطابقة</strong><span>غيّر البحث أو التصنيف أو المدينة.</span></div> : null}
          </div>
        </section>
      </div>

      <aside className="simpleMarketCart panel">
        <div className="simpleCartHead"><div><span className="eyebrow"><ShoppingCart size={13} /> السلة</span><h2>{cartLines.length ? `${cartLines.length.toLocaleString("ar-SA")} أصناف` : "سلة المشتريات"}</h2></div>{cartLines.length ? <button type="button" className="iconButton" onClick={() => setCart({})} aria-label="تفريغ السلة"><Trash2 size={17} /></button> : null}</div>
        {!cartLines.length ? <div className="simpleCartEmpty"><ShoppingCart size={24} /><span>أضف المنتجات التي تحتاجها، وتِجرا يقسم الطلب تلقائيًا حسب المورد.</span></div> : <div className="simpleCartGroups">{grouped.map((group) => <div className="simpleCartSupplier" key={group.sellerName}><strong><Store size={14} /> {group.sellerName}</strong>{group.lines.map(({ listing, quantity }) => <div className="simpleCartLine" key={listing.id}><div className="grow"><span>{listing.name}</span><small>{formatSar(listing.price)} / {unitLabel(listing.unit)}</small></div><div className="simpleQtyControl"><button type="button" onClick={() => quantity <= listing.minOrderQty ? remove(listing.id) : setQuantity(listing, quantity - 1)}><Minus size={13} /></button><input aria-label={`كمية ${listing.name}`} type="number" min={listing.minOrderQty} max={listing.quantity} value={quantity} onChange={(event) => setQuantity(listing, Number(event.target.value))} /><button type="button" onClick={() => setQuantity(listing, quantity + 1)}><Plus size={13} /></button></div></div>)}</div>)}</div>}
        <div className="simpleCartFooter"><div><span>الإجمالي المتوقع</span><strong>{formatSar(total)}</strong></div><button type="button" className="button primary fullWidth" disabled={!cartLines.length || loading} onClick={checkout}>{loading ? "جاري إرسال الطلبات..." : "إرسال الطلبات للموردين"}</button>{message ? <div className="infoNote">{message}</div> : null}<small>التوصيل والدفع يتم الاتفاق عليهما مباشرة بينك وبين كل مورد.</small></div>
      </aside>
    </div>
  );
}
