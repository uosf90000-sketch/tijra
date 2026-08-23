"use client";

import { BrowserMultiFormatReader } from "@zxing/browser";
import { Banknote, Barcode, Camera, ChefHat, CreditCard, ScanLine, ShoppingCart, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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

type Conversion = { id: string; name: string; factor: number; barcode: string | null; salePrice: number | null };
type SaleMode = "STANDARD" | "WEIGHT" | "SERIAL" | "RECIPE" | "SERVICE";

type Product = {
  id: string;
  name: string;
  barcode: string | null;
  salePrice: number;
  quantity: number;
  availableQuantity: number;
  unit: string;
  saleMode: SaleMode;
  size: string | null;
  color: string | null;
  variantGroup: string | null;
  serials: string[];
  conversions: Conversion[];
  recipe: RecipeComponent[];
};

type Adjustment = 0 | 1 | 2;
type CartLine = Product & {
  cartKey: string;
  qty: number;
  factor: number;
  displayUnit: string;
  displayPrice: number;
  adjustments: Record<string, Adjustment>;
  serialText: string;
};
type ScannerControls = { stop: () => void };

function isContinuousUnit(unit: string) {
  const value = unit.trim().toLowerCase();
  return ["كيلو", "كجم", "غرام", "جرام", "غ", "لتر", "مل", "kg", "g", "l", "ml"].includes(value);
}

function lineUnitPrice(item: CartLine) {
  return item.displayPrice + item.recipe.reduce((sum, component) => {
    const multiplier = item.adjustments[component.id] ?? 1;
    return multiplier > 1 ? sum + component.extraPrice * (multiplier - 1) : sum;
  }, 0);
}

function parseSerials(value: string) {
  return value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
}

export function PosTerminal({ products, locationId, businessActivity }: { products: Product[]; locationId: string; businessActivity: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef = useRef<ScannerControls | null>(null);
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const scanTargets = useMemo(() => {
    const targets = new Map<string, { product: Product; conversion?: Conversion }>();
    for (const product of products) {
      if (product.barcode) targets.set(product.barcode, { product });
      for (const conversion of product.conversions) if (conversion.barcode) targets.set(conversion.barcode, { product, conversion });
    }
    return targets;
  }, [products]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return products.slice(0, 16);
    return products.filter((item) => item.name.toLowerCase().includes(value) || item.barcode?.includes(value) || item.conversions.some((unit) => unit.barcode?.includes(value))).slice(0, 16);
  }, [products, query]);

  function availableDisplayQty(product: Product, factor: number) {
    if (product.saleMode === "SERVICE") return 100000000;
    return Math.max(0, product.availableQuantity / factor);
  }

  function add(product: Product, conversion?: Conversion) {
    setMessage("");
    const factor = conversion?.factor ?? 1;
    if (product.recipe.length && factor !== 1) {
      setMessage("الوصفات تباع بوحدتها الأساسية حتى تبقى المكونات دقيقة.");
      return;
    }
    const limit = availableDisplayQty(product, factor);
    if (limit <= 0) {
      setMessage(product.recipe.length ? `مكونات ${product.name} لا تكفي لطلب جديد.` : `لا يوجد مخزون من ${product.name}.`);
      return;
    }
    const cartKey = `${product.id}:${conversion?.id || "base"}`;
    const displayUnit = conversion?.name || product.unit;
    const displayPrice = conversion?.salePrice ?? (conversion ? product.salePrice * factor : product.salePrice);
    setCart((current) => {
      const existing = current.find((item) => item.cartKey === cartKey);
      const currentQty = existing?.qty ?? 0;
      const continuous = (product.saleMode === "WEIGHT" || isContinuousUnit(displayUnit)) && !product.recipe.length;
      const increment = continuous ? 0.1 : 1;
      const nextQty = Math.min(limit, currentQty + increment);
      if (nextQty <= currentQty) {
        setMessage(`المتاح من ${product.name} هو ${limit.toLocaleString("ar-SA")} ${displayUnit}.`);
        return current;
      }
      return existing
        ? current.map((item) => item.cartKey === cartKey ? { ...item, qty: nextQty } : item)
        : [...current, { ...product, cartKey, qty: increment, factor, displayUnit, displayPrice, adjustments: {}, serialText: "" }];
    });
  }

  function handleScannedCode(code: string) {
    const target = scanTargets.get(code);
    if (!target) {
      setMessage(`الباركود ${code} غير مسجل. أضف المنتج أو وحدة البيع أولًا.`);
      return;
    }
    add(target.product, target.conversion);
    if (navigator.vibrate) navigator.vibrate(60);
  }

  useEffect(() => {
    if (!scannerOpen || !videoRef.current) return;
    let cancelled = false;
    const reader = new BrowserMultiFormatReader();
    reader.decodeFromConstraints({ audio: false, video: { facingMode: { ideal: "environment" } } }, videoRef.current, (result, scanError, controls) => {
      if (cancelled) return;
      if (controls) scannerControlsRef.current = controls;
      if (result) {
        const code = result.getText();
        const now = Date.now();
        if (lastScanRef.current.code !== code || now - lastScanRef.current.at > 850) {
          lastScanRef.current = { code, at: now };
          handleScannedCode(code);
        }
      } else if (scanError && scanError.name !== "NotFoundException") {
        console.warn("POS barcode scan error", scanError);
      }
    }).then((controls) => { if (!cancelled) scannerControlsRef.current = controls; else controls.stop(); }).catch(() => setMessage("تعذر فتح الكاميرا. تأكد من السماح لتِجرا باستخدامها."));
    return () => { cancelled = true; scannerControlsRef.current?.stop(); scannerControlsRef.current = null; };
  }, [scannerOpen, scanTargets]);

  function closeScanner() {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    setScannerOpen(false);
  }

  function setQuantity(cartKey: string, value: number) {
    setCart((current) => current.map((item) => item.cartKey === cartKey ? { ...item, qty: Math.max(0, Math.min(availableDisplayQty(item, item.factor), value || 0)) } : item).filter((item) => item.qty > 0));
  }

  function change(cartKey: string, delta: number) {
    setCart((current) => current.map((item) => {
      if (item.cartKey !== cartKey) return item;
      const continuous = (item.saleMode === "WEIGHT" || isContinuousUnit(item.displayUnit)) && !item.recipe.length;
      const step = continuous ? 0.1 : 1;
      return { ...item, qty: Math.max(0, Math.min(availableDisplayQty(item, item.factor), item.qty + delta * step)) };
    }).filter((item) => item.qty > 0));
  }

  function toggleAdjustment(cartKey: string, component: RecipeComponent, target: Adjustment) {
    setCart((current) => current.map((item) => {
      if (item.cartKey !== cartKey) return item;
      const currentValue = item.adjustments[component.id] ?? 1;
      const next = currentValue === target ? 1 : target;
      return { ...item, adjustments: { ...item.adjustments, [component.id]: next } };
    }));
  }

  const total = cart.reduce((sum, item) => sum + item.qty * lineUnitPrice(item), 0);

  async function checkout(paymentMethod: "CASH" | "CARD") {
    if (!cart.length || loading) return;
    for (const item of cart) {
      if (item.saleMode !== "SERIAL") continue;
      const serials = parseSerials(item.serialText);
      const expected = Math.round(item.qty * item.factor);
      if (serials.length !== expected) {
        setMessage(`${item.name}: أدخل ${expected} رقم Serial / IMEI قبل إتمام البيع.`);
        return;
      }
    }
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/sales", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        paymentMethod,
        invoiceNumber: `POS-${Date.now()}`,
        locationId,
        items: cart.map((item) => ({
          productId: item.id,
          quantity: item.qty * item.factor,
          unitPrice: item.displayPrice / item.factor,
          serials: item.saleMode === "SERIAL" ? parseSerials(item.serialText) : undefined,
          adjustments: Object.entries(item.adjustments).map(([componentId, multiplier]) => ({ componentId, multiplier })),
        })),
      }),
    });
    const result = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      if (result.error?.startsWith?.("INSUFFICIENT")) {
        const itemName = String(result.error).split(":").slice(1).join(":");
        setMessage(itemName ? `المخزون غير كافٍ: ${itemName}.` : "تغيّر المخزون أثناء البيع. حدّث الصفحة وراجع الكميات.");
      } else if (String(result.error || "").startsWith("SERIAL") || result.error === "DUPLICATE_SERIALS") {
        setMessage("راجع أرقام Serial / IMEI؛ أحدها غير متاح أو العدد غير مطابق.");
      } else if (result.error?.startsWith?.("INCOMPATIBLE_RECIPE_UNITS")) {
        setMessage("وحدة أحد مكونات الوصفة لا تتوافق مع وحدة المخزون. راجع الوصفة.");
      } else {
        setMessage("تعذر تسجيل عملية البيع.");
      }
      return;
    }
    setCart([]);
    setMessage("تم تسجيل البيع وتحديث المخزون وسجل الحركة تلقائيًا ✅");
    router.refresh();
  }

  return (
    <section className="posGrid">
      <article className="panel posCatalog">
        <div className="panelHeader"><div><span className="eyebrow">بيع سريع · {businessActivity}</span><h2>اختر الصنف أو امسح بالكاميرا</h2></div><button type="button" className="button secondary compact" onClick={() => setScannerOpen(true)}><Camera size={17} /> مسح بالكاميرا</button></div>
        <div className="barcodeField"><Barcode size={21} /><input aria-label="بحث أو باركود" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); const code = query.trim(); if (code) { handleScannedCode(code); setQuery(""); } } }} placeholder="قارئ باركود، رقم الكود، أو اسم الصنف..." /></div>
        <div className="quickProducts">
          {filtered.map((product) => (
            <div className="quickProductCard" key={product.id}>
              <button className={`quickProduct ${product.recipe.length ? "recipeProduct" : ""}`} onClick={() => add(product)} disabled={product.availableQuantity <= 0 && product.saleMode !== "SERVICE"}>
                <div className="productThumb large">{product.recipe.length ? <ChefHat size={20} /> : product.name.slice(0, 1)}</div>
                <strong>{product.name}</strong>
                <span>{formatSar(product.salePrice)} · {product.saleMode === "SERVICE" ? "خدمة" : product.recipe.length ? `يكفي تقريبًا ${product.availableQuantity.toLocaleString("ar-SA")} طلب` : `متاح ${product.quantity.toLocaleString("ar-SA")} ${product.unit}`}</span>
                {product.saleMode === "SERIAL" ? <small>{product.serials.length} رقم Serial/IMEI متاح</small> : product.size || product.color ? <small>{[product.size, product.color].filter(Boolean).join(" · ")}</small> : null}
              </button>
              {product.conversions.length ? <div className="unitQuickRow">{product.conversions.slice(0, 4).map((conversion) => <button type="button" key={conversion.id} onClick={() => add(product, conversion)}>{conversion.name} · {formatSar(conversion.salePrice ?? product.salePrice * conversion.factor)}</button>)}</div> : null}
            </div>
          ))}
          {!filtered.length && <div className="infoNote">لا توجد أصناف مطابقة.</div>}
        </div>
      </article>

      <article className="panel cartPanel">
        <div className="panelHeader"><div><span className="eyebrow">السلة الحالية</span><h2>{cart.length} أصناف</h2></div><ShoppingCart size={21} /></div>
        <div className="cartList">
          {cart.map((item) => {
            const unitPrice = lineUnitPrice(item);
            const continuous = (item.saleMode === "WEIGHT" || isContinuousUnit(item.displayUnit)) && !item.recipe.length;
            return (
              <div className="cartRow recipeCartRow" key={item.cartKey}>
                <div className="grow"><strong>{item.name}</strong><span>{formatSar(unitPrice)} لكل {item.displayUnit}{item.factor !== 1 ? ` · يخصم ${item.factor.toLocaleString("ar-SA")} ${item.unit}` : ""}</span>
                  {item.recipe.length ? <div className="recipeModifiers">
                    {item.recipe.filter((component) => component.canRemove || component.canExtra).map((component) => {
                      const value = item.adjustments[component.id] ?? 1;
                      return <div className="modifierGroup" key={component.id}><span>{component.ingredientName}</span>
                        {component.canRemove ? <button type="button" className={value === 0 ? "active danger" : ""} onClick={() => toggleAdjustment(item.cartKey, component, 0)}>بدون</button> : null}
                        {component.canExtra ? <button type="button" className={value === 2 ? "active" : ""} onClick={() => toggleAdjustment(item.cartKey, component, 2)}>إضافي{component.extraPrice ? ` +${component.extraPrice.toLocaleString("ar-SA")}` : ""}</button> : null}
                      </div>;
                    })}
                  </div> : null}
                  {item.saleMode === "SERIAL" ? <textarea className="serialInput" rows={2} value={item.serialText} onChange={(event) => setCart((current) => current.map((line) => line.cartKey === item.cartKey ? { ...line, serialText: event.target.value } : line))} placeholder={`أدخل ${Math.round(item.qty * item.factor)} رقم Serial / IMEI — رقم بكل سطر`} /> : null}
                </div>
                <div className="qtyControl"><button type="button" onClick={() => change(item.cartKey, -1)}>-</button><input aria-label={`كمية ${item.name}`} type="number" min={continuous ? "0.001" : "1"} step={continuous ? "0.001" : "1"} value={item.qty} onChange={(event) => setQuantity(item.cartKey, Number(event.target.value))} /><button type="button" onClick={() => change(item.cartKey, 1)}>+</button></div>
                <strong>{formatSar(item.qty * unitPrice)}</strong>
                <button className="iconButton" type="button" onClick={() => setCart((current) => current.filter((line) => line.cartKey !== item.cartKey))} aria-label="حذف"><Trash2 size={16} /></button>
              </div>
            );
          })}
          {!cart.length && <div className="infoNote">السلة فارغة. تقدر تبيع 5 حبات، 1.5 كجم، كرتون كامل، خدمة، أو وصفة من نفس الكاشير.</div>}
        </div>
        <div className="cartTotals"><div className="grandTotal"><span>الإجمالي</span><strong>{formatSar(total)}</strong></div></div>
        {message && <div className="infoNote">{message}</div>}
        <div className="paymentButtons">
          <button className="button secondary" type="button" onClick={() => checkout("CASH")} disabled={!cart.length || loading}><Banknote size={17} /> نقدي</button>
          <button className="button primary" type="button" onClick={() => checkout("CARD")} disabled={!cart.length || loading}><CreditCard size={17} /> {loading ? "جاري التسجيل..." : "مدى / بطاقة"}</button>
        </div>
      </article>

      {scannerOpen ? <div className="barcodeScannerOverlay" role="dialog" aria-modal="true" aria-label="ماسح باركود الكاشير"><div className="barcodeScannerCard"><div className="barcodeScannerHeader"><div><strong>المسح المتواصل</strong><span>امسح المنتجات واحدًا بعد الآخر؛ تِجرا يضيفها للسلة ويبقي الكاميرا مفتوحة.</span></div><button type="button" className="iconButton" onClick={closeScanner}><X size={20} /></button></div><div className="barcodeVideoFrame"><video ref={videoRef} playsInline muted autoPlay /><div className="barcodeTarget" aria-hidden="true"><span /></div></div><div className="barcodeScannerFooter"><span><ScanLine size={15} /> كل قراءة صحيحة تُضاف مباشرة للسلة.</span><button type="button" className="button secondary" onClick={closeScanner}>إغلاق الماسح</button></div></div></div> : null}
    </section>
  );
}
