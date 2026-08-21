"use client";

import { Banknote, Barcode, CreditCard, ShoppingCart, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatSar } from "@/lib/format";

type Product = { id: string; name: string; barcode: string | null; salePrice: number; quantity: number; unit: string };
type CartLine = Product & { qty: number };

export function PosTerminal({ products }: { products: Product[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return products.slice(0, 12);
    return products.filter((item) => item.name.toLowerCase().includes(value) || item.barcode?.includes(value)).slice(0, 12);
  }, [products, query]);

  function add(product: Product) {
    setMessage("");
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      const currentQty = existing?.qty ?? 0;
      if (currentQty >= product.quantity) {
        setMessage(`المتاح من ${product.name} هو ${product.quantity} ${product.unit}.`);
        return current;
      }
      return existing
        ? current.map((item) => item.id === product.id ? { ...item, qty: item.qty + 1 } : item)
        : [...current, { ...product, qty: 1 }];
    });
  }

  function change(id: string, delta: number) {
    setCart((current) => current
      .map((item) => item.id === id ? { ...item, qty: Math.max(0, Math.min(item.quantity, item.qty + delta)) } : item)
      .filter((item) => item.qty > 0));
  }

  const total = cart.reduce((sum, item) => sum + item.qty * item.salePrice, 0);

  async function checkout(paymentMethod: "CASH" | "CARD") {
    if (!cart.length || loading) return;
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/sales", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        paymentMethod,
        invoiceNumber: `POS-${Date.now()}`,
        items: cart.map((item) => ({ productId: item.id, quantity: item.qty, unitPrice: item.salePrice })),
      }),
    });
    const result = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setMessage(result.error?.startsWith?.("INSUFFICIENT_STOCK") ? "تغيّر المخزون أثناء البيع. حدّث الصفحة وراجع الكميات." : "تعذر تسجيل عملية البيع.");
      return;
    }
    setCart([]);
    setMessage("تم تسجيل البيع وخصم الكميات من المخزون.");
    router.refresh();
  }

  return (
    <section className="posGrid">
      <article className="panel posCatalog">
        <div className="panelHeader"><div><span className="eyebrow">بيع سريع</span><h2>اختر الصنف أو امسح الباركود</h2></div></div>
        <div className="barcodeField"><Barcode size={21} /><input aria-label="بحث أو باركود" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="امسح الباركود أو اكتب اسم الصنف..." /></div>
        <div className="quickProducts">
          {filtered.map((product) => (
            <button className="quickProduct" key={product.id} onClick={() => add(product)} disabled={product.quantity <= 0}>
              <div className="productThumb large">{product.name.slice(0, 1)}</div>
              <strong>{product.name}</strong>
              <span>{formatSar(product.salePrice)} · متاح {product.quantity}</span>
            </button>
          ))}
          {!filtered.length && <div className="infoNote">لا توجد أصناف مطابقة.</div>}
        </div>
      </article>

      <article className="panel cartPanel">
        <div className="panelHeader"><div><span className="eyebrow">السلة الحالية</span><h2>{cart.length} أصناف</h2></div><ShoppingCart size={21} /></div>
        <div className="cartList">
          {cart.map((item) => (
            <div className="cartRow" key={item.id}>
              <div className="grow"><strong>{item.name}</strong><span>{formatSar(item.salePrice)} للوحدة</span></div>
              <div className="qtyControl"><button onClick={() => change(item.id, -1)}>-</button><span>{item.qty}</span><button onClick={() => change(item.id, 1)}>+</button></div>
              <strong>{formatSar(item.qty * item.salePrice)}</strong>
              <button className="iconButton" onClick={() => setCart((current) => current.filter((line) => line.id !== item.id))} aria-label="حذف"><Trash2 size={16} /></button>
            </div>
          ))}
          {!cart.length && <div className="infoNote">السلة فارغة. اختر صنفًا من القائمة.</div>}
        </div>
        <div className="cartTotals"><div className="grandTotal"><span>الإجمالي</span><strong>{formatSar(total)}</strong></div></div>
        {message && <div className="infoNote">{message}</div>}
        <div className="paymentButtons">
          <button className="button secondary" onClick={() => checkout("CASH")} disabled={!cart.length || loading}><Banknote size={17} /> نقدي</button>
          <button className="button primary" onClick={() => checkout("CARD")} disabled={!cart.length || loading}><CreditCard size={17} /> {loading ? "جاري التسجيل..." : "مدى / بطاقة"}</button>
        </div>
      </article>
    </section>
  );
}
