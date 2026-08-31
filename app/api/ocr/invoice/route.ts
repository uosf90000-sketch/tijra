import { NextResponse } from "next/server";
import { createWorker } from "tesseract.js";
import { requireApiAnyPermission } from "@/lib/api-auth";
import { parseInvoiceText } from "@/lib/invoice-parser";

export const runtime = "nodejs";
export const maxDuration = 60;

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedExtensions = /\.(jpe?g|png|webp)$/i;

export async function POST(request: Request) {
  const auth = await requireApiAnyPermission(["PURCHASES", "ACCOUNTING"]);
  if (auth.response) return auth.response;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 });
  }

  const maxBytes = Number(process.env.OCR_MAX_BYTES ?? 8 * 1024 * 1024);
  if (file.size <= 0 || file.size > maxBytes) {
    return NextResponse.json({ error: "FILE_TOO_LARGE", maxBytes }, { status: 413 });
  }

  if (!allowedTypes.has(file.type) && !allowedExtensions.test(file.name)) {
    return NextResponse.json({ error: "UNSUPPORTED_FILE_TYPE" }, { status: 415 });
  }

  const image = Buffer.from(await file.arrayBuffer());

  try {
    const worker = await createWorker(["ara", "eng"]);
    try {
      const result = await worker.recognize(image);
      const parsed = parseInvoiceText(result.data.text);

      return NextResponse.json({
        provider: "tesseract-local",
        confidence: result.data.confidence,
        file: { name: file.name, type: file.type, size: file.size },
        parsed,
        reviewRequired: true,
        note: "راجع الأصناف والكميات والأسعار قبل اعتماد الاستلام وتحديث المخزون.",
      });
    } finally {
      await worker.terminate();
    }
  } catch (error) {
    console.error("Invoice OCR failed", error);
    return NextResponse.json({ error: "OCR_FAILED" }, { status: 500 });
  }
}
