import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      service: "tijra",
      database: "connected",
      scope: ["inventory", "suppliers", "purchasing", "sales", "accounting", "payroll", "ocr", "auth"],
      financing: false,
      deliveryManagement: false,
    });
  } catch {
    return NextResponse.json({
      ok: false,
      service: "tijra",
      database: "unavailable",
    }, { status: 503 });
  }
}
