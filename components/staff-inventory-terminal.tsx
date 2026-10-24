"use client";

import { BrowserMultiFormatReader } from "@zxing/browser";
import { ArrowDownToLine, ArrowUpFromLine, Camera, ScanLine, X } from "lucide-react";
import { FormEvent, useMemo, useRef, useState } from "react";

type Product = { id: string; name: string; barcode: string | null; unit: string; quantity: number };
type ScannerControls = { stop: () => void };

export function StaffInventoryTerminal({ products, locations }: { products: Product[]; locations: Array<{ id: string; name: string }> }) {
  const [barcode, setBarcode] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [locationId, setLocationId] = useState(locations[0]?.id || "");
  const [reason, setReason] = useState("");
  const [direction, setDirection] = useState<"IN" | "OUT">("IN");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<ScannerControls | null>(null);

  const product = useMemo(() => products.find((item) => item.barcode === barcode) ?? null, [products, barcode]);

  function closeScanner() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setScannerOpen(false);
  }

  async function openScanner() {
    setMessage("");
    setScannerOpen(true);
    window.setTimeout(async () => {
      if (!videoRef.current) return;
      const reader = new BrowserMultiFormatReader();
      try {
        const controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: "environment" } } },
          videoRef.current,
          (result, error, scanControls) => {
            if (scanControls) controlsRef.current = scanControls;
            if (result) {
              setBarcode(result.getText());
              scanControls?.stop();
              controlsRef.current = null;
              setScannerOpen(false);
              if (navigator.vibrate) navigator.vibrate(70);
            } else if (error && error.name !== "NotFoundException") {
              console.warn("Inventory scan error", error);
            }
          },
        );
        controlsRef.current = controls;
      } catch {
        setScannerOpen(false);
        setMessage("تعذر فتح الكاميرا. تأكد من السماح لمدار باستخدامها.");
      }
    }, 50);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!locationId) return setMessage("ليس لديك موقع مخزون مصرح به.");
    if (!barcode || !product) {
      setMessage("امسح باركود صنف مسجل أولًا.");
      return;
    }
    const numericQuantity = Number(quantity);
    if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) {
      setMessage("أدخل كمية صحيحة.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/inventory/quick-adjust", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ barcode, direction, quantity: numericQuantity, locationId, reason: reason.trim() || undefined }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(result.error === "INSUFFICIENT_STOCK" ? "الكمية الموجودة لا تكفي للإخراج." : result.error === "PRODUCT_NOT_FOUND" ? "الباركود غير مسجل." :
          result.error === "STOCK_REASON_REQUIRED" ? "اكتب سبب الحركة بثمانية أحرف على الأقل حسب سياسة المنشأة." :
          result.error === "SUPERVISOR_REQUIRED_FOR_LARGE_STOCK_ADJUSTMENT" ? "هذه الحركة كبيرة وتحتاج مسؤول مخزون مخولًا." : "تعذر حفظ الحركة.");
        return;
      }
      setMessage(`تم ${direction === "IN" ? "إدخال" : "إخراج"} ${numericQuantity.toLocaleString("ar-SA")} ${product.unit} من ${product.name} ✅`);
      setBarcode("");
      setQuantity("1");
      setReason("");
    } catch {
      setMessage("تعذر الاتصال بالخادم.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="staffInventoryTerminal" onSubmit={submit}>
      <button type="button" className="staffCameraButton" onClick={openScanner}>
        <Camera size={30} />
        <strong>مسح الباركود بالكاميرا</strong>
        <span>وجّه الكاميرا إلى المنتج</span>
      </button>

      <label className="staffManualBarcode">
        <span>أو أدخل الباركود</span>
        <input value={barcode} onChange={(event) => setBarcode(event.target.value.trim())} inputMode="numeric" placeholder="رقم الباركود" />
      </label>

      <div className={`staffScannedProduct ${product ? "found" : ""}`}>
        <span>الصنف</span>
        <strong>{product?.name || (barcode ? "باركود غير مسجل" : "لم يتم مسح صنف")}</strong>
        {product ? <small>الوحدة: {product.unit}</small> : null}
      </div>

      <div className="staffDirectionSwitch" role="group" aria-label="نوع حركة المخزون">
        <button type="button" className={direction === "IN" ? "active" : ""} onClick={() => setDirection("IN")}><ArrowDownToLine size={19} /> إدخال</button>
        <button type="button" className={direction === "OUT" ? "active" : ""} onClick={() => setDirection("OUT")}><ArrowUpFromLine size={19} /> إخراج</button>
      </div>

      <label className="staffQuantityField"><span>الموقع المسموح</span><select value={locationId} onChange={(event) => setLocationId(event.target.value)}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
      <label className="staffQuantityField">
        <span>الكمية</span>
        <input value={quantity} onChange={(event) => setQuantity(event.target.value)} type="number" min="0.001" step="0.001" inputMode="decimal" />
        <small>{product?.unit || "وحدة"}</small>
      </label>

      <label className="staffManualBarcode">
        <span>سبب حركة المخزون (قد يكون إلزاميًا حسب سياسة المنشأة)</span>
        <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="مثال: توريد مباشر / تصحيح جرد / سحب تالف" />
      </label>
      {message ? <div className="staffActionMessage">{message}</div> : null}

      <button className="staffPrimaryAction" disabled={loading || !product || !locationId}>
        {loading ? "جاري الحفظ..." : direction === "IN" ? "حفظ الإدخال" : "حفظ الإخراج"}
      </button>

      {scannerOpen ? <div className="barcodeScannerOverlay" role="dialog" aria-modal="true" aria-label="ماسح المخزون"><div className="barcodeScannerCard"><div className="barcodeScannerHeader"><div><strong>امسح باركود الصنف</strong><span>قراءة واحدة ثم ترجع مباشرة للشاشة.</span></div><button type="button" className="iconButton" onClick={closeScanner}><X size={20} /></button></div><div className="barcodeVideoFrame"><video ref={videoRef} playsInline muted autoPlay /><div className="barcodeTarget" aria-hidden="true"><span /></div></div><div className="barcodeScannerFooter"><span><ScanLine size={15} /> ثبّت الكاميرا على الباركود.</span><button type="button" className="button secondary" onClick={closeScanner}>إغلاق</button></div></div></div> : null}
    </form>
  );
}
