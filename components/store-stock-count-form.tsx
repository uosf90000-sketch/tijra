"use client";

import { ClipboardCheck, CloudOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { BarcodeInput } from "@/components/barcode-input";
import { useOfflineStatus } from "@/hooks/use-offline-status";
import { makeOfflineOperationId, queueOfflineOperation } from "@/lib/offline-queue";

type Product = { id: string; name: string; barcode: string | null; quantity: number; unit: string };
type Location = { id: string; name: string; isDefault: boolean };

type CountPayload = {
  productId: string;
  countedQuantity: number;
  locationId: string;
  clientOperationId: string;
  recordedAt: string;
  expectedPreviousQuantity?: number;
};

export function StoreStockCountForm({
  products,
  locations,
  locationQuantities,
}: {
  products: Product[];
  locations: Location[];
  locationQuantities: Record<string, Record<string, number>>;
}) {
  const router = useRouter();
  const { online, pending } = useOfflineStatus("COUNT");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  function resolveProduct(form: FormData) {
    const productId = String(form.get("productId") || "");
    const barcode = String(form.get("countBarcode") || "").trim();
    return products.find((item) => item.id === productId) || products.find((item) => item.barcode === barcode) || null;
  }

  function baselineFor(product: Product, locationId: string) {
    const exact = locationQuantities[locationId]?.[product.id];
    if (exact != null) return exact;
    const location = locations.find((item) => item.id === locationId);
    return location?.isDefault ? product.quantity : 0;
  }

  async function saveOffline(payload: CountPayload, product: Product) {
    const expectedPreviousQuantity = baselineFor(product, payload.locationId);
    await queueOfflineOperation({
      id: payload.clientOperationId,
      type: "COUNT",
      url: "/api/inventory/count",
      body: { ...payload, expectedPreviousQuantity },
      createdAt: payload.recordedAt,
      dedupeKey: `COUNT:${payload.locationId}:${product.id}`,
    });
    setMessage(`تم حفظ جرد ${product.name} على الجهاز ✅ وسيُرفع تلقائيًا عند عودة النت.`);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const product = resolveProduct(form);
    const locationId = String(form.get("locationId") || locations.find((item) => item.isDefault)?.id || locations[0]?.id || "");

    if (!product) {
      setMessage(online ? "ما لقينا الصنف." : "هذا الصنف غير محفوظ على الجهاز. افتح الجرد مرة أثناء الاتصال لتحديث قائمة الأصناف.");
      setLoading(false);
      return;
    }

    const operationId = makeOfflineOperationId("count");
    const payload: CountPayload = {
      productId: product.id,
      countedQuantity: Number(form.get("countedQuantity") || 0),
      locationId,
      clientOperationId: operationId,
      recordedAt: new Date().toISOString(),
    };

    if (!navigator.onLine) {
      try {
        await saveOffline(payload, product);
      } catch {
        setMessage("تعذر حفظ الجرد على الجهاز. لا تغلق الصفحة وحاول مرة أخرى.");
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const response = await fetch("/api/inventory/count", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status >= 500) {
          await saveOffline(payload, product);
          return;
        }
        setMessage(result.error === "PRODUCT_NOT_FOUND" ? "ما لقينا الصنف." : result.error === "LOCATION_NOT_FOUND" ? "موقع المخزون غير موجود." : "تعذر حفظ الجرد.");
        return;
      }

      const delta = Number(result.delta || 0);
      setMessage(delta === 0 ? `جرد ${result.location?.name || "الموقع"} مطابق للمخزون ✅` : `تم حفظ جرد ${result.location?.name || "الموقع"} · الفرق ${delta > 0 ? "+" : ""}${delta.toLocaleString("ar-SA")} ✅`);
      router.refresh();
    } catch {
      try {
        await saveOffline(payload, product);
      } catch {
        setMessage("انقطع الاتصال وتعذر حفظ العملية على الجهاز.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="panel workflowPanel" onSubmit={submit}>
      <div className="panelHeader"><div><span className="eyebrow"><ClipboardCheck size={14} /> جرد المتجر</span><h2>مسح وعدّ سريع حسب الموقع</h2></div></div>
      <div className={`offlineState ${online ? "online" : "offline"}`}>
        {!online ? <CloudOff size={16} /> : null}
        <span>{!online ? "بدون نت · الجرد محفوظ على هذا الجهاز" : pending ? `${pending} عملية جرد بانتظار المزامنة` : "متصل · المزامنة تلقائية"}</span>
      </div>
      <div className="workflowFormGrid">
        <label>الموقع<select name="locationId" defaultValue={locations.find((item) => item.isDefault)?.id || locations[0]?.id}>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isDefault ? " · افتراضي" : ""}</option>)}</select></label>
        <BarcodeInput name="countBarcode" />
        <label>أو اختر الصنف<select name="productId" defaultValue=""><option value="">اختيار بالباركود</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name} — إجمالي المنشأة {item.quantity.toLocaleString("ar-SA")} {item.unit}</option>)}</select></label>
        <label>الكمية الفعلية في هذا الموقع<input name="countedQuantity" type="number" min="0" step="0.001" required inputMode="decimal" /></label>
      </div>
      <button className="button primary" disabled={loading || !products.length || !locations.length}>{loading ? "جاري الحفظ..." : "تسجيل نتيجة الجرد"}</button>
      {message ? <div className="infoNote">{message}</div> : null}
    </form>
  );
}
