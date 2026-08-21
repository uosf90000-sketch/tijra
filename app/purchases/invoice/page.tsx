import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { InvoiceOcrUploader } from "@/components/invoice-ocr-uploader";
import { PageHeader } from "@/components/page-header";
import { PurchaseReceiptForm } from "@/components/purchase-receipt-form";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "مطابقة واستلام فاتورة المورد" };
export const dynamic = "force-dynamic";

export default async function PurchaseInvoicePage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");

  const orders = await db.purchaseOrder.findMany({
    where: {
      businessId: context.business.id,
      status: { in: ["SENT", "CONFIRMED", "PARTIALLY_RECEIVED"] },
    },
    include: { supplier: true, items: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
  });

  const receiptOrders = orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber || order.id.slice(-8).toUpperCase(),
    supplierName: order.supplier.name,
    items: order.items.map((item) => ({
      productId: item.productId,
      name: item.product.name,
      unit: item.product.unit,
      orderedQty: Number(item.orderedQty),
      receivedQty: Number(item.receivedQty),
      unitCost: Number(item.unitCost),
    })),
  }));

  return (
    <>
      <PageHeader
        eyebrow="الاستلام"
        title="فاتورة المورد والاستلام"
        description="اقرأ الفاتورة بالصورة للمساعدة، ثم اعتمد ما استلمته فعلًا ليُحدّث المخزون ومتوسط التكلفة."
        actions={<Link className="button secondary" href="/purchases"><ArrowRight size={17} /> رجوع للمشتريات</Link>}
      />

      <section className="invoiceMatchGrid">
        <InvoiceOcrUploader />
        <article className="panel">
          <div className="panelHeader"><div><span className="eyebrow">قاعدة الاستلام</span><h2>OCR يساعدك، ولا يعتمد بدلًا عنك</h2></div></div>
          <div className="infoNote">قارن الصورة بطلب الشراء. عدّل الكميات والتكلفة في نموذج الاستلام أدناه، ثم اضغط «اعتماد الاستلام». لن يدخل المخزون إلا ما اعتمدته فعلًا.</div>
          <p className="policyNote">هذا يمنع إضافة كميات مفوترة لم تصل، ويكشف فرق السعر قبل تثبيت متوسط التكلفة.</p>
        </article>
      </section>

      <PurchaseReceiptForm orders={receiptOrders} />
    </>
  );
}
