import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { signedAuditExport, type SignedAuditPayload } from "@/lib/governance-audit-export";

export async function GET(request: Request) {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (context.membership.role !== "OWNER") return NextResponse.json({ error: "OWNER_REQUIRED" }, { status: 403 });
  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days") || "30");
  if (!Number.isSafeInteger(days) || days < 1 || days > 365)
    return NextResponse.json({ error: "DAYS_MUST_BE_1_TO_365" }, { status: 400 });

  const now = new Date();
  const since = new Date(now.getTime() - days * 86400_000);
  try {
    // Explicitly bounded export. Truncated exports identify this in the signed
    // manifest; larger periods must be exported as successive dated windows.
    const records = await db.inventoryAuditEvent.findMany({
      where: { businessId: context.business.id, occurredAt: { gte: since, lte: now } },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      take: 2501,
    });
    const truncated = records.length > 2500;
    const payload: SignedAuditPayload = {
      schema: "tijra-governance-audit-v1",
      businessId: context.business.id,
      exportedAt: now.toISOString(),
      from: since.toISOString(),
      to: now.toISOString(),
      truncated,
      events: records.slice(0, 2500).map((event) => ({
        id: event.id,
        action: event.action,
        actorUserId: event.actorUserId,
        actorName: event.actorName,
        actorRole: event.actorRole,
        itemName: event.itemName,
        orderId: event.orderId,
        listingId: event.listingId,
        note: event.note,
        quantity: event.quantity === null ? null : String(event.quantity),
        previousQuantity: event.previousQuantity === null ? null : String(event.previousQuantity),
        newQuantity: event.newQuantity === null ? null : String(event.newQuantity),
        occurredAt: event.occurredAt.toISOString(),
      })),
    };
    const envelope = signedAuditExport(payload);
    return new Response(JSON.stringify(envelope, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": 'attachment; filename="tijra-governance-audit.json"',
        "cache-control": "no-store, private",
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code.startsWith("AUDIT_SIGNING_KEY"))
      return NextResponse.json({ error: "AUDIT_EXPORT_NOT_CONFIGURED" }, { status: 503 });
    console.error("Governance audit export failed", error);
    return NextResponse.json({ error: "AUDIT_EXPORT_FAILED" }, { status: 500 });
  }
}
