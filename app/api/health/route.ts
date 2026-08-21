import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "tijra",
    scope: ["inventory", "suppliers", "purchasing", "sales", "accounting", "payroll"],
    financing: false,
    deliveryManagement: false,
  });
}
