import { compare, hash } from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { UserRole } from "@prisma/client";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "tijra_session";
const DEFAULT_SESSION_DAYS = 30;

function sessionDays() {
  const value = Number(process.env.AUTH_SESSION_DAYS ?? DEFAULT_SESSION_DAYS);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 90) : DEFAULT_SESSION_DAYS;
}

function digestToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  return hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return compare(password, passwordHash);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionDays() * 24 * 60 * 60 * 1000);

  await db.session.create({
    data: { userId, tokenHash: digestToken(token), expiresAt },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return expiresAt;
}

export async function clearSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: digestToken(token) } });
  }
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}

export async function getSessionContext() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: digestToken(token) },
    include: {
      user: {
        include: {
          memberships: {
            include: { business: true },
            orderBy: { id: "asc" },
          },
        },
      },
    },
  });

  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await db.session.delete({ where: { id: session.id } });
    return null;
  }

  const membership = session.user.memberships[0];
  if (!membership) return null;

  return {
    sessionId: session.id,
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      phone: session.user.phone,
    },
    membership: {
      id: membership.id,
      role: membership.role,
      businessId: membership.businessId,
    },
    business: membership.business,
  };
}

export function hasRole(role: UserRole, allowed: readonly UserRole[]) {
  return allowed.includes(role);
}

export type SessionContext = NonNullable<Awaited<ReturnType<typeof getSessionContext>>>;
