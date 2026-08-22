"use client";

import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { ChangeEvent, useRef, useState } from "react";

const MAX_DIMENSION = 900;
const JPEG_QUALITY = 0.76;
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;

async function compressImage(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("INVALID_IMAGE");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("IMAGE_TOO_LARGE");

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("IMAGE_READ_FAILED"));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("IMAGE_DECODE_FAILED"));
    element.src = dataUrl;
  });

  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("IMAGE_PROCESS_FAILED");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

export function ProductImageInput({ name = "imageUrl" }: { name?: string }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const compressed = await compressImage(file);
      if (compressed.length > 950_000) {
        setError("الصورة ما زالت كبيرة. جرّب صورة أبسط أو أقرب للمنتج.");
        return;
      }
      setValue(compressed);
    } catch (imageError) {
      const code = imageError instanceof Error ? imageError.message : "IMAGE_FAILED";
      setError(code === "IMAGE_TOO_LARGE" ? "حجم الصورة كبير جدًا. اختر صورة أقل من 12MB." : "تعذر تجهيز الصورة. جرّب صورة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="productImageField">
      <input type="hidden" name={name} value={value} />
      <input ref={cameraRef} className="srOnlyInput" type="file" accept="image/*" capture="environment" onChange={onFile} />
      <input ref={galleryRef} className="srOnlyInput" type="file" accept="image/*" onChange={onFile} />

      <div className="productImageLabel"><span>صورة المنتج</span><small>اختيارية · تُضغط تلقائيًا قبل الحفظ</small></div>

      {value ? (
        <div className="productImagePreview">
          <img src={value} alt="معاينة صورة المنتج" />
          <div className="productImagePreviewActions">
            <button type="button" className="button secondary compact" onClick={() => cameraRef.current?.click()} disabled={busy}><Camera size={16} /> إعادة التصوير</button>
            <button type="button" className="button secondary compact" onClick={() => galleryRef.current?.click()} disabled={busy}><ImagePlus size={16} /> تغيير الصورة</button>
            <button type="button" className="iconButton dangerIconButton" onClick={() => setValue("")} aria-label="حذف صورة المنتج"><Trash2 size={17} /></button>
          </div>
        </div>
      ) : (
        <div className="productImageActions">
          <button type="button" className="productMediaButton" onClick={() => cameraRef.current?.click()} disabled={busy}><Camera size={21} /><strong>التقاط صورة</strong><span>يفتح الكاميرا</span></button>
          <button type="button" className="productMediaButton" onClick={() => galleryRef.current?.click()} disabled={busy}><ImagePlus size={21} /><strong>اختيار من الصور</strong><span>من ألبوم الجهاز</span></button>
        </div>
      )}

      {busy && <div className="productImageStatus">جاري تجهيز الصورة...</div>}
      {error && <div className="productImageError">{error}</div>}
    </div>
  );
}
