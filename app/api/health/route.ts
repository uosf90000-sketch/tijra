import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

function deployedBuild() {
  return process.env.RAILWAY_GIT_COMMIT_SHA
    || process.env.RAILWAY_GIT_COMMIT
    || process.env.GIT_COMMIT_SHA
    || process.env.VERCEL_GIT_COMMIT_SHA
    || null;
}

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      service: "tijra",
      database: "connected",
      build: deployedBuild(),
      scope: ["inventory", "suppliers", "purchasing", "sales", "accounting", "payroll", "ocr", "auth"],
      financing: false,
      deliveryManagement: false,
    });
  } catch {
    return NextResponse.json({
      ok: false,
      service: "tijra",
      database: "unavailable",
      build: deployedBuild(),
    }, { status: 503 });
  }
}
