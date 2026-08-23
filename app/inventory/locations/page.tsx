import { redirect } from "next/navigation";
import { Boxes, Building2, Warehouse } from "lucide-react";
import { LocationCreateForm, StockTransferForm } from "@/components/commerce-forms";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { ensureDefaultLocation, listInventoryLocations, listLocationStocks } from "@/lib/commerce-ops";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "الفروع والمستودعات" };
export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const context = await getSessionContext(); if (!context) redirect("/login");
  await ensureDefaultLocation(context.business.id);
  const [locations, products] = await Promise.all([
    listInventoryLocations(context.business.id),
    db.product.findMany({ where: { businessId: context.business.id, active: true }, select: { id: true, name: true, barcode: true, unit: true, quantity: true }, orderBy: { name: "asc" }, take: 1000 }),
  ]);
  const stockByLocation = await Promise.all(locations.map(async (location) => ({ location, stocks: await listLocationStocks(context.business.id, location.id) })));
  const warehouseCount = locations.filter((x) => x.type === "WAREHOUSE").length;
  const storeCount = locations.filter((x) => x.type === "STORE").length;
  return <>
    <PageHeader eyebrow="المخزون" title="الفروع والمستودعات" description="وزّع المخزون على مواقعك، وانقل البضاعة بينها بدون تغيير إجمالي مخزون المنشأة." />
    <section className="metricsGrid three"><MetricCard label="الفروع" value={`${storeCount}`} note="مواقع بيع" icon={Building2} /><MetricCard label="المستودعات" value={`${warehouseCount}`} note="مواقع تخزين" icon={Warehouse} tone="blue" /><MetricCard label="إجمالي المواقع" value={`${locations.length}`} note="مرتبطة بالمخزون" icon={Boxes} tone="violet" /></section>
    <section className="workflowGrid two"><LocationCreateForm /><StockTransferForm locations={locations} products={products.map((x) => ({ id: x.id, name: x.name, barcode: x.barcode, unit: x.unit, quantity: Number(x.quantity) }))} /></section>
    <section className="workflowGrid two">{stockByLocation.map(({ location, stocks }) => <article className="panel workflowPanel" key={location.id}><div className="panelHeader"><div><span className="eyebrow">{location.type === "WAREHOUSE" ? "مستودع" : "فرع"}{location.isDefault ? " · افتراضي" : ""}</span><h2>{location.name}</h2></div>{location.type === "WAREHOUSE" ? <Warehouse size={20} /> : <Building2 size={20} />}</div><div className="insightList"><div><strong>{stocks.filter((x) => x.quantity > 0).length}</strong><span>صنف برصيد</span></div><div><strong>{stocks.reduce((s, x) => s + x.quantity, 0).toLocaleString("ar-SA")}</strong><span>إجمالي وحدات أساسية</span></div></div><div className="compactList">{stocks.filter((x) => x.quantity > 0).slice(0, 8).map((x) => <div key={x.id}><span>{x.productName}</span><strong>{x.quantity.toLocaleString("ar-SA")}</strong></div>)}</div></article>)}</section>
  </>;
}
