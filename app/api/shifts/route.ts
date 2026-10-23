import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { actorFromContext, closeShift, createShift, ensureDefaultLocation, getOpenShift, listShifts, listInventoryLocations } from "@/lib/commerce-ops";
import { db } from "@/lib/db";
import { locationAuthorized, accessibleLocations } from "@/lib/location-access";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("OPEN"),
    locationId: z.string().optional(),
    openingCash: z.coerce.number().nonnegative().max(10000000).default(0),
  }),
  z.object({
    action: z.literal("CLOSE"),
    shiftId: z.string().min(1),
    actualCash: z.coerce.number().nonnegative().max(10000000),
    note: z.string().trim().max(500).optional(),
  }),
]);

export async function GET() {
  const auth = await requireApiPermission("CASHIER");
  if (auth.response) return auth.response;
  await ensureDefaultLocation(auth.context.business.id);
  const allowedLocations = await accessibleLocations(auth.context);
  const selected = allowedLocations.find((location) => location.isDefault) ?? allowedLocations[0];
  if (!selected) return NextResponse.json({ error: "LOCATION_ACCESS_DENIED" }, { status: 403 });
  const locationSet = new Set(allowedLocations.map((item) => item.id));
  const shifts = await listShifts(auth.context.business.id, 30);
  return NextResponse.json({
    openShift: await getOpenShift(auth.context.business.id, selected.id),
    shifts: auth.context.business.locationAccessEnforced
      ? shifts.filter((shift) => Boolean(shift.locationId && locationSet.has(shift.locationId)))
      : shifts,
    defaultLocation: selected,
    locations: allowedLocations,
  });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("CASHIER");
  if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });

  const data = parsed.data;
  const businessId = auth.context.business.id;
  const actor = actorFromContext(auth.context);
  await ensureDefaultLocation(businessId);
  const allLocations = (await listInventoryLocations(businessId)).filter((location) => location.active);
  const allowedLocations = await accessibleLocations(auth.context);
  const defaultLocation = allowedLocations.find((location) => location.isDefault) ?? allowedLocations[0];
  if (!defaultLocation) return NextResponse.json({ error: "LOCATION_ACCESS_DENIED" }, { status: 403 });
  const scopedLocationId = data.action === "OPEN" ? (data.locationId || defaultLocation.id) : null;
  if (scopedLocationId && !(await locationAuthorized(auth.context, scopedLocationId))) return NextResponse.json({ error: "LOCATION_ACCESS_DENIED" }, { status: 403 });

  try {
    if (data.action === "OPEN") {
      const shift = await createShift({
        businessId,
        locationId: data.locationId || defaultLocation.id,
        openingCash: data.openingCash,
        actor,
      });
      return NextResponse.json({ shift }, { status: 201 });
    }

    const shifts = await listShifts(businessId, 100);
    const shift = shifts.find((item) => item.id === data.shiftId);
    if (!shift) return NextResponse.json({ error: "SHIFT_NOT_FOUND" }, { status: 404 });
    if (shift.status === "CLOSED") return NextResponse.json({ error: "SHIFT_ALREADY_CLOSED" }, { status: 409 });
    if (!(await locationAuthorized(auth.context, shift.locationId || defaultLocation.id))) return NextResponse.json({ error: "LOCATION_ACCESS_DENIED" }, { status: 403 });

    const branchId = shift.locationId || defaultLocation.id;
    // Old POS records predate Sale.locationId. Only attribute them automatically
    // when the company has exactly one active location; otherwise fail closed.
    const legacy = await db.sale.count({
      where: { businessId, paymentMethod: "CASH", soldAt: { gte: shift.openedAt }, locationId: null },
    });
    if (legacy > 0 && allLocations.length > 1)
      return NextResponse.json({ error: "UNSCOPED_LEGACY_SALES_REVIEW_REQUIRED", count: legacy }, { status: 409 });
    const cashSales = await db.sale.aggregate({
      where: {
        businessId, paymentMethod: "CASH", soldAt: { gte: shift.openedAt },
        ...(allLocations.length === 1
          ? { OR: [{ locationId: branchId }, { locationId: null }] }
          : { locationId: branchId }),
      },
      _sum: { total: true },
    });
    const expectedCash = shift.openingCash + Number(cashSales._sum.total ?? 0);
    const closed = await closeShift({
      businessId,
      shiftId: shift.id,
      actualCash: data.actualCash,
      expectedCash,
      note: data.note,
      actor,
    });
    return NextResponse.json({
      shift: closed,
      summary: {
        openingCash: shift.openingCash,
        cashSales: Number(cashSales._sum.total ?? 0),
        expectedCash,
        actualCash: data.actualCash,
        difference: data.actualCash - expectedCash,
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "SHIFT_FAILED";
    const status = code.includes("ALREADY") ? 409 : code.includes("NOT_FOUND") ? 404 : 500;
    return NextResponse.json({ error: code }, { status });
  }
}
