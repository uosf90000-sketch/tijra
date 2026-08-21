import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, hashPassword } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(180),
  password: z.string().min(8).max(128),
  phone: z.string().trim().max(30).optional(),
  businessName: z.string().trim().min(2).max(140),
  businessType: z.enum(["RETAILER", "SUPPLIER", "BOTH"]),
  businessActivity: z.enum(["GROCERY", "ELECTRONICS", "PHARMACY", "RESTAURANT", "CAFE", "FASHION", "BEAUTY", "HARDWARE", "OFFICE", "OTHER"]),
  city: z.string().trim().max(100).optional(),
  taxNumber: z.string().trim().max(30).optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  const passwordHash = await hashPassword(parsed.data.password);

  try {
    const user = await db.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: parsed.data.businessName,
          commercialName: parsed.data.businessName,
          businessType: parsed.data.businessType,
          businessActivity: parsed.data.businessActivity,
          city: parsed.data.city,
          taxNumber: parsed.data.taxNumber,
        },
      });

      return tx.user.create({
        data: {
          name: parsed.data.name,
          email,
          phone: parsed.data.phone,
          passwordHash,
          memberships: {
            create: { businessId: business.id, role: "OWNER" },
          },
        },
        include: { memberships: { include: { business: true } } },
      });
    });

    await createSession(user.id);
    const membership = user.memberships[0];
    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email },
      role: membership.role,
      business: membership.business,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "EMAIL_ALREADY_EXISTS" }, { status: 409 });
    }
    return NextResponse.json({ error: "REGISTER_FAILED" }, { status: 500 });
  }
}
