"use client";

import { Banknote, Barcode, ChefHat, CreditCard, ShoppingCart, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatSar } from "@/lib/format";

type RecipeComponent = {
  id: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  canRemove: boolean;
  canExtra: boolean;
  extraPrice: number;
  yieldPercent: number;
};

type Product = {
  id: string;
  name: string;
  barcode: string | null;
  salePrice: number;
  quantity: number;
  availableQuantity: number;
  unit: string;
  recipe: RecipeComponent[];
};

type Adjustment = 0 | 1 | 2;
type CartLine = Product & { qty: number; adjustments: Record<string, Adjustment> };

function isContinuousUnit(unit: string) {
  const value = unit.trim().toLowerCase();
  return ["كيلو", "كجم", "غرام", "جرام", "غ", "لتر", "مل", "kg", "g", "l", "ml"].includes(value);
}

function lineUnitPrice(item: CartLine) {
  return item.salePrice + item.recipe.reduce((sum, component) => {
    const multiplier = item.adjustments[component.id] ?? 1;
    return multiplier > 1 ? sum + component.extraPrice * (multiplier - 1) : sum;
  }, 0);
}

export function PosTerminal({ products }: { products: Product[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return products.slice(0, 16);
    return products.filter((item) => item.name.toLowerCase().includes(value) || item.barcode?.includes(value)).slice(0, 16);
  }, [products, query]);

  function add(product: Product) {
    setMessage("");
    const limit = product.availableQuantity;
    if (limit <= 0) {
      setMessage(product.recipe.length ? `مكونات ${product.name} لا تكفي لطلب جديد.` : `لا يوجد مخزون من ${product.name}.`);
      return;
    }
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      const currentQty = existing?.qty ?? 0;
      const nextQty = Math.min(limit, currentQty + 1);
      if (nextQty <= currentQty) {
        setMessage(`المتاح من ${product.name} هو ${limit.toLocaleString("ar-SA")} ${product.recipe.length ? "وحدة" : product.unit}.`);
        return current;
      }
      return existing
        ? current.map((item) => item.id === product.id ? { ...item, qty: nextQty } : item)
        : [...current, { ...product, qty: 1, adjustments: {} }];
    });
  }

  function setQuantity(id: string, value: number) {
    setCart((current) => current
      .map((item) => item.id === id ? { ...item, qty: Math.max(0, Math.min(item.availableQuantity, value || 0)) } : item)
      .filter((item) => item.qty > 0));
  }

  function change(id: string, delta: number) {
    setCart((current) => current
      .map((item) => {
        if (item.id !== id) return item;
        const step = isContinuousUnit(item.unit) && !item.recipe.length ? 0.1 : 1;
        return { ...item, qty: Math.max(0, Math.min(item.availableQuantity, item.qty + delta * step)) };
      })
      .filter((item) => item.qty > 0));
  }

  function toggleAdjustment(productId: string, component: RecipeComponent, target: Adjustment) {
    setCart((current) => current.map((item) => {
      if (item.id !== productId) return item;
      const currentValue = item.adjustments[component.id] ?? 1;
      const next = currentValue === target ? 1 : target;
      return { ...item, adjustments: { ...item.adjustments, [component.id]: next } };
    }));
  }

  const total = cart.reduce((sum, item) => sum + item.qty * lineUnitPrice(item), 0);

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
        items: cart.map((item) => ({
          productId: item.id,
          quantity: item.qty,
          unitPrice: item.salePrice,
          adjustments: Object.entries(item.adjustments).map(([componentId, multiplier]) => ({ componentId, multiplier })),
        })),
      }),
    });
    const result = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      if (result.error?.startsWith?.("INSUFFICIENT_STOCK")) {
        const ingredient = String(result.error).split(":").slice(1).join(":");
        setMessage(ingredient ? `المخزون غير كافٍ: ${ingredient}.` : "تغيّر المخزون أثناء البيع. حدّث الصفحة وراجع الكميات.");
      } else if (result.error?.startsWith?.("INCOMPATIBLE_RECIPE_UNITS")) {
        setMessage("وحدة أحد مكونات الوصفة لا تتوافق مع وحدة المخزون. راجع الوصفة.");
      } else {
        setMessage("تعذر تسجيل عملية البيع.");
      }
      return;
    }
    setCart([]);
    setMessage("تم تسجيل البيع وخصم المخزون والمكونات تلقائيًا ✅");
    router.refresh();
  }

  return (
    <section className="posGrid">
      <article className="panel posCatalog">
        <div className="panelHeader"><div><span className="eyebrow">بيع سريع</span><h2>اختر الصنف أو امسح الباركود</h2></div></div>
        <div className="barcodeField"><Barcode size={21} /><input aria-label="بحث أو باركود" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="امسح الباركود أو اكتب اسم الصنف..." /></div>
        <div className="quickProducts">
          {filtered.map((product) => (
            <button className={`quickProduct ${product.recipe.length ? "recipeProduct" : ""}`} key={product.id} onClick={() => add(product)} disabled={product.availableQuantity <= 0}>
              <div className="productThumb large">{product.recipe.length ? <ChefHat size={20} /> : product.name.slice(0, 1)}</div>
              <strong>{product.name}</strong>
              <span>{formatSar(product.salePrice)} · {product.recipe.length ? `يكفي تقريبًا ${product.availableQuantity.toLocaleString("ar-SA")} طلب` : `متاح ${product.quantity.toLocaleString("ar-SA")} ${product.unit}`}</span>
              {product.recipe.length ? <small>{product.recipe.length} مكونات مرتبطة</small> : null}
            </button>
          ))}
          {!filtered.length && <div className="infoNote">لا توجد أصناف مطابقة.</div>}
        </div>
      </article>

      <article className="panel cartPanel">
        <div className="panelHeader"><div><span className="eyebrow">السلة الحالية</span><h2>{cart.length} أصناف</h2></div><ShoppingCart size={21} /></div>
        <div className="cartList">
          {cart.map((item) => {
            const unitPrice = lineUnitPrice(item);
            const continuous = isContinuousUnit(item.unit) && !item.recipe.length;
            return (
              <div className="cartRow recipeCartRow" key={item.id}>
                <div className="grow"><strong>{item.name}</strong><span>{formatSar(unitPrice)} {continuous ? `لكل ${item.unit}` : "للوحدة"}</span>
                  {item.recipe.length ? <div className="recipeModifiers">
                    {item.recipe.filter((component) => component.canRemove || component.canExtra).map((component) => {
                      const value = item.adjustments[component.id] ?? 1;
                      return <div className="modifierGroup" key={component.id}><span>{component.ingredientName}</span>
                        {component.canRemove ? <button type="button" className={value === 0 ? "active danger" : ""} onClick={() => toggleAdjustment(item.id, component, 0)}>بدون</button> : null}
                        {component.canExtra ? <button type="button" className={value === 2 ? "active" : ""} onClick={() => toggleAdjustment(item.id, component, 2)}>إضافي{component.extraPrice ? ` +${component.extraPrice.toLocaleString("ar-SA")}` : ""}</button> : null}
                      </div>;
                    })}
                  </div> : null}
                </div>
                <div className="qtyControl"><button type="button" onClick={() => change(item.id, -1)}>-</button><input aria-label={`كمية ${item.name}`} type="number" min={continuous ? "0.001" : "1"} step={continuous ? "0.001" : "1"} value={item.qty} onChange={(event) => setQuantity(item.id, Number(event.target.value))} /><button type="button" onClick={() => change(item.id, 1)}>+</button></div>
                <strong>{formatSar(item.qty * unitPrice)}</strong>
                <button className="iconButton" type="button" onClick={() => setCart((current) => current.filter((line) => line.id !== item.id))} aria-label="حذف"><Trash2 size={16} /></button>
              </div>
            );
          })}
          {!cart.length && <div className="infoNote">السلة فارغة. اختر صنفًا من القائمة. الأصناف بالوزن تقبل مثل 1.5 كجم.</div>}
        </div>
        <div className="cartTotals"><div className="grandTotal"><span>الإجمالي</span><strong>{formatSar(total)}</strong></div></div>
        {message && <div className="infoNote">{message}</div>}
        <div className="paymentButtons">
          <button className="button secondary" type="button" onClick={() => checkout("CASH")} disabled={!cart.length || loading}><Banknote size={17} /> نقدي</button>
          <button className="button primary" type="button" onClick={() => checkout("CARD")} disabled={!cart.length || loading}><CreditCard size={17} /> {loading ? "جاري التسجيل..." : "مدى / بطاقة"}</button>
        </div>
      </article>
    </section>
  );
}
