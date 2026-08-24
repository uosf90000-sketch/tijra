"use client";

import { useCallback, useEffect, useState } from "react";
import { listOfflineOperations, offlineQueueChangeEvent, type OfflineOperationType } from "@/lib/offline-queue";

export function useOfflineStatus(type?: OfflineOperationType) {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  const refresh = useCallback(async () => {
    setOnline(typeof navigator === "undefined" ? true : navigator.onLine);
    try {
      setPending((await listOfflineOperations(type)).length);
    } catch {
      setPending(0);
    }
  }, [type]);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    window.addEventListener(offlineQueueChangeEvent, onChange);
    return () => {
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
      window.removeEventListener(offlineQueueChangeEvent, onChange);
    };
  }, [refresh]);

  return { online, pending, refresh };
}
