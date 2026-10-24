"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Product = { id: string; name: string; unit: string };
type Supplier = { id: string; name: string };
type Bid = {
  id: string; supplierId: string; unitPrice: string; deliveryDays: number | null;
  status: string; supplier: { name: string };
};
type RequestRow = {
  id: string; status: string; quantity: string; quoteDeadline: string | null;
  product: { name: string; unit: string }; bids: Bid[];
};
export function SourcingWorkspace({
  products, suppliers, requests, reviewer,
}: { products: Product[]; suppliers: Supplier[]; requests: RequestRow[]; reviewer: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function act(url: string, payload: object = {}) {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(url, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage("لم تُحفظ العملية: " + (data.error || "تعذر تنفيذها"));
        return;
      }
      setMessage(data.purchaseOrderId
        ? "تم إنشاء طلب شراء " + data.purchaseStatus + " من العرض الفائز. لم يُرسل إلى المورد آليًا."
        : "تم الحفظ. الموردون لا يُبلَّغون تلقائيًا في هذه النسخة.");
      router.refresh();
    } catch {
      setMessage("فشل الاتصال، تحقق من حالة الطلب قبل الإعادة.");
    } finally { setBusy(false); }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await act("/api/sourcing", {
      productId: form.get("productId"), quantity: String(form.get("quantity")),
      quoteDeadline: form.get("quoteDeadline")
        ? String(form.get("quoteDeadline")) + "T23:59:59.000Z" : undefined,
      note: form.get("note") || undefined,
    });
  }
  async function addBid(requestId: string) {
    if (!suppliers.length) return setMessage("أضف الموردين في قسم الموردين أولًا.");
    const supplierId = window.prompt("انسخ رقم المورد من القائمة أدناه ثم أدخله:");
    if (!supplierId) return;
    const price = window.prompt("سعر الوحدة بالريال من عرض المورد:");
    if (!price || !/^\d+(?:\.\d{1,2})?$/.test(price)) return;
    const days = window.prompt("أيام التوريد المتوقعة من المورد (اختياري):", "");
    const deliveryDays = days?.trim() ? Number(days) : undefined;
    if (deliveryDays !== undefined && (!Number.isInteger(deliveryDays) || deliveryDays < 0 || deliveryDays > 365))
      return setMessage("أيام التوريد يجب أن تكون عددًا صحيحًا من 0 إلى 365.");
    await act("/api/sourcing/" + requestId + "/bids", {
      supplierId: supplierId.trim(), unitPrice: price, deliveryDays,
      note: "مدخل يدويًا بحسب عرض المورد؛ لم يتم التحقق من السعر أو المدة خارجيًا",
    });
  }
  async function award(requestId: string, bidId: string) {
    const reason = window.prompt("لماذا اخترت هذا المورد؟ (8 أحرف على الأقل)");
    if (!reason || reason.trim().length < 8) return;
    if (!window.confirm("سيُنشأ طلب شراء مسودة أو بانتظار موافقة حسب السياسة، ولن يُرسل للمورد. هل توافق؟")) return;
    await act("/api/sourcing/" + requestId + "/award", { bidId, reason: reason.trim() });
  }
  return <div style={{ display: "grid", gap: 18 }}>
    {message && <div className="infoNote">{message}</div>}
    <section className="panel">
      <div className="panelHeader"><div><span className="eyebrow">المشتريات التنافسية</span><h2>طلب عروض أسعار (RFQ)</h2></div></div>
      <div className="infoNote">سجّل احتياجًا، اجمع عروض الموردين، قارن الأسعار ومدة التوريد، ثم اختر الفائز. الأرقام والمهل التي تدخلها غير محققة تلقائيًا؛ بيانات الموردين لا تظهر للمنافسين.</div>
      <form className="formGrid" onSubmit={create}>
        <label className="field"><span>الصنف</span><select required name="productId">
          {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
        </select></label>
        <label className="field"><span>الكمية المطلوبة</span><input name="quantity" required defaultValue="1" pattern="[0-9]+([.][0-9]{1,3})?"/></label>
        <label className="field"><span>موعد إغلاق العروض</span><input name="quoteDeadline" type="date"/></label>
        <label className="field"><span>المواصفات والتفاصيل</span><input name="note" maxLength={1000}/></label>
        <div className="formActions"><button className="button primary" disabled={busy || !products.length}>إنشاء RFQ مسودة</button></div>
      </form>
    </section>
    <section className="panel" style={{ display: "grid", gap: 12 }}>
      <div className="panelHeader"><div><span className="eyebrow">دليل الموردين</span><h2>أرقام الموردين المتاحين داخل منشأتك</h2></div></div>
      <div className="infoNote">تُستخدم أرقام الموردين عند تسجيل عروضهم يدويًا. لم تُفعل دعوات البريد أو بوابة عروض الموردين العامة بعد.</div>
      {suppliers.map((s) => <div className="alertRow" key={s.id}>
        <strong>{s.name}</strong><code dir="ltr">{s.id}</code>
      </div>)}
      {!suppliers.length && <p className="policyNote">أضف مورديك الحاليين أولًا.</p>}
    </section>
    <section className="panel">
      <div className="panelHeader"><div><span className="eyebrow">المفاضلة والقرار</span><h2>طلبات العروض</h2></div></div>
      {requests.map((row) => {
        const sorted = [...row.bids].sort((a, b) => Number(a.unitPrice) - Number(b.unitPrice));
        return <article className="panel" key={row.id} style={{ display: "grid", gap: 12, marginBlock: 12 }}>
          <div className="panelHeader"><div><strong>{row.product.name} · {row.quantity} {row.product.unit}</strong>
            <p className="policyNote">{row.status} · {row.quoteDeadline ? "الموعد " + row.quoteDeadline.slice(0,10) : "لا موعد محدد"}</p>
          </div></div>
          <div className="formActions">
            {row.status === "DRAFT" && <button type="button" className="button secondary" disabled={busy}
              onClick={() => act("/api/sourcing/" + row.id + "/open")}>فتح طلب العروض</button>}
            {row.status === "OPEN" && <button type="button" className="button secondary" disabled={busy}
              onClick={() => addBid(row.id)}>تسجيل عرض مورد</button>}
          </div>
          <div className="tableScroll"><table className="dataTable">
            <thead><tr><th>المورد</th><th>سعر الوحدة</th><th>مدة التوريد المعلنة</th><th>الحالة</th><th>المفاضلة</th></tr></thead>
            <tbody>{sorted.map((bid, i) => <tr key={bid.id}>
              <td>{bid.supplier.name}</td><td>{bid.unitPrice} ر.س</td>
              <td>{bid.deliveryDays === null ? "غير محددة" : bid.deliveryDays + " يوم"}</td>
              <td>{bid.status}</td>
              <td>{i === 0 && row.status === "OPEN" ? "أقل سعر مُدخل" : ""}
                {reviewer && row.status === "OPEN" && bid.status === "SUBMITTED" &&
                  <button className="button secondary" type="button" disabled={busy}
                    onClick={() => award(row.id, bid.id)}>اختيار المورد</button>}
              </td>
            </tr>)}
            {!sorted.length && <tr><td colSpan={5}>بانتظار تسجيل عروض الموردين.</td></tr>}
            </tbody></table></div>
        </article>;
      })}
      {!requests.length && <p className="policyNote">لا توجد طلبات عروض أسعار بعد.</p>}
    </section>
  </div>;
}
