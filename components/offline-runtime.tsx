"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { flushOfflineOperations } from "@/lib/offline-queue";

export function OfflineRuntime() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function sync() {
      const result = await flushOfflineOperations().catch(() => ({ synced: 0, pending: 0, failed: 0 }));
      if (!cancelled && result.synced > 0 && (pathname === "/sales" || pathname === "/inventory/audit")) router.refresh();
    }

    const onOnline = () => void sync();
    window.addEventListener("online", onOnline);
    if (navigator.onLine) void sync();
    const timer = window.setInterval(() => { if (navigator.onLine) void sync(); }, 30000);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      window.clearInterval(timer);
    };
  }, [pathname, router]);

  return null;
}
