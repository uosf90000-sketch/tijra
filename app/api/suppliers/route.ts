import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { db } from "@/lib/db";

const supplierSchema = z.object({
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(180).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional(),
});

export async function GET() {
  const auth = await requireApiPermission("PURCHASES");
  if (auth.response) return auth.response;
  const suppliers = await db.supplier.findMany({
    where: { businessId: auth.context.business.id },
    include: { _count: { select: { products: true, purchaseOrders: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ suppliers });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("PURCHASES");
  if (auth.response) return auth.response;
  const parsed = supplierSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });

  const supplier = await db.supplier.create({
    data: {
      businessId: auth.context.business.id,
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      notes: parsed.data.notes || null,
    },
  });
  return NextResponse.json({ supplier }, { status: 201 });
}
