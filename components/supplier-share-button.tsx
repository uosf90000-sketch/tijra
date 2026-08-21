"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";

export function SupplierShareButton({ orderId }: { orderId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function share() {
    setState("loading");
    const response = await fetch(`/api/purchase-orders/${orderId}/supplier-link`, { method: "POST" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.url) {
      setState("error");
      return;
    }

    try {
      if (navigator.share) {
        await navigator.share({ title: "طلب توريد من تِجرا", text: "راجع الطلب وأكد إمكانية التوريد.", url: result.url });
      } else {
        await navigator.clipboard.writeText(result.url);
      }
      setState("done");
    } catch {
      setState("idle");
    }
  }

  return <button className="button secondary compact" onClick={share} disabled={state === "loading"}><Share2 size={15} /> {state === "loading" ? "جاري..." : state === "done" ? "تمت المشاركة" : state === "error" ? "تعذر إنشاء الرابط" : "رابط المورد"}</button>;
}
