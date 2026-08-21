"use client";

import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { formatSar } from "@/lib/format";

type Order = {
  id: string;
  orderNumber: string;
  supplierName: string;
  items: Array<{ productId: string; name: string; unit: string; orderedQty: number; receivedQty: number; unitCost: number }>;
};

export function PurchaseReceiptForm({ orders }: { orders: Order[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(orders[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const selected = useMemo(() => orders.find((order) => order.id === selectedId), [orders, selectedId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const items = selected.items
      .map((item) => ({
        productId: item.productId,
        receivedQty: Number(form.get(`qty-${item.productId}`) || 0),
        unitCost: Number(form.get(`cost-${item.productId}`) || item.unitCost),
      }))
      .filter((item) => item.receivedQty > 0);

    if (!items.length) {
      setLoading(false);
      setMessage("أدخل كمية مستلمة لصنف واحد على الأقل.");
      return;
    }

    const response = await fetch("/api/purchases/receive", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        purchaseOrderId: selected.id,
        invoiceNumber: form.get("invoiceNumber") || undefined,
        issuedAt: form.get("issuedAt") || undefined,
        items,
      }),
    });
    const result = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setMessage(result.error?.startsWith?.("RECEIVED_QTY_EXCEEDS_ORDER") ? "الكمية المستلمة أكبر من المتبقي في الطلب." : "تعذر اعتماد الاستلام. راجع الكميات والأسعار.");
      return;
    }
    setMessage("تم اعتماد الاستلام وتحديث المخزون ومتوسط التكلفة.");
    router.refresh();
  }

  if (!orders.length) {
    return <article className="panel"><div className="infoNote">لا توجد طلبات شراء مفتوحة للاستلام.</div></article>;
  }

  return (
    <article className="panel">
      <div className="panelHeader"><div><span className="eyebrow">الاعتماد الفعلي</span><h2>ما الذي وصل فعلًا؟</h2></div></div>
      <form onSubmit={submit} style={{ display: "grid", gap: 16, marginTop: 18 }}>
        <label className="field"><span>طلب الشراء</span><select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{orders.map((order) => <option value={order.id} key={order.id}>{order.orderNumber} · {order.supplierName}</option>)}</select></label>
        <div className="formGrid">
          <label className="field"><span>رقم فاتورة المورد</span><input name="invoiceNumber" placeholder="اختياري" /></label>
          <label className="field"><span>تاريخ الفاتورة</span><input name="issuedAt" type="date" dir="ltr" /></label>
        </div>

        <div className="tableScroll">
          <table className="dataTable">
            <thead><tr><th>الصنف</th><th>المطلوب</th><th>تم استلامه سابقًا</th><th>استلام الآن</th><th>تكلفة الوحدة</th></tr></thead>
            <tbody>
              {selected?.items.map((item) => {
                const remaining = Math.max(0, item.orderedQty - item.receivedQty);
                return (
                  <tr key={item.productId}>
                    <td><strong>{item.name}</strong></td>
                    <td>{item.orderedQty} {item.unit}</td>
                    <td>{item.receivedQty} {item.unit}</td>
                    <td><input name={`qty-${item.productId}`} type="number" min="0" max={remaining} step="0.001" defaultValue={remaining} style={{ width: 110 }} /></td>
                    <td><input name={`cost-${item.productId}`} type="number" min="0" step="0.01" defaultValue={item.unitCost} style={{ width: 110 }} /> <span className="mutedText">{formatSar(item.unitCost)}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {message && <div className="infoNote">{message}</div>}
        <div className="orderSummaryBar"><span>سيتم تحديث المخزون بالكميات المستلمة فقط.</span><button className="button primary" disabled={loading}><CheckCircle2 size={17} /> {loading ? "جاري الاعتماد..." : "اعتماد الاستلام"}</button></div>
      </form>
    </article>
  );
}
