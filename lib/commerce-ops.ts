import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

type Tx = Prisma.TransactionClient;

type Actor = {
  userId?: string;
  name: string;
  role?: string;
};

export type InventoryLocation = {
  id: string;
  name: string;
  type: "STORE" | "WAREHOUSE";
  isDefault: boolean;
  active: boolean;
};

export type UnitConversion = {
  id: string;
  productId: string;
  name: string;
  factor: number;
  barcode: string | null;
  salePrice: number | null;
};

export type InventoryLot = {
  id: string;
  productId: string;
  lotNumber: string;
  quantity: number;
  unitCost: number | null;
  expiresAt: Date | null;
  locationId: string | null;
  receivedAt: Date;
};

export type ShiftState = {
  id: string;
  locationId: string | null;
  status: "OPEN" | "CLOSED";
  openedAt: Date;
  closedAt: Date | null;
  openingCash: number;
  expectedCash: number | null;
  actualCash: number | null;
  actorName: string;
  note: string | null;
};

function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function systemActor(): Actor {
  return { name: "النظام", role: "SYSTEM" };
}

export function decodeLocation(row: { listingId: string | null; itemName: string | null; note: string | null }): InventoryLocation | null {
  if (!row.listingId) return null;
  const note = safeJson<{ type?: "STORE" | "WAREHOUSE"; isDefault?: boolean; active?: boolean }>(row.note, {});
  return {
    id: row.listingId,
    name: row.itemName || "موقع مخزون",
    type: note.type === "WAREHOUSE" ? "WAREHOUSE" : "STORE",
    isDefault: Boolean(note.isDefault),
    active: note.active !== false,
  };
}

export async function listInventoryLocations(businessId: string) {
  const rows = await db.inventoryAuditEvent.findMany({
    where: { businessId, action: "LOCATION_CONFIG" },
    orderBy: { occurredAt: "asc" },
  });
  return rows.map(decodeLocation).filter((item): item is InventoryLocation => Boolean(item));
}

export async function ensureDefaultLocation(businessId: string) {
  let locations = await listInventoryLocations(businessId);
  let location = locations.find((item) => item.isDefault && item.active) ?? locations.find((item) => item.active);

  if (!location) {
    const id = randomUUID();
    await db.inventoryAuditEvent.create({
      data: {
        businessId,
        action: "LOCATION_CONFIG",
        listingId: id,
        itemName: "الموقع الرئيسي",
        actorName: "النظام",
        actorRole: "SYSTEM",
        note: JSON.stringify({ type: "STORE", isDefault: true, active: true }),
      },
    });
    location = { id, name: "الموقع الرئيسي", type: "STORE", isDefault: true, active: true };
    locations = [location];
  }

  const products = await db.product.findMany({
    where: { businessId, active: true },
    select: { id: true, name: true, quantity: true },
  });
  const existing = await db.inventoryAuditEvent.findMany({
    where: { businessId, action: "LOCATION_STOCK", listingId: location.id },
    select: { orderId: true },
  });
  const existingIds = new Set(existing.map((item) => item.orderId).filter(Boolean));
  const missing = products.filter((product) => !existingIds.has(product.id));
  if (missing.length) {
    await db.inventoryAuditEvent.createMany({
      data: missing.map((product) => ({
        businessId,
        action: "LOCATION_STOCK",
        listingId: location!.id,
        orderId: product.id,
        itemName: product.name,
        quantity: Number(product.quantity),
        actorName: "النظام",
        actorRole: "SYSTEM",
        note: "رصيد الموقع",
      })),
    });
  }

  return location;
}

export async function createInventoryLocation(input: {
  businessId: string;
  name: string;
  type: "STORE" | "WAREHOUSE";
  isDefault?: boolean;
  actor: Actor;
}) {
  const existing = await listInventoryLocations(input.businessId);
  const id = randomUUID();
  const makeDefault = input.isDefault || !existing.length;

  if (makeDefault) {
    for (const location of existing.filter((item) => item.isDefault)) {
      const row = await db.inventoryAuditEvent.findFirst({
        where: { businessId: input.businessId, action: "LOCATION_CONFIG", listingId: location.id },
      });
      if (row) {
        const cfg = decodeLocation(row);
        await db.inventoryAuditEvent.update({
          where: { id: row.id },
          data: { note: JSON.stringify({ type: cfg?.type || "STORE", isDefault: false, active: cfg?.active !== false }) },
        });
      }
    }
  }

  await db.inventoryAuditEvent.create({
    data: {
      businessId: input.businessId,
      action: "LOCATION_CONFIG",
      listingId: id,
      itemName: input.name,
      actorUserId: input.actor.userId,
      actorName: input.actor.name,
      actorRole: input.actor.role,
      note: JSON.stringify({ type: input.type, isDefault: makeDefault, active: true }),
    },
  });

  const products = await db.product.findMany({
    where: { businessId: input.businessId, active: true },
    select: { id: true, name: true },
  });
  if (products.length) {
    await db.inventoryAuditEvent.createMany({
      data: products.map((product) => ({
        businessId: input.businessId,
        action: "LOCATION_STOCK",
        listingId: id,
        orderId: product.id,
        itemName: product.name,
        quantity: 0,
        actorUserId: input.actor.userId,
        actorName: input.actor.name,
        actorRole: input.actor.role,
        note: "رصيد الموقع",
      })),
    });
  }

  return { id, name: input.name, type: input.type, isDefault: makeDefault, active: true } satisfies InventoryLocation;
}

export async function listLocationStocks(businessId: string, locationId: string) {
  const rows = await db.inventoryAuditEvent.findMany({
    where: { businessId, action: "LOCATION_STOCK", listingId: locationId },
    orderBy: { itemName: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    productId: row.orderId || "",
    productName: row.itemName || "صنف",
    quantity: Number(row.quantity ?? 0),
  })).filter((row) => row.productId);
}

export async function adjustLocationStock(tx: Tx, input: {
  businessId: string;
  locationId: string;
  productId: string;
  delta: number;
  productName?: string;
}) {
  let row = await tx.inventoryAuditEvent.findFirst({
    where: {
      businessId: input.businessId,
      action: "LOCATION_STOCK",
      listingId: input.locationId,
      orderId: input.productId,
    },
  });
  if (!row) {
    row = await tx.inventoryAuditEvent.create({
      data: {
        businessId: input.businessId,
        action: "LOCATION_STOCK",
        listingId: input.locationId,
        orderId: input.productId,
        itemName: input.productName || "صنف",
        quantity: 0,
        actorName: "النظام",
        actorRole: "SYSTEM",
        note: "رصيد الموقع",
      },
    });
  }

  const previous = Number(row.quantity ?? 0);
  const next = previous + input.delta;
  if (next < -0.000001) throw new Error(`INSUFFICIENT_LOCATION_STOCK:${previous}`);
  await tx.inventoryAuditEvent.update({
    where: { id: row.id },
    data: { quantity: Math.max(0, next), occurredAt: new Date() },
  });
  return { previous, next: Math.max(0, next) };
}

export function decodeUnitConversion(row: {
  id: string;
  listingId: string | null;
  itemName: string | null;
  quantity: unknown;
  previousQuantity: unknown;
  note: string | null;
}): UnitConversion | null {
  if (!row.listingId) return null;
  const config = safeJson<{ barcode?: string | null }>(row.note, {});
  return {
    id: row.id,
    productId: row.listingId,
    name: row.itemName || "وحدة",
    factor: Math.max(0.000001, Number(row.quantity ?? 1)),
    barcode: config.barcode || null,
    salePrice: row.previousQuantity == null ? null : Number(row.previousQuantity),
  };
}

export async function listUnitConversions(businessId: string, productIds?: string[]) {
  const rows = await db.inventoryAuditEvent.findMany({
    where: {
      businessId,
      action: "UNIT_CONVERSION",
      ...(productIds?.length ? { listingId: { in: productIds } } : {}),
    },
    orderBy: { occurredAt: "asc" },
  });
  return rows.map(decodeUnitConversion).filter((item): item is UnitConversion => Boolean(item));
}

export async function getUnitConversion(businessId: string, conversionId: string, productId: string) {
  const row = await db.inventoryAuditEvent.findFirst({
    where: { id: conversionId, businessId, action: "UNIT_CONVERSION", listingId: productId },
  });
  return row ? decodeUnitConversion(row) : null;
}

export async function upsertUnitConversion(input: {
  businessId: string;
  productId: string;
  id?: string;
  name: string;
  factor: number;
  barcode?: string | null;
  salePrice?: number | null;
  actor: Actor;
}) {
  const data = {
    itemName: input.name,
    quantity: input.factor,
    previousQuantity: input.salePrice ?? null,
    note: JSON.stringify({ barcode: input.barcode || null }),
    actorUserId: input.actor.userId,
    actorName: input.actor.name,
    actorRole: input.actor.role,
    occurredAt: new Date(),
  };
  if (input.id) {
    const existing = await db.inventoryAuditEvent.findFirst({
      where: { id: input.id, businessId: input.businessId, action: "UNIT_CONVERSION", listingId: input.productId },
    });
    if (existing) return db.inventoryAuditEvent.update({ where: { id: existing.id }, data });
  }
  return db.inventoryAuditEvent.create({
    data: {
      businessId: input.businessId,
      action: "UNIT_CONVERSION",
      listingId: input.productId,
      ...data,
    },
  });
}

export function decodeLot(row: {
  id: string;
  listingId: string | null;
  itemName: string | null;
  quantity: unknown;
  previousQuantity: unknown;
  note: string | null;
  occurredAt: Date;
}): InventoryLot | null {
  if (!row.listingId) return null;
  const note = safeJson<{ expiresAt?: string | null; locationId?: string | null; receivedAt?: string }>(row.note, {});
  return {
    id: row.id,
    productId: row.listingId,
    lotNumber: row.itemName || row.id.slice(-8),
    quantity: Number(row.quantity ?? 0),
    unitCost: row.previousQuantity == null ? null : Number(row.previousQuantity),
    expiresAt: note.expiresAt ? new Date(note.expiresAt) : null,
    locationId: note.locationId || null,
    receivedAt: note.receivedAt ? new Date(note.receivedAt) : row.occurredAt,
  };
}

export async function listLots(businessId: string, productIds?: string[]) {
  const rows = await db.inventoryAuditEvent.findMany({
    where: {
      businessId,
      action: "LOT_STOCK",
      ...(productIds?.length ? { listingId: { in: productIds } } : {}),
    },
    orderBy: { occurredAt: "asc" },
  });
  return rows.map(decodeLot).filter((item): item is InventoryLot => Boolean(item));
}

export async function receiveLot(tx: Tx, input: {
  businessId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitCost?: number | null;
  lotNumber?: string | null;
  expiresAt?: Date | null;
  locationId?: string | null;
  actor: Actor;
}) {
  if (!input.lotNumber && !input.expiresAt) return null;
  const lotNumber = input.lotNumber?.trim() || `دفعة-${new Date().toISOString().slice(0, 10)}`;
  const rows = await tx.inventoryAuditEvent.findMany({
    where: { businessId: input.businessId, action: "LOT_STOCK", listingId: input.productId, itemName: lotNumber },
  });
  const existing = rows.find((row) => {
    const note = safeJson<{ locationId?: string | null }>(row.note, {});
    return (note.locationId || null) === (input.locationId || null);
  });
  if (existing) {
    return tx.inventoryAuditEvent.update({
      where: { id: existing.id },
      data: {
        quantity: Number(existing.quantity ?? 0) + input.quantity,
        previousQuantity: input.unitCost ?? existing.previousQuantity,
        note: JSON.stringify({
          expiresAt: input.expiresAt?.toISOString() || safeJson<{ expiresAt?: string }>(existing.note, {}).expiresAt || null,
          locationId: input.locationId || null,
          receivedAt: safeJson<{ receivedAt?: string }>(existing.note, {}).receivedAt || new Date().toISOString(),
        }),
        occurredAt: new Date(),
      },
    });
  }
  return tx.inventoryAuditEvent.create({
    data: {
      businessId: input.businessId,
      action: "LOT_STOCK",
      listingId: input.productId,
      itemName: lotNumber,
      quantity: input.quantity,
      previousQuantity: input.unitCost ?? null,
      actorUserId: input.actor.userId,
      actorName: input.actor.name,
      actorRole: input.actor.role,
      note: JSON.stringify({
        expiresAt: input.expiresAt?.toISOString() || null,
        locationId: input.locationId || null,
        receivedAt: new Date().toISOString(),
        productName: input.productName,
      }),
    },
  });
}

export async function consumeLots(tx: Tx, input: {
  businessId: string;
  productId: string;
  quantity: number;
  locationId?: string | null;
}) {
  let remaining = input.quantity;
  const rows = await tx.inventoryAuditEvent.findMany({
    where: { businessId: input.businessId, action: "LOT_STOCK", listingId: input.productId, quantity: { gt: 0 } },
    orderBy: { occurredAt: "asc" },
  });
  const lots = rows.map(decodeLot).filter((item): item is InventoryLot => Boolean(item))
    .filter((lot) => !input.locationId || !lot.locationId || lot.locationId === input.locationId)
    .sort((a, b) => {
      if (a.expiresAt && b.expiresAt) return a.expiresAt.getTime() - b.expiresAt.getTime();
      if (a.expiresAt) return -1;
      if (b.expiresAt) return 1;
      return a.receivedAt.getTime() - b.receivedAt.getTime();
    });
  for (const lot of lots) {
    if (remaining <= 0) break;
    const used = Math.min(lot.quantity, remaining);
    await tx.inventoryAuditEvent.update({ where: { id: lot.id }, data: { quantity: lot.quantity - used } });
    remaining -= used;
  }
  return input.quantity - Math.max(0, remaining);
}

export async function syncListingForProduct(tx: Tx, input: {
  businessId: string;
  productId: string;
  delta: number;
}) {
  const product = await tx.product.findFirst({
    where: { id: input.productId, businessId: input.businessId },
    select: { name: true, barcode: true, unit: true },
  });
  if (!product) return null;
  const listing = product.barcode
    ? await tx.marketplaceListing.findFirst({ where: { sellerBusinessId: input.businessId, barcode: product.barcode, active: true }, orderBy: { updatedAt: "desc" } })
    : await tx.marketplaceListing.findFirst({ where: { sellerBusinessId: input.businessId, name: product.name, unit: product.unit, active: true }, orderBy: { updatedAt: "desc" } });
  if (!listing) return null;
  const next = Math.max(0, Number(listing.quantity) + input.delta);
  return tx.marketplaceListing.update({ where: { id: listing.id }, data: { quantity: next } });
}

export async function syncProductForListing(tx: Tx, input: {
  businessId: string;
  listing: { name: string; barcode: string | null; unit: string; price?: unknown };
  delta: number;
}) {
  const product = input.listing.barcode
    ? await tx.product.findFirst({ where: { businessId: input.businessId, barcode: input.listing.barcode, active: true } })
    : await tx.product.findFirst({ where: { businessId: input.businessId, name: input.listing.name, unit: input.listing.unit, active: true } });
  if (!product) return null;
  const previous = Number(product.quantity);
  const next = Math.max(0, previous + input.delta);
  return tx.product.update({ where: { id: product.id }, data: { quantity: next } });
}

export async function listShifts(businessId: string, take = 30) {
  const rows = await db.inventoryAuditEvent.findMany({
    where: { businessId, action: "SHIFT" },
    orderBy: { occurredAt: "desc" },
    take,
  });
  return rows.map((row): ShiftState => {
    const note = safeJson<{
      status?: "OPEN" | "CLOSED";
      locationId?: string | null;
      openedAt?: string;
      closedAt?: string | null;
      note?: string | null;
    }>(row.note, {});
    return {
      id: row.id,
      locationId: note.locationId || null,
      status: note.status === "CLOSED" ? "CLOSED" : "OPEN",
      openedAt: note.openedAt ? new Date(note.openedAt) : row.occurredAt,
      closedAt: note.closedAt ? new Date(note.closedAt) : null,
      openingCash: Number(row.quantity ?? 0),
      expectedCash: row.previousQuantity == null ? null : Number(row.previousQuantity),
      actualCash: row.newQuantity == null ? null : Number(row.newQuantity),
      actorName: row.actorName,
      note: note.note || null,
    };
  });
}

export async function getOpenShift(businessId: string, locationId?: string | null) {
  const shifts = await listShifts(businessId, 50);
  return shifts.find((shift) => shift.status === "OPEN" && (!locationId || shift.locationId === locationId)) ?? null;
}

export async function createShift(input: {
  businessId: string;
  locationId?: string | null;
  openingCash: number;
  actor: Actor;
}) {
  const existing = await getOpenShift(input.businessId, input.locationId);
  if (existing) throw new Error("SHIFT_ALREADY_OPEN");
  const now = new Date();
  return db.inventoryAuditEvent.create({
    data: {
      businessId: input.businessId,
      action: "SHIFT",
      itemName: "وردية كاشير",
      quantity: input.openingCash,
      actorUserId: input.actor.userId,
      actorName: input.actor.name,
      actorRole: input.actor.role,
      note: JSON.stringify({ status: "OPEN", locationId: input.locationId || null, openedAt: now.toISOString(), closedAt: null }),
    },
  });
}

export async function closeShift(input: {
  businessId: string;
  shiftId: string;
  actualCash: number;
  expectedCash: number;
  note?: string | null;
  actor: Actor;
}) {
  const row = await db.inventoryAuditEvent.findFirst({ where: { id: input.shiftId, businessId: input.businessId, action: "SHIFT" } });
  if (!row) throw new Error("SHIFT_NOT_FOUND");
  const state = safeJson<{ status?: string; locationId?: string | null; openedAt?: string }>(row.note, {});
  if (state.status === "CLOSED") throw new Error("SHIFT_ALREADY_CLOSED");
  return db.inventoryAuditEvent.update({
    where: { id: row.id },
    data: {
      previousQuantity: input.expectedCash,
      newQuantity: input.actualCash,
      actorUserId: input.actor.userId,
      actorName: input.actor.name,
      actorRole: input.actor.role,
      note: JSON.stringify({
        status: "CLOSED",
        locationId: state.locationId || null,
        openedAt: state.openedAt || row.occurredAt.toISOString(),
        closedAt: new Date().toISOString(),
        note: input.note || null,
      }),
      occurredAt: new Date(),
    },
  });
}

export function actorFromContext(context: { user: { id: string; name: string }; membership: { role: string } }): Actor {
  return { userId: context.user.id, name: context.user.name, role: context.membership.role };
}

export { safeJson, systemActor };
