import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";

export async function GET() {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  return NextResponse.json(context);
}
