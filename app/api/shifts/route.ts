import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { actorFromContext, closeShift, createShift, ensureDefaultLocation, getOpenShift, listShifts } from "@/lib/commerce-ops";
import { db } from "@/lib/db";

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
  const defaultLocation = await ensureDefaultLocation(auth.context.business.id);
  return NextResponse.json({
    openShift: await getOpenShift(auth.context.business.id, defaultLocation.id),
    shifts: await listShifts(auth.context.business.id, 30),
    defaultLocation,
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
  const defaultLocation = await ensureDefaultLocation(businessId);

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

    const cashSales = await db.sale.aggregate({
      where: { businessId, paymentMethod: "CASH", soldAt: { gte: shift.openedAt } },
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
