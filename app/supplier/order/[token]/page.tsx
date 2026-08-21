import { notFound } from "next/navigation";
import { SupplierOrderResponse } from "@/components/supplier-order-response";
import { db } from "@/lib/db";
import { formatSar } from "@/lib/format";
import { verifySupplierOrderToken } from "@/lib/supplier-link";
import styles from "./page.module.css";

export const metadata = { title: "طلب توريد | تِجرا" };
export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = {
  DRAFT: "مسودة",
  SENT: "بانتظار تأكيد المورد",
  CONFIRMED: "مؤكد",
  PARTIALLY_RECEIVED: "استلام جزئي",
  RECEIVED: "مستلم",
  CANCELLED: "ملغي",
};

export default async function SupplierOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = verifySupplierOrderToken(token);
  if (!payload) {
    return (
      <main className={styles.page}><div className={styles.wrap}><div className={styles.brand}><span className={styles.mark}>ت</span> تِجرا</div><section className={`${styles.card} ${styles.invalid}`}><h1>الرابط غير صالح أو انتهت صلاحيته</h1><p>اطلب من التاجر إنشاء رابط توريد جديد. لا تحتاج إلى إنشاء حساب في تِجرا لتأكيد الطلب.</p></section></div></main>
    );
  }

  const order = await db.purchaseOrder.findUnique({
    where: { id: payload.orderId },
    include: { business: true, supplier: true, items: { include: { product: true } } },
  });
  if (!order) notFound();

  const closed = ["RECEIVED", "CANCELLED"].includes(order.status);

  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.brand}><span className={styles.mark}>ت</span> تِجرا</div>
        <section className={styles.card}>
          <span className={styles.eyebrow}>طلب توريد من {order.business.name}</span>
          <h1>{order.orderNumber || `طلب ${order.id.slice(-8).toUpperCase()}`}</h1>
          <p className={styles.sub}>راجع الأصناف والكميات ثم أكد إمكانية التوريد. ترتيبات التوصيل والموعد تبقى مباشرة بينك وبين التاجر.</p>

          <div className={styles.meta}>
            <div><span>المورد</span><strong>{order.supplier.name}</strong></div>
            <div><span>القيمة المتوقعة</span><strong>{formatSar(Number(order.expectedTotal))}</strong></div>
            <div><span>الحالة</span><strong>{statusLabels[order.status] ?? order.status}</strong></div>
          </div>

          <div className={styles.items}>
            {order.items.map((item) => (
              <div className={styles.item} key={item.id}>
                <div><strong>{item.product.name}</strong><span>{item.product.sku || item.product.barcode || item.product.unit}</span></div>
                <div className={styles.qty}>{Number(item.orderedQty).toLocaleString("ar-SA")} {item.product.unit}</div>
                <div className={styles.price}>{formatSar(Number(item.orderedQty) * Number(item.unitCost))}</div>
              </div>
            ))}
          </div>

          {order.notes && <div className={styles.note}>{order.notes}</div>}
          <SupplierOrderResponse token={token} closed={closed} />
        </section>
      </div>
    </main>
  );
}
