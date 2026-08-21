import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_HOURS = 72;

type Payload = { orderId: string; exp: number };

function secret() {
  const value = process.env.SUPPLIER_LINK_SECRET;
  if (!value || value.length < 32) throw new Error("SUPPLIER_LINK_SECRET_NOT_CONFIGURED");
  return value;
}

function sign(encoded: string) {
  return createHmac("sha256", secret()).update(encoded).digest("base64url");
}

export function createSupplierOrderToken(orderId: string, hours = DEFAULT_HOURS) {
  const payload: Payload = { orderId, exp: Date.now() + Math.max(1, Math.min(hours, 168)) * 60 * 60 * 1000 };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifySupplierOrderToken(token: string): Payload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  try {
    const expected = sign(encoded);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Payload;
    if (!payload.orderId || !Number.isFinite(payload.exp) || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
