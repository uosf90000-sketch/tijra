import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { db } from "@/lib/db";

const schema = z.object({ sellerBusinessId: z.string().min(1) });

export async function POST(request: Request) {
  const auth = await requireApiPermission("PURCHASES");
  if (auth.response) return auth.response;
  const context = auth.context;
  if (!["RETAILER", "BOTH"].includes(context.business.businessType)) {
    return NextResponse.json({ error: "RETAILER_ACCOUNT_REQUIRED" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success || parsed.data.sellerBusinessId === context.business.id) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const seller = await db.business.findUnique({ where: { id: parsed.data.sellerBusinessId }, select: { id: true, businessType: true } });
  if (!seller || !["SUPPLIER", "BOTH"].includes(seller.businessType)) {
    return NextResponse.json({ error: "SUPPLIER_NOT_FOUND" }, { status: 404 });
  }

  const favorite = await db.favoriteSupplier.upsert({
    where: { buyerBusinessId_sellerBusinessId: { buyerBusinessId: context.business.id, sellerBusinessId: seller.id } },
    update: {},
    create: { buyerBusinessId: context.business.id, sellerBusinessId: seller.id },
  });
  return NextResponse.json({ favorite }, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await requireApiPermission("PURCHASES");
  if (auth.response) return auth.response;
  const context = auth.context;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

  await db.favoriteSupplier.deleteMany({
    where: { buyerBusinessId: context.business.id, sellerBusinessId: parsed.data.sellerBusinessId },
  });
  return NextResponse.json({ ok: true });
}
