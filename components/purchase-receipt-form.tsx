"use client";

import { CheckCircle2, CircleAlert, RefreshCw, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { InvoiceOcrUploader, type InvoiceOcrData } from "@/components/invoice-ocr-uploader";
import { formatSar } from "@/lib/format";
import { matchOcrLines, reviewPurchase } from "@/lib/purchase-guardian";

type OrderItem = {
  productId: string;
  name: string;
  unit: string;
  orderedQty: number;
  receivedQty: number;
  unitCost: number;
  previousUnitCost: number | null;
};
type Order = {
  id: string; orderNumber: string; supplierName: string; items: OrderItem[];
};
type EditableLine = { receivedQty: number; invoicedQty: number; unitCost: number };

function remaining(item: OrderItem) {
  return Math.max(0, item.orderedQty - item.receivedQty);
}

export function PurchaseReceiptForm({ orders }: { orders: Order[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(orders[0]?.id ?? "");
  const [lines, setLines] = useState<Record<string, EditableLine>>({});
  const [ocr, setOcr] = useState<InvoiceOcrData | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [declaredTotal, setDeclaredTotal] = useState("");
  const [declaredVat, setDeclaredVat] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const selected = useMemo(() => orders.find((order) => order.id === selectedId), [orders, selectedId]);

  function getLine(item: OrderItem): EditableLine {
    return lines[item.productId] ?? {
      receivedQty: remaining(item),
      invoicedQty: remaining(item),
      unitCost: item.unitCost,
    };
  }
  function setLine(item: OrderItem, field: keyof EditableLine, value: number) {
    setLines((previous) => ({
      ...previous,
      [item.productId]: { ...getLine(item), [field]: value },
    }));
    setAcknowledged(false);
  }
  const ocrMatches = useMemo(() => matchOcrLines(
    ocr?.candidateItemLines ?? [],
    selected?.items.map((item) => ({
      productId: item.productId, name: item.name, maxQty: remaining(item),
    })) ?? [],
  ), [ocr, selected]);

  const applicableMatches = ocrMatches.filter((item) => item.quantity !== null && item.unitCost !== null);
  const receiptReview = reviewPurchase(
    selected?.items.filter((item) => getLine(item).receivedQty > 0).map((item) => ({
      productId: item.productId,
      productName: item.name,
      orderedUnitCost: item.unitCost,
      previousUnitCost: item.previousUnitCost,
      ...getLine(item),
    })) ?? [],
    declaredTotal.trim() ? Number(declaredTotal) : null,
    declaredVat.trim() ? Number(declaredVat) : null,
  );

  function handleOcr(parsed: InvoiceOcrData) {
    setOcr(parsed);
    if (parsed.invoiceNumber) setInvoiceNumber(parsed.invoiceNumber);
    setDeclaredTotal(parsed.total == null ? "" : String(parsed.total));
    setDeclaredVat(parsed.vat == null ? "" : String(parsed.vat));
    setMessage("تمت قراءة الفاتورة. راجع رقم الفاتورة وإجماليها، ثم طبّق فقط الأصناف المطابقة بثقة.");
    setAcknowledged(false);
  }

  function applyOcr() {
    const changes: Record<string, EditableLine> = { ...lines };
    for (const suggestion of applicableMatches) {
      const item = selected?.items.find((entry) => entry.productId === suggestion.productId);
      if (!item || suggestion.quantity == null || suggestion.unitCost == null) continue;
      changes[item.productId] = {
        ...getLine(item),
        invoicedQty: suggestion.quantity,
        unitCost: suggestion.unitCost,
        // Actual goods received are always entered/confirmed by the merchant.
      };
    }
    setLines(changes);
    setAcknowledged(false);
    setMessage("تم نسخ كمية الفاتورة وسعر الوحدة من الأسطر المطابقة. الكمية المستلمة لم تتغير؛ راجعها بنفسك.");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || loading) return;
    const items = selected.items.map((item) => ({ productId: item.productId, ...getLine(item) }))
      .filter((item) => item.receivedQty > 0);
    if (!items.length) {
      setMessage("أدخل كمية مستلمة لصنف واحد على الأقل.");
      return;
    }
    if (receiptReview.warnings.length && (!acknowledged || reviewNote.trim().length < 8)) {
      setMessage("توجد فروقات: راجع التنبيهات، ثم وافق عليها واكتب سببًا لا يقل عن 8 أحرف.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/purchases/receive", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          purchaseOrderId: selected.id,
          invoiceNumber: invoiceNumber.trim() || undefined,
          issuedAt: issuedAt || undefined,
          declaredTotal: declaredTotal.trim() ? Number(declaredTotal) : undefined,
          declaredVat: declaredVat.trim() ? Number(declaredVat) : undefined,
          acknowledgeVariance: acknowledged,
          reviewNote: reviewNote.trim() || undefined,
          items,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = String(result.error ?? "");
        setMessage(error === "DUPLICATE_SUPPLIER_INVOICE"
          ? "هذه الفاتورة مسجلة من قبل لنفس المورد. لن يُكرّر النظام إدخالها."
          : error.startsWith("PURCHASE_REVIEW_REQUIRED")
            ? "رصد الخادم فروقات تحتاج موافقة وسببًا مكتوبًا قبل اعتمادها. حدّث الصفحة وراجع الأسعار."
            : error.startsWith("RECEIVED_QTY_EXCEEDS_ORDER")
              ? "الكمية المستلمة أكبر من المتبقي في طلب الشراء."
              : "تعذر اعتماد الاستلام. راجع الفاتورة والكميات والأسعار.");
        return;
      }
      setMessage("تم اعتماد الاستلام وتحديث المخزون وتسجيل سعر الشراء في سجل الأسعار.");
      setAcknowledged(false);
      setReviewNote("");
      router.refresh();
    } catch {
      setMessage("فشل الاتصال بالخادم. لم يتم تأكيد اعتماد الفاتورة.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section className="invoiceMatchGrid">
        <InvoiceOcrUploader onParsed={handleOcr} />
        <article className="panel">
          <div className="panelHeader">
            <div><span className="eyebrow">فحص المشتريات</span><h2>مطابقة قبل الاعتماد</h2></div>
          </div>
          <div className="infoNote">يُقارن السعر بطلب الشراء وآخر فاتورة معتمدة من المورد. ويُكشف اختلاف كمية الفاتورة عن المستلم وإجمالي المستند.</div>
          <p className="policyNote">الأرقام المقروءة بالتصوير اقتراح فقط. لا تُحدّث المخزون إلا الكمية التي تعتمد استلامها بنفسك.</p>
          {ocr && (
            <div className="infoNote">
              أصناف تعرّف عليها النظام: {ocrMatches.length} · أصناف بكمية وسعر مقروءين بثقة: {applicableMatches.length}.
              {applicableMatches.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <button type="button" className="button secondary" onClick={applyOcr}><RefreshCw size={16} /> تعبئة أسعار وكميات الفاتورة</button>
                </div>
              )}
              {ocrMatches.length > applicableMatches.length && (
                <p style={{ marginTop: 8 }}>بعض الأسطر غير واضحة؛ أدخل بياناتها يدويًا ولا تفترض صحتها.</p>
              )}
            </div>
          )}
        </article>
      </section>

      {!orders.length ? <article className="panel"><div className="infoNote">لا توجد طلبات شراء مفتوحة للاستلام.</div></article> : (
        <article className="panel">
          <div className="panelHeader">
            <div><span className="eyebrow">اعتماد الاستلام</span><h2>مراقب المشتريات والفواتير</h2></div>
          </div>
          <form onSubmit={submit} style={{ display: "grid", gap: 16, marginTop: 18 }}>
            <label className="field"><span>طلب الشراء</span>
              <select value={selectedId} onChange={(event) => {
                setSelectedId(event.target.value); setLines({}); setAcknowledged(false); setMessage("");
              }}>
                {orders.map((order) => <option value={order.id} key={order.id}>{order.orderNumber} · {order.supplierName}</option>)}
              </select>
            </label>
            <div className="formGrid">
              <label className="field"><span>رقم فاتورة المورد</span><input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} maxLength={100} placeholder="مهم لتجنب التكرار" /></label>
              <label className="field"><span>تاريخ الفاتورة</span><input value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} type="date" dir="ltr" /></label>
              <label className="field"><span>إجمالي الفاتورة (اختياري)</span><input type="number" min="0" step="0.01" value={declaredTotal} onChange={(e) => { setDeclaredTotal(e.target.value); setAcknowledged(false); }} /></label>
              <label className="field"><span>الضريبة المسجلة (اختياري)</span><input type="number" min="0" step="0.01" value={declaredVat} onChange={(e) => { setDeclaredVat(e.target.value); setAcknowledged(false); }} /></label>
            </div>
            <div className="tableScroll">
              <table className="dataTable">
                <thead><tr>
                  <th>الصنف</th><th>المتبقي من الطلب</th><th>كمية الفاتورة</th><th>المستلم فعليًا</th>
                  <th>سعر الطلب</th><th>سعر الفاتورة</th><th>آخر شراء</th>
                </tr></thead>
                <tbody>{selected?.items.map((item) => {
                  const line = getLine(item);
                  return (
                    <tr key={item.productId}>
                      <td><strong>{item.name}</strong><span className="mutedText" style={{ display: "block" }}>{item.unit}</span></td>
                      <td>{remaining(item)}</td>
                      <td><input aria-label={"كمية الفاتورة " + item.name} type="number" min="0" step="0.001" value={line.invoicedQty} onChange={(e) => setLine(item, "invoicedQty", Number(e.target.value))} style={{ width: 100 }} /></td>
                      <td><input aria-label={"الكمية المستلمة " + item.name} type="number" min="0" max={remaining(item)} step="0.001" value={line.receivedQty} onChange={(e) => setLine(item, "receivedQty", Number(e.target.value))} style={{ width: 100 }} /></td>
                      <td>{formatSar(item.unitCost)}</td>
                      <td><input aria-label={"سعر الفاتورة " + item.name} type="number" min="0" step="0.01" value={line.unitCost} onChange={(e) => setLine(item, "unitCost", Number(e.target.value))} style={{ width: 105 }} /></td>
                      <td>{item.previousUnitCost == null ? "—" : formatSar(item.previousUnitCost)}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>

            <section className="infoNote">
              <strong>نتيجة المطابقة:</strong> مجموع أصناف الفاتورة {formatSar(receiptReview.subtotal)}.
              {receiptReview.pricePremium > 0 && (
                <p>زيادة تقديرية على الأسعار المرجعية للأصناف: {formatSar(receiptReview.pricePremium)}. ليست خسارة محاسبية مثبتة.</p>
              )}
            </section>
            {receiptReview.warnings.length > 0 && (
              <section className="panel" style={{ border: "1px solid #e1b26a" }}>
                <div className="panelHeader"><div><span className="eyebrow"><CircleAlert size={16} /> تحتاج مراجعة</span><h2>{receiptReview.warnings.length} تنبيه على الفاتورة</h2></div></div>
                <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                  {receiptReview.warnings.map((warning, index) => <div className="infoNote" key={warning.code + (warning.productId ?? "") + index}>{warning.message}</div>)}
                </div>
                <label className="field" style={{ marginTop: 14 }}>
                  <span>سبب قبول الفروقات (لا يقل عن 8 أحرف)</span>
                  <textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} maxLength={1000} rows={3} placeholder="مثال: تأكيد المورد تغيير السعر ومطابقة الكمية مع الفاتورة" />
                </label>
                <label style={{ display: "flex", gap: 9, alignItems: "center", marginTop: 12 }}>
                  <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
                  <span>راجعت جميع الفروقات وأوافق على الاعتماد بسبب الملاحظة المكتوبة.</span>
                </label>
              </section>
            )}
            {message && <div className="infoNote">{message}</div>}
            <div className="orderSummaryBar">
              <span><ShieldCheck size={17} /> لا يتم الحفظ أو زيادة المخزون قبل الاعتماد.</span>
              <button className="button primary" disabled={loading || !!(receiptReview.warnings.length && (!acknowledged || reviewNote.trim().length < 8))}>
                <CheckCircle2 size={17} /> {loading ? "جاري الاعتماد..." : "اعتماد الاستلام"}
              </button>
            </div>
          </form>
        </article>
      )}
    </>
  );
}
