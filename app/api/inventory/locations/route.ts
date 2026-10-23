import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiPermission } from "@/lib/api-auth";
import { actorFromContext, createInventoryLocation, ensureDefaultLocation, listInventoryLocations } from "@/lib/commerce-ops";
import { accessibleLocations } from "@/lib/location-access";

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  type: z.enum(["STORE", "WAREHOUSE"]).default("STORE"),
  isDefault: z.boolean().optional(),
});

export async function GET() {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;
  await ensureDefaultLocation(auth.context.business.id);
  return NextResponse.json({ locations: await accessibleLocations(auth.context) });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("INVENTORY");
  if (auth.response) return auth.response;
  if (auth.context.business.locationAccessEnforced && auth.context.membership.role !== "OWNER") return NextResponse.json({ error: "OWNER_REQUIRED_FOR_LOCATION_SETUP" }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "INVALID_INPUT", details: parsed.error.flatten() }, { status: 400 });

  const location = await createInventoryLocation({
    businessId: auth.context.business.id,
    name: parsed.data.name,
    type: parsed.data.type,
    isDefault: parsed.data.isDefault,
    actor: actorFromContext(auth.context),
  });
  return NextResponse.json({ location }, { status: 201 });
}
