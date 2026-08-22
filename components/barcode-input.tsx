"use client";

import { BrowserMultiFormatReader } from "@zxing/browser";
import { Camera, Keyboard, ScanLine, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type ScannerControls = { stop: () => void };

export function BarcodeInput({ name = "barcode" }: { name?: string }) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<ScannerControls | null>(null);

  function closeScanner() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setOpen(false);
  }

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const reset = () => {
      setValue("");
      setError("");
      closeScanner();
    };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, []);

  useEffect(() => {
    if (!open || !videoRef.current) return;
    let cancelled = false;
    const reader = new BrowserMultiFormatReader();

    setError("");

    reader
      .decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
          },
        },
        videoRef.current,
        (result, scanError, controls) => {
          if (cancelled) return;
          if (controls) controlsRef.current = controls;
          if (result) {
            setValue(result.getText());
            controls?.stop();
            controlsRef.current = null;
            setOpen(false);
            if (navigator.vibrate) navigator.vibrate(80);
            return;
          }
          if (scanError && scanError.name !== "NotFoundException") {
            console.warn("Barcode scan error", scanError);
          }
        },
      )
      .then((controls) => {
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      })
      .catch((scanError: unknown) => {
        console.error("Unable to start barcode scanner", scanError);
        setError("تعذر فتح الكاميرا. تأكد من السماح لتِجرا باستخدام الكاميرا، أو أدخل الباركود يدويًا.");
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open]);

  return (
    <label className="barcodeField">
      <span>الباركود</span>
      <div className="barcodeInputRow">
        <input
          ref={inputRef}
          name={name}
          inputMode="numeric"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="امسح الكود أو أدخله يدويًا"
          autoComplete="off"
        />
        <button type="button" className="barcodeScanButton" onClick={() => setOpen(true)} aria-label="مسح الباركود بالكاميرا">
          <ScanLine size={20} />
          <span>مسح</span>
        </button>
      </div>
      <small className="barcodeHelp"><Camera size={14} /> اضغط «مسح» لفتح الكاميرا الخلفية وقراءة الكود تلقائيًا.</small>

      {open && (
        <div className="barcodeScannerOverlay" role="dialog" aria-modal="true" aria-label="ماسح الباركود">
          <div className="barcodeScannerCard">
            <div className="barcodeScannerHeader">
              <div>
                <strong>امسح باركود المنتج</strong>
                <span>وجّه الكاميرا نحو الكود وثبّت الجهاز لثانية.</span>
              </div>
              <button type="button" className="iconButton" onClick={closeScanner} aria-label="إغلاق الماسح"><X size={20} /></button>
            </div>

            <div className="barcodeVideoFrame">
              <video ref={videoRef} playsInline muted autoPlay />
              <div className="barcodeTarget" aria-hidden="true"><span /></div>
            </div>

            {error && <div className="barcodeScannerError">{error}</div>}

            <div className="barcodeScannerFooter">
              <span><Keyboard size={15} /> تقدر تغلق الكاميرا وتكتب الرقم يدويًا.</span>
              <button type="button" className="button secondary" onClick={closeScanner}>إدخال يدوي</button>
            </div>
          </div>
        </div>
      )}
    </label>
  );
}
