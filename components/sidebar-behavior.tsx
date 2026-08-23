"use client";

import { useEffect } from "react";

type Viewer = {
  membership?: { role?: string };
  business?: { businessType?: string };
};

export function SidebarBehavior() {
  useEffect(() => {
    let cancelled = false;
    let bodyLocked = false;
    let lockedScrollY = 0;

    const viewerPromise = fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null) as Promise<Viewer | null>;

    function handleToggle(event: Event) {
      const details = event.target as HTMLDetailsElement | null;
      if (!details?.matches(".compactSideNav details.navSection") || !details.open) return;
      const nav = details.closest<HTMLElement>(".compactSideNav");
      if (!nav || nav.classList.contains("ownerSimpleNav")) return;

      nav.querySelectorAll<HTMLDetailsElement>("details.navSection[open]").forEach((other) => {
        if (other !== details) other.open = false;
      });

      requestAnimationFrame(() => {
        const navTop = nav.getBoundingClientRect().top;
        const sectionTop = details.getBoundingClientRect().top;
        const sectionBottom = details.getBoundingClientRect().bottom;
        const navBottom = nav.getBoundingClientRect().bottom;
        if (sectionBottom <= navBottom && sectionTop >= navTop) return;

        const desiredTop = Math.max(0, nav.scrollTop + sectionTop - navTop - 8);
        nav.scrollTo({ top: desiredTop, behavior: "smooth" });
      });
    }

    function syncSidebarScrollLock() {
      const sidebar = document.querySelector<HTMLElement>(".sidebar");
      const shouldLock = Boolean(sidebar?.classList.contains("open")) && window.matchMedia("(max-width: 1100px)").matches;

      if (shouldLock && !bodyLocked) {
        lockedScrollY = window.scrollY;
        bodyLocked = true;
        document.documentElement.style.overflow = "hidden";
        document.body.style.position = "fixed";
        document.body.style.top = `-${lockedScrollY}px`;
        document.body.style.left = "0";
        document.body.style.right = "0";
        document.body.style.width = "100%";
        return;
      }

      if (!shouldLock && bodyLocked) {
        bodyLocked = false;
        document.documentElement.style.overflow = "";
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.left = "";
        document.body.style.right = "";
        document.body.style.width = "";
        window.scrollTo(0, lockedScrollY);
      }
    }

    function syncDashboardLinks() {
      const frame = document.querySelector<HTMLElement>(".appFrame");
      const supplierMode = frame?.classList.contains("role-supplier") ?? false;
      const href = supplierMode ? "/marketplace/seller#orders" : "/marketplace/orders";

      document.querySelectorAll<HTMLElement>(".dashboardStripItem").forEach((item) => {
        const text = item.textContent ?? "";
        const isOrders = text.includes("الطلبات النشطة") || text.includes("الطلبات الحالية");
        if (!isOrders) {
          delete item.dataset.dashboardHref;
          item.removeAttribute("role");
          item.removeAttribute("tabindex");
          return;
        }
        item.dataset.dashboardHref = href;
        item.setAttribute("role", "link");
        item.setAttribute("tabindex", "0");
        item.setAttribute("aria-label", "فتح الطلبات النشطة");
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
        nav.querySelectorAll<HTMLDetailsElement>("details.navSection").forEach((section) => {
          section.open = true;
        });

        const cashier = nav.querySelector<HTMLAnchorElement>('a[href="/sales"]');
        const management = nav.querySelector<HTMLAnchorElement>('a[href="/management"]');
        const cashierLabel = cashier?.querySelectorAll("span")?.[1];
        const managementLabel = management?.querySelectorAll("span")?.[1];
        if (cashierLabel) cashierLabel.textContent = "الكاشير";
        if (managementLabel) managementLabel.textContent = "الإدارة والمحاسبة";
      }
    }

    function handleDocumentClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const link = target?.closest<HTMLElement>(".dashboardStripItem[data-dashboard-href]");
      const href = link?.dataset.dashboardHref;
      if (href) window.location.assign(href);
    }

    function handleDocumentKeydown(event: KeyboardEvent) {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target as HTMLElement | null;
      const link = target?.closest<HTMLElement>(".dashboardStripItem[data-dashboard-href]");
      const href = link?.dataset.dashboardHref;
      if (!href) return;
      event.preventDefault();
      window.location.assign(href);
    }

    function syncAll() {
      syncSidebarScrollLock();
      syncDashboardLinks();
      void syncOwnerNavigation();
    }

    document.addEventListener("toggle", handleToggle, true);
    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", handleDocumentKeydown);
    window.addEventListener("resize", syncSidebarScrollLock);

    const observer = new MutationObserver(syncAll);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "open"] });
    syncAll();

    return () => {
      cancelled = true;
      observer.disconnect();
      document.removeEventListener("toggle", handleToggle, true);
      document.removeEventListener("click", handleDocumentClick);
      document.removeEventListener("keydown", handleDocumentKeydown);
      window.removeEventListener("resize", syncSidebarScrollLock);
      if (bodyLocked) {
        document.documentElement.style.overflow = "";
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.left = "";
        document.body.style.right = "";
        document.body.style.width = "";
        window.scrollTo(0, lockedScrollY);
      }
    };
  }, []);

  return null;
}
