"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Bell,
  Boxes,
  Calculator,
  ChefHat,
  ChevronDown,
  CircleUserRound,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  LayoutDashboard,
  Landmark,
  LogOut,
  Menu,
  PackageCheck,
  PackageSearch,
  RotateCcw,
  ScanBarcode,
  Search,
  ShoppingBag,
  ShoppingBasket,
  ShoppingCart,
  Sparkles,
  Store,
  Tags,
  Trash2,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CommandPalette } from "@/components/command-palette";
import { TijraLogo } from "@/components/tijra-logo";
import { resolveWorkspaceModules } from "@/lib/workspace-profile";
import { effectivePermissions, roleLandingHref } from "@/lib/role-workspaces";

type Permission = "CASHIER" | "INVENTORY" | "PURCHASES" | "ACCOUNTING";
type TradeMode = "retailer" | "supplier";
type NavItem = { href: string; label: string; icon: LucideIcon; badge?: string };
type NavSection = { label: string; items: NavItem[] };

const home: NavItem = { href: "/", label: "الرئيسية", icon: LayoutDashboard };
const market: NavItem = { href: "/marketplace", label: "السوق", icon: ShoppingBag };
const smartBuy: NavItem = { href: "/smart-buy", label: "مشتريات الأسبوع", icon: Sparkles };
const reorder: NavItem = { href: "/reorder", label: "إعادة الطلب", icon: RotateCcw };
const catalog: NavItem = { href: "/catalog", label: "كتالوج المنتجات", icon: PackageSearch };
const marketplaceSuppliers: NavItem = { href: "/marketplace/suppliers", label: "الموردون", icon: Store };
const orders: NavItem = { href: "/marketplace/orders", label: "طلباتي", icon: ClipboardList };
const smartPrice: NavItem = { href: "/alerts", label: "السعر الأذكى", icon: Tags };
const smartAlerts: NavItem = { href: "/smart-alerts", label: "التنبيهات الذكية", icon: Bell };
const inventory: NavItem = { href: "/inventory", label: "المخزون", icon: Boxes };
const inventoryAudit: NavItem = { href: "/inventory/audit", label: "الجرد", icon: ClipboardCheck };
const receiving: NavItem = { href: "/inventory/receiving", label: "الاستلام الذكي", icon: PackageCheck };
const returns: NavItem = { href: "/inventory/returns", label: "المرتجعات", icon: RotateCcw };
const locations: NavItem = { href: "/inventory/locations", label: "الفروع والمستودعات", icon: Store };
const units: NavItem = { href: "/inventory/units", label: "وحدات البيع", icon: Tags };
const batches: NavItem = { href: "/inventory/batches", label: "الدفعات والصلاحية", icon: PackageSearch };
const productSettings: NavItem = { href: "/inventory/product-settings", label: "إعدادات البيع", icon: Calculator };
const movements: NavItem = { href: "/inventory/movements", label: "سجل حركة الصنف", icon: Activity };
const recipes: NavItem = { href: "/recipes", label: "الوصفات والمكونات", icon: ChefHat };
const waste: NavItem = { href: "/inventory/waste", label: "الهدر والتالف", icon: Trash2 };
const dayClosing: NavItem = { href: "/inventory/closing", label: "إقفال نهاية اليوم", icon: ClipboardCheck };
const sales: NavItem = { href: "/sales", label: "الكاشير", icon: ShoppingCart };
const salesAnalytics: NavItem = { href: "/sales/analytics", label: "تحليلات المبيعات", icon: BarChart3 };
const shifts: NavItem = { href: "/sales/shifts", label: "الورديات", icon: ClipboardCheck };
const purchases: NavItem = { href: "/purchases", label: "المشتريات", icon: ShoppingBasket };
const purchaseApprovals: NavItem = { href: "/purchases/approvals", label: "موافقات الشراء", icon: ClipboardCheck };
const purchaseGuardian: NavItem = { href: "/purchases/insights", label: "مراقب المشتريات", icon: Tags };
const activityCenter: NavItem = { href: "/activity", label: "مركز النشاط", icon: Activity };
const controlCenter: NavItem = { href: "/control-center", label: "مركز الرقابة", icon: Bell };
const staffInventory: NavItem = { href: "/staff/inventory", label: "إدخال وإخراج المخزون", icon: ScanBarcode };
const productsHub: NavItem = { href: "/products", label: "المنتجات", icon: PackageSearch };
const managementHub: NavItem = { href: "/management", label: "الإدارة والمحاسبة", icon: UsersRound };
const workspaceSetup: NavItem = { href: "/management/workspace", label: "الشركات ومساحة العمل", icon: Store };
const roleWorkbench: NavItem = { href: "/workbench", label: "مركز عملي", icon: LayoutDashboard };
const financeWorkbench: NavItem = { href: "/workbench/accounting", label: "مكتبي المالي", icon: Calculator };
const financeLedger: NavItem = { href: "/accounting/ledger", label: "دفتر القيود", icon: Landmark };
const accountSecurity: NavItem = { href: "/account/security", label: "أمان حسابي", icon: CircleUserRound };
const crm360: NavItem = { href: "/crm", label: "العملاء والعروض", icon: UsersRound };
const receivables360: NavItem = { href: "/crm/receivables", label: "المستحقات والتحصيل", icon: WalletCards };
const sourcing360: NavItem = { href: "/sourcing", label: "عروض الموردين", icon: ShoppingBasket };
const flow360: NavItem = { href: "/flow", label: "تِجرا Flow", icon: Activity };
const compliance360: NavItem = { href: "/compliance", label: "التصاريح والمستندات", icon: ClipboardCheck };
const intelligence360: NavItem = { href: "/intelligence", label: "نبض الأعمال", icon: BarChart3 };

const sellerProducts: NavItem = { href: "/marketplace/seller", label: "المنتجات", icon: Store };
const importProducts: NavItem = { href: "/supplier/import", label: "استيراد Excel / CSV", icon: FileSpreadsheet };
const stockUpdate: NavItem = { href: "/supplier/stock-update", label: "تحديث باركود سريع", icon: ScanBarcode };
const stockCount: NavItem = { href: "/supplier/stock-count", label: "الجرد السريع", icon: ClipboardCheck };
const supplierPicking: NavItem = { href: "/supplier/picking", label: "تجهيز الطلبات بالمسح", icon: ScanBarcode };
const sellerOrders: NavItem = { href: "/marketplace/seller#orders", label: "الطلبات الواردة", icon: ClipboardList };
const externalSale: NavItem = { href: "/marketplace/seller#external-sale", label: "البيع الخارجي", icon: ScanBarcode };
const customers: NavItem = { href: "/marketplace/seller#customers", label: "التجار والعملاء", icon: UsersRound };
const dormantCustomers: NavItem = { href: "/supplier/dormant", label: "تجار توقفوا عن الشراء", icon: RotateCcw };
const supplierPricing: NavItem = { href: "/supplier/pricing", label: "التسعير المتقدم", icon: Tags };
const supplierPrice: NavItem = { href: "/supplier/price-intelligence", label: "ذكاء الأسعار", icon: Tags };
const supplierForecast: NavItem = { href: "/supplier/forecast", label: "توقع الطلب", icon: BarChart3 };
const supplierAlerts: NavItem = { href: "/supplier/alerts", label: "التنبيهات الذكية", icon: Bell };
const supplierActivity: NavItem = { href: "/activity?mode=supplier", label: "مركز النشاط", icon: Activity };

const accounting: NavItem = { href: "/accounting", label: "التقارير", icon: Calculator };
const reconciliation: NavItem = { href: "/accounting/reconciliation", label: "مطابقة الأموال", icon: Landmark };
const employees: NavItem = { href: "/employees", label: "الموظفون", icon: UsersRound };
const payroll: NavItem = { href: "/payroll", label: "الرواتب", icon: WalletCards };

const roleLabels: Record<string, string> = {
  OWNER: "مالك المنشأة",
  MANAGER: "مدير",
  CASHIER: "كاشير",
  ACCOUNTANT: "محاسب",
  SUPPLIER: "مورد",
  STAFF: "موظف",
};

const businessTypeLabels = { RETAILER: "تاجر تجزئة", SUPPLIER: "مورد", BOTH: "مورد وتاجر" } as const;

function cleanHref(href: string) {
  return href.split("#")[0].split("?")[0];
}

function isItemActive(item: NavItem, pathname: string) {
  const clean = cleanHref(item.href);
  if (item.href.includes("#")) return false;
  if (clean === "/") return pathname === "/";
  if (clean === "/marketplace/seller") return pathname === clean;
  return pathname.startsWith(clean);
}

function NavLink({ href, label, icon: Icon, badge, pathname, onClick }: NavItem & { pathname: string; onClick?: () => void }) {
  const active = isItemActive({ href, label, icon: Icon, badge }, pathname);
  return (
    <Link className={`navItem ${active ? "active" : ""} ${badge ? "lockedNavItem" : ""}`} href={href} onClick={onClick}>
      <span className="navIcon"><Icon size={18} strokeWidth={1.8} /></span>
      <span>{label}</span>
      {badge ? <span className="navBadge">{badge}</span> : null}
    </Link>
  );
}

function NavSectionBlock({ section, pathname, onNavigate, onOpen }: { section: NavSection; pathname: string; onNavigate: () => void; onOpen?: (element: HTMLDetailsElement) => void }) {
  if (!section.items.length) return null;
  const active = section.items.some((item) => isItemActive(item, pathname));
  return (
    <details className="navSection" open={active || undefined} onToggle={(event) => { if (event.currentTarget.open) onOpen?.(event.currentTarget); }}>
      <summary><span>{section.label}</span><ChevronDown size={16} /></summary>
      <div className="navSectionItems">
        {section.items.map((item) => <NavLink key={`${item.href}-${item.label}`} {...item} pathname={pathname} onClick={onNavigate} />)}
      </div>
    </details>
  );
}

function retailerSections(): NavSection[] {
  return [
    { label: "البيع", items: [sales, shifts] },
    { label: "المخزون والتشغيل", items: [inventory, receiving, returns, inventoryAudit, locations, units, batches, productSettings, movements, waste, dayClosing] },
    { label: "الشراء والسوق", items: [market, smartBuy, reorder, sourcing360, catalog, marketplaceSuppliers, smartPrice, smartAlerts, purchases, purchaseGuardian, orders] },
    { label: "العملاء والتحصيل", items: [crm360, receivables360] },
    { label: "الإدارة", items: [intelligence360, flow360, compliance360, activityCenter, { ...accounting, label: "الملخص المالي" }, reconciliation, employees, payroll] },
  ];
}

function supplierSections(isOwner: boolean): NavSection[] {
  return [
    { label: "البيع والطلبات", items: [sales, shifts, sellerOrders, supplierPicking, externalSale] },
    { label: "المخزون", items: [sellerProducts, importProducts, stockUpdate, stockCount, inventory, receiving, returns, locations, units, batches, productSettings, movements] },
    { label: "التجار والتسعير", items: [crm360, receivables360, customers, dormantCustomers, supplierPricing, supplierPrice, supplierForecast, supplierAlerts] },
    { label: "الإدارة", items: [intelligence360, flow360, compliance360, sourcing360, ...(isOwner ? [salesAnalytics, controlCenter] : []), supplierActivity, accounting, reconciliation, employees, payroll] },
  ];
}

type Viewer = {
  user: { name: string; email: string };
  membership: { role: string; permissions: Permission[] };
  business: {
    name: string; businessType: "RETAILER" | "SUPPLIER" | "BOTH";
    businessScale: "MICRO" | "SMALL" | "MEDIUM" | "ENTERPRISE";
    operatingModel: "FOOD_TRUCK" | "SHOP" | "RESTAURANT" | "WHOLESALE" | "SERVICES" | "MANUFACTURING" | "LOGISTICS" | "MIXED";
    workspaceModules: string[];
  };
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const sideNavRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [tradeMode, setTradeMode] = useState<TradeMode>("retailer");
  const publicPage = pathname === "/login" || pathname === "/register" || pathname.startsWith("/supplier/order/");

  const navigation = useMemo(() => {
    if (!viewer) return {
      sections: [] as NavSection[],
      directItems: [] as NavItem[],
      homeItem: null as NavItem | null,
      homeHref: "/",
      allowedHrefs: undefined as string[] | undefined,
      quick: null as NavItem | null,
      mode: "retailer" as TradeMode,
    };

    const businessType = viewer.business.businessType;
    const isOwner = viewer.membership.role === "OWNER";
    const permissions = new Set(viewer.membership.permissions ?? []);
    const enabled = new Set(resolveWorkspaceModules(
      viewer.business.businessScale, viewer.business.operatingModel, viewer.business.workspaceModules,
    ));

    // Every non-owner uses a role-specific, intentionally limited workspace.
    // This is UI policy; the server/individual APIs must check permissions too.
    if (!isOwner) {
      const allowedPermissions = new Set(effectivePermissions({
        role: viewer.membership.role as "MANAGER" | "ACCOUNTANT" | "CASHIER" | "SUPPLIER" | "STAFF",
        permissions: viewer.membership.permissions ?? [],
      }));
      const role = viewer.membership.role;
      const homeHref = roleLandingHref({
        role: role as "MANAGER" | "ACCOUNTANT" | "CASHIER" | "SUPPLIER" | "STAFF",
        permissions: viewer.membership.permissions ?? [],
      });
      const permitted: NavItem[] = [];
      if (role === "MANAGER") permitted.push(roleWorkbench);
      if (role === "ACCOUNTANT" || role === "MANAGER" || (role === "STAFF" && allowedPermissions.has("ACCOUNTING")))
        permitted.push(financeWorkbench);
      if (role === "STAFF" && allowedPermissions.size > 1) permitted.push(roleWorkbench);
      if (allowedPermissions.has("CASHIER")) permitted.push(sales);
      if (allowedPermissions.has("CASHIER") && role !== "STAFF") permitted.push(shifts);
      if (allowedPermissions.has("INVENTORY")) {
        if (role === "STAFF") permitted.push(staffInventory);
        else if (role === "SUPPLIER") permitted.push(sellerProducts, supplierPicking, stockUpdate, stockCount);
        else permitted.push(inventory, inventoryAudit, receiving, returns, locations, movements);
      }
      if (allowedPermissions.has("PURCHASES")) {
        permitted.push(orders);
        if (role === "MANAGER") permitted.push(purchases, purchaseApprovals, sourcing360);
      }
      if (allowedPermissions.has("ACCOUNTING")) permitted.push(accounting, reconciliation);
      if (role === "ACCOUNTANT") permitted.push(financeLedger, receivables360);
      if (role === "MANAGER") permitted.push(
        crm360, receivables360, flow360, intelligence360, compliance360, salesAnalytics,
      );
      if (role === "SUPPLIER") permitted.push(sellerOrders, supplierActivity);
      permitted.push(workspaceSetup, accountSecurity);
      const all = [...new Map(permitted.map((item) => [cleanHref(item.href), item])).values()];
      return {
        sections: [{ label: "مساحة العمل", items: all }],
        directItems: [] as NavItem[],
        homeItem: null,
        homeHref,
        allowedHrefs: Array.from(new Set([homeHref, ...all.map((item) => cleanHref(item.href))])),
        quick: all.find((item) => item.href === homeHref) ?? all[0] ?? null,
        mode: tradeMode,
      };
    }

    const effectiveMode: TradeMode = businessType === "SUPPLIER" ? "supplier" : businessType === "RETAILER" ? "retailer" : tradeMode;
    const homeHref = businessType === "BOTH" && effectiveMode === "supplier" ? "/?mode=supplier" : "/";
    const homeItem = { ...home, href: homeHref };
    const ownerRetailer = isOwner && effectiveMode === "retailer";
    const directItems: NavItem[] = ownerRetailer ? [
      ...(enabled.has("SALES") ? [sales] : []),
      ...(enabled.has("INVENTORY") ? [inventory, productsHub] : []),
      ...(enabled.has("MARKETPLACE") ? [market] : []),
      ...(enabled.has("CRM") ? [crm360] : []),
      ...(enabled.has("FLOW") ? [flow360] : []),
      ...(enabled.has("SOURCING") ? [sourcing360] : []),
      managementHub,
    ] : [];
    const sourceSections = effectiveMode === "supplier" ? supplierSections(isOwner) : retailerSections();
    // Adaptive menus are presentation preferences only; API authorization remains membership-based.
    const hidden = (href: string) => {
      const path = cleanHref(href);
      if (path.startsWith("/crm")) return !enabled.has("CRM") ||
        !["OWNER", "MANAGER", "ACCOUNTANT"].includes(viewer.membership.role);
      if (path === "/flow") return !enabled.has("FLOW") ||
        !["OWNER", "MANAGER", "ACCOUNTANT"].includes(viewer.membership.role);
      if (path === "/sourcing") return !enabled.has("SOURCING") ||
        !["OWNER", "MANAGER"].includes(viewer.membership.role);
      if (path === "/compliance") return !enabled.has("COMPLIANCE") ||
        !["OWNER", "MANAGER", "ACCOUNTANT"].includes(viewer.membership.role);
      if (path === "/intelligence") return !enabled.has("INSIGHTS") ||
        !["OWNER", "MANAGER", "ACCOUNTANT"].includes(viewer.membership.role);
      if (path.startsWith("/sales")) return !enabled.has("SALES");
      if (path.startsWith("/inventory")) return !enabled.has("INVENTORY");
      if (path.startsWith("/marketplace")) return !enabled.has("MARKETPLACE");
      if (path.startsWith("/purchases") || path === "/smart-buy" || path === "/reorder") return !enabled.has("PURCHASING");
      if (path.startsWith("/employees") || path.startsWith("/payroll")) return !enabled.has("STAFF");
      if (path.startsWith("/accounting")) return !enabled.has("ACCOUNTING");
      if (path === "/alerts" || path === "/smart-alerts" || path.startsWith("/control-center")) return !enabled.has("INSIGHTS");
      return false;
    };
    const sections = ownerRetailer ? [] : sourceSections.map((section) => ({
      ...section, items: section.items.filter((item) => !hidden(item.href)),
    })).filter((section) => section.items.length > 0);

    return {
      sections,
      directItems,
      homeItem,
      homeHref,
      allowedHrefs: undefined,
      quick: effectiveMode === "supplier" ? sellerProducts : market,
      mode: effectiveMode,
    };
  }, [viewer, tradeMode]);

  const businessType = viewer?.business.businessType ?? "RETAILER";
  const isStaff = Boolean(viewer && viewer.membership.role !== "OWNER");
  const canSwitchMode = businessType === "BOTH" && !isStaff;

  useEffect(() => {
    if (publicPage) return;
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!active || !data) return;
        setViewer(data);
        if (data.business?.businessType === "BOTH") {
          const saved = window.localStorage.getItem("tijra-trade-mode");
          const mode = saved === "supplier" ? "supplier" : "retailer";
          setTradeMode(mode);
          if (data.membership?.role !== "STAFF" && mode === "supplier" && pathname === "/" && !window.location.search.includes("mode=supplier")) {
            router.replace("/?mode=supplier");
          }
        } else if (data.business?.businessType === "SUPPLIER") {
          setTradeMode("supplier");
        } else {
          setTradeMode("retailer");
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [publicPage, pathname, router]);

  useEffect(() => {
    if (!viewer || viewer.membership.role === "OWNER" || publicPage) return;
    const allowed = navigation.allowedHrefs ?? [];
    if (pathname === "/" || !allowed.includes(pathname)) router.replace(navigation.homeHref);
  }, [viewer, publicPage, pathname, router, navigation.allowedHrefs, navigation.homeHref]);

  useEffect(() => {
    if (!open || publicPage || isStaff || !window.matchMedia("(max-width: 1100px)").matches) return;
    const scrollY = window.scrollY;
    const htmlOverflow = document.documentElement.style.overflow;
    const bodyPosition = document.body.style.position;
    const bodyTop = document.body.style.top;
    const bodyLeft = document.body.style.left;
    const bodyRight = document.body.style.right;
    const bodyWidth = document.body.style.width;

    document.documentElement.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";

    return () => {
      document.documentElement.style.overflow = htmlOverflow;
      document.body.style.position = bodyPosition;
      document.body.style.top = bodyTop;
      document.body.style.left = bodyLeft;
      document.body.style.right = bodyRight;
      document.body.style.width = bodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, [open, publicPage, isStaff]);

  function chooseMode(mode: TradeMode) {
    setTradeMode(mode);
    window.localStorage.setItem("tijra-trade-mode", mode);
    router.push(mode === "supplier" ? "/?mode=supplier" : "/?mode=retailer");
  }

  function handleSectionOpen(opened: HTMLDetailsElement) {
    const nav = sideNavRef.current;
    if (!nav) return;
    nav.querySelectorAll<HTMLDetailsElement>("details.navSection[open]").forEach((section) => {
      if (section !== opened) section.open = false;
    });
    requestAnimationFrame(() => {
      const navRect = nav.getBoundingClientRect();
      const sectionRect = opened.getBoundingClientRect();
      const targetTop = Math.max(0, nav.scrollTop + sectionRect.top - navRect.top - 8);
      nav.scrollTo({ top: targetTop, behavior: "smooth" });
    });
  }

  useEffect(() => {
    if (publicPage || isStaff) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [publicPage, isStaff]);

  useEffect(() => {
    setOpen(false);
    setCommandOpen(false);
  }, [pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  if (publicPage) return <>{children}</>;

  if (!viewer) {
    return <div className="staffLoadingShell"><TijraLogo compact size={46} /><span>جاري فتح تِجرا...</span></div>;
  }

  if (isStaff) {
    const tasks = navigation.sections.flatMap((section) => section.items).slice(0, 10);
    const allowed = navigation.allowedHrefs ?? [];
    const pathAllowed = allowed.includes(pathname);
    return (
      <div className="staffFrame">
        <header className="staffTopbar">
          <Link href={navigation.homeHref} className="brand brandCompact" aria-label="تِجرا"><TijraLogo compact size={42} /></Link>
          <div className="staffIdentity"><span>{viewer.business.name}</span><strong>{viewer.user.name}</strong></div>
          <button type="button" className="staffLogout" onClick={logout} aria-label="تسجيل الخروج"><LogOut size={18} /></button>
        </header>
        {tasks.length > 1 ? <nav className="staffTaskNav" aria-label="مهام الموظف">{tasks.map(({ href, label, icon: Icon }) => <Link key={`${href}-${label}`} href={href} className={pathname === cleanHref(href) ? "active" : ""}><Icon size={18} /><span>{label}</span></Link>)}</nav> : null}
        <main className="staffContent">{pathAllowed ? children : <div className="staffRedirecting"><span>جاري فتح مهمتك...</span></div>}</main>
      </div>
    );
  }

  const quickLabel = navigation.quick?.href === "/sales" ? "فتح الكاشير" : navigation.quick?.href === "/inventory" ? "فتح المخزون" : navigation.quick?.href === "/accounting" ? "فتح التقارير" : navigation.mode === "supplier" ? "إضافة منتج" : "فتح السوق";
  const QuickIcon = navigation.quick?.icon ?? ShoppingBag;
  const alertsHref = navigation.mode === "supplier" ? "/supplier/alerts" : "/smart-alerts";
  const directOwnerNav = navigation.directItems.length > 0;

  return (
    <div className={`appFrame role-${navigation.mode}`}>
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} allowedHrefs={navigation.allowedHrefs} />
      <button type="button" className={`sidebarBackdrop ${open ? "show" : ""}`} aria-label="إغلاق القائمة" onClick={() => setOpen(false)} />

      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebarTop">
          <Link href={navigation.homeHref} className="brand" aria-label="تِجرا"><TijraLogo size={54} /></Link>
          <button type="button" className="iconButton sidebarClose" onClick={() => setOpen(false)} aria-label="إغلاق القائمة"><X size={20} /></button>
        </div>

        {canSwitchMode ? (
          <div className="tradeModeSwitch" aria-label="تبديل وضع الحساب">
            <button type="button" className={tradeMode === "retailer" ? "active" : ""} onClick={() => chooseMode("retailer")}><ShoppingBag size={15} /> وضع التاجر</button>
            <button type="button" className={tradeMode === "supplier" ? "active" : ""} onClick={() => chooseMode("supplier")}><Store size={15} /> وضع المورد</button>
            <Link href="/management/workspace" className="button secondary" aria-label="اختيار الشركة">الشركات</Link>
          </div>
        ) : (
          <Link href="/management/workspace" className="workspaceSwitcher staticWorkspace" aria-label="اختيار الشركة ومساحة العمل">
            <div className="workspaceIcon"><Store size={17} /></div>
            <div><span>{businessTypeLabels[viewer.business.businessType]}</span><strong>{viewer.business.name}</strong></div>
            <ChevronDown size={15} />
          </Link>
        )}

        <nav ref={sideNavRef} className={`sideNav compactSideNav ${directOwnerNav ? "ownerDirectNav" : ""}`} aria-label="التنقل الرئيسي">
          {navigation.homeItem ? <div className="navHomeItem"><NavLink {...navigation.homeItem} pathname={pathname} onClick={() => setOpen(false)} /></div> : null}
          {directOwnerNav
            ? navigation.directItems.map((item) => <NavLink key={`${item.href}-${item.label}`} {...item} pathname={pathname} onClick={() => setOpen(false)} />)
            : navigation.sections.map((section) => <NavSectionBlock key={section.label} section={section} pathname={pathname} onNavigate={() => setOpen(false)} onOpen={handleSectionOpen} />)}
        </nav>

        <div className="sidebarInsight">
          <div className="sidebarInsightIcon"><PackageCheck size={18} /></div>
          <div>
            <strong>{navigation.mode === "supplier" ? "مخزون واحد لكل قنوات البيع" : "تِجرا يساعدك في القرار"}</strong>
            <span>{navigation.mode === "supplier" ? "السوق والكاشير والبيع الخارجي والطلبات تعمل على نفس حركة المخزون." : "السوق والكاشير والمخزون والموردين والرقابة في نظام واحد."}</span>
          </div>
        </div>

        <div className="accountBlock">
          <div className="avatar"><CircleUserRound size={19} /></div>
          <div><strong>{viewer.user.name}</strong><span>{roleLabels[viewer.membership.role] ?? viewer.user.email}</span></div>
          <button type="button" className="iconButton logoutButton" onClick={logout} aria-label="تسجيل الخروج" title="تسجيل الخروج"><LogOut size={16} /></button>
        </div>
      </aside>

      <div className="appMain">
        <header className="appTopbar">
          <div className="mobileBrand">
            <button type="button" className="iconButton" onClick={() => setOpen(true)} aria-label="فتح القائمة"><Menu size={21} /></button>
            <Link href={navigation.homeHref} className="brand brandCompact"><TijraLogo compact size={42} /></Link>
          </div>
          <button type="button" className="searchTrigger" onClick={() => setCommandOpen(true)} aria-label="فتح البحث السريع">
            <Search size={17} /><span>{navigation.mode === "supplier" ? "ابحث عن منتج، طلب أو مخزون..." : "ابحث عن منتج، مورد أو طلب..."}</span><kbd>⌘ K</kbd>
          </button>
          <div className="topActions">
            {canSwitchMode && <span className="modePill">{navigation.mode === "supplier" ? "وضع المورد" : "وضع التاجر"}</span>}
            <Link className="iconButton notificationButton" href={alertsHref} aria-label="التنبيهات"><Bell size={18} /><span className="notificationDot" /></Link>
            {navigation.quick ? <Link className="quickSale" href={navigation.quick.href}><QuickIcon size={17} /><span>{quickLabel}</span></Link> : null}
          </div>
        </header>

        <main className="pageContent">{children}</main>
      </div>
    </div>
  );
}
