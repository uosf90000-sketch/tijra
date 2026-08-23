"use client";

import { useEffect } from "react";

type Viewer = {
  membership?: { role?: string };
  business?: { businessType?: string };
};

export function SidebarBehavior() {
  useEffect(() => {
    let cancelled = false;
    const viewerPromise = fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null) as Promise<Viewer | null>;

    function handleToggle(event: Event) {
      const details = event.target as HTMLDetailsElement | null;
      if (!details?.matches(".compactSideNav details.navSection") || !details.open) return;
      const nav = details.closest<HTMLElement>(".compactSideNav");
      if (!nav) return;

      nav.querySelectorAll<HTMLDetailsElement>("details.navSection[open]").forEach((other) => {
        if (other !== details) other.open = false;
      });

      requestAnimationFrame(() => {
        const navRect = nav.getBoundingClientRect();
        const sectionRect = details.getBoundingClientRect();
        if (sectionRect.bottom > navRect.bottom || sectionRect.top < navRect.top) {
          details.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });
    }

    async function syncOwnerNavigation() {
      if (cancelled) return;
      const nav = document.querySelector<HTMLElement>(".compactSideNav");
      const frame = nav?.closest<HTMLElement>(".appFrame");
      if (!nav || !frame) return;

      const viewer = await viewerPromise;
      if (cancelled || !viewer) return;
      const ownerRetailer = viewer.membership?.role === "OWNER" && frame.classList.contains("role-retailer");
      nav.classList.toggle("ownerSimpleNav", ownerRetailer);

      if (ownerRetailer) {
        const cashier = nav.querySelector<HTMLAnchorElement>('a[href="/sales"]');
        const management = nav.querySelector<HTMLAnchorElement>('a[href="/management"]');
        const cashierLabel = cashier?.querySelectorAll("span")?.[1];
        const managementLabel = management?.querySelectorAll("span")?.[1];
        if (cashierLabel) cashierLabel.textContent = "الكاشير";
        if (managementLabel) managementLabel.textContent = "الإدارة والمحاسبة";
      }
    }

    document.addEventListener("toggle", handleToggle, true);
    const observer = new MutationObserver(() => void syncOwnerNavigation());
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    void syncOwnerNavigation();

    return () => {
      cancelled = true;
      observer.disconnect();
      document.removeEventListener("toggle", handleToggle, true);
    };
  }, []);

  return null;
}
