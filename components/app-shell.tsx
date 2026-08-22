"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Boxes,
  Calculator,
  ChevronDown,
  CircleUserRound,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageCheck,
  ScanBarcode,
  Search,
  ShoppingBag,
  ShoppingBasket,
  ShoppingCart,
  Store,
  Tags,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CommandPalette } from "@/components/command-palette";
import { TijraLogo } from "@/components/tijra-logo";

type Permission = "CASHIER" | "INVENTORY" | "PURCHASES" | "ACCOUNTING";
type TradeMode = "retailer" | "supplier";
type NavItem = { href: string; label: string; icon: LucideIcon; badge?: string };

const home: NavItem = { href: "/", label: "الرئيسية", icon: LayoutDashboard };
const market: NavItem = { href: "/marketplace", label: "السوق", icon: ShoppingBag };
const orders: NavItem = { href: "/marketplace/orders", label: "طلباتي", icon: ClipboardList };
const smartPrice: NavItem = { href: "/alerts", label: "السعر الأذكى", icon: Tags };
const inventory: NavItem = { href: "/inventory", label: "المخزون", icon: Boxes };
const lockedInventory: NavItem = { ...inventory, badge: "قريبًا" };
const sales: NavItem = { href: "/sales", label: "الكاشير", icon: ShoppingCart };
const lockedSales: NavItem = { ...sales, badge: "قريبًا" };
const purchases: NavItem = { href: "/purchases", label: "المشتريات", icon: ShoppingBasket };
const suppliers: NavItem = { href: "/suppliers", label: "الموردون", icon: Store };
const sellerProducts: NavItem = { href: "/marketplace/seller", label: "المنتجات", icon: Store };
const sellerOrders: NavItem = { href: "/marketplace/seller#orders", label: "الطلبات الواردة", icon: ClipboardList };
const externalSale: NavItem = { href: "/marketplace/seller#external-sale", label: "البيع الخارجي السريع", icon: ScanBarcode };
const customers: NavItem = { href: "/marketplace/seller#customers", label: "التجار والعملاء", icon: UsersRound };
const accounting: NavItem = { href: "/accounting", label: "التقارير", icon: Calculator };
const employees: NavItem = { href: "/employees", label: "الموظفون", icon: UsersRound };
const payroll: NavItem = { href: "/payroll", label: "الرواتب", icon: WalletCards };

const retailerOperations: NavItem[] = [home, market, purchases, orders, suppliers, smartPrice, lockedInventory, lockedSales];
const retailerManagement: NavItem[] = [{ ...accounting, label: "الملخص المالي" }, employees, payroll];
const supplierOperations: NavItem[] = [home, sellerProducts, sellerOrders, externalSale, inventory, customers];
const supplierManagement: NavItem[] = [accounting, employees, payroll, smartPrice];

type Viewer = {
  user: { name: string; email: string };
  membership: { role: string; permissions: Permission[] };
  business: { name: string; businessType: "RETAILER" | "SUPPLIER" | "BOTH" };
};

function NavLink({ href, label, icon: Icon, badge, pathname, onClick }: NavItem & { pathname: string; onClick?: () => void }) {
  const cleanHref = href.split("#")[0].split("?")[0];
  const hasHash = href.includes("#");
  const active = !hasHash && (cleanHref === "/" ? pathname === "/" : cleanHref === "/marketplace/seller" ? pathname === cleanHref : pathname.startsWith(cleanHref));
  return (
    <Link className={`navItem ${active ? "active" : ""} ${badge ? "lockedNavItem" : ""}`} href={href} onClick={onClick}>
      <span className="navIcon"><Icon size={18} strokeWidth={1.8} /></span>
      <span>{label}</span>
      {badge ? <span className="navBadge">{badge}</span> : null}
    </Link>
  );
}

const roleLabels: Record<string, string> = {
  OWNER: "مالك المنشأة",
  MANAGER: "مدير",
  CASHIER: "كاشير",
  ACCOUNTANT: "محاسب",
  SUPPLIER: "مورد",
  STAFF: "موظف",
};

const businessTypeLabels = { RETAILER: "تاجر تجزئة", SUPPLIER: "مورد", BOTH: "مورد وتاجر" } as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [tradeMode, setTradeMode] = useState<TradeMode>("retailer");
  const publicPage = pathname === "/login" || pathname === "/register" || pathname.startsWith("/supplier/order/");

  const navigation = useMemo(() => {
    if (!viewer) return { operations: [] as NavItem[], management: [] as NavItem[], mobile: [] as NavItem[], homeHref: "/", allowedHrefs: undefined as string[] | undefined, quick: null as NavItem | null, mode: "retailer" as TradeMode };

    const businessType = viewer.business.businessType;
    const isStaff = viewer.membership.role === "STAFF";
    const permissions = new Set(viewer.membership.permissions ?? []);

    if (isStaff) {
      const operations: NavItem[] = [];
      const management: NavItem[] = [];
      if (permissions.has("CASHIER")) operations.push(sales);
      if (permissions.has("INVENTORY")) operations.push(inventory);
      if (permissions.has("PURCHASES")) operations.push(market, orders, purchases);
      if (permissions.has("ACCOUNTING")) management.push(accounting);
      const all = [...operations, ...management];
      const preferred = permissions.has("CASHIER") ? sales : permissions.has("INVENTORY") ? inventory : permissions.has("PURCHASES") ? market : permissions.has("ACCOUNTING") ? accounting : null;
      return {
        operations,
        management,
        mobile: all.slice(0, 5),
        homeHref: preferred?.href ?? "/no-access",
        allowedHrefs: Array.from(new Set(all.map((item) => item.href.split("#")[0]))),
        quick: preferred,
        mode: tradeMode,
      };
    }

    const effectiveMode: TradeMode = businessType === "SUPPLIER" ? "supplier" : businessType === "RETAILER" ? "retailer" : tradeMode;
    const homeHref = businessType === "BOTH" && effectiveMode === "supplier" ? "/?mode=supplier" : "/";
    const modeHome: NavItem = { ...home, href: homeHref };
    const sourceOperations = effectiveMode === "supplier" ? supplierOperations : retailerOperations;
    const operations = sourceOperations.map((item) => item.href === "/" ? modeHome : item);
    const management = effectiveMode === "supplier" ? supplierManagement : retailerManagement;
    const mobile = effectiveMode === "supplier"
      ? [modeHome, sellerProducts, sellerOrders, inventory, accounting]
      : [modeHome, market, orders, smartPrice, lockedInventory];

    return {
      operations,
      management,
      mobile,
      homeHref,
      allowedHrefs: undefined,
      quick: effectiveMode === "supplier" ? sellerProducts : market,
      mode: effectiveMode,
    };
  }, [viewer, tradeMode]);

  const businessType = viewer?.business.businessType ?? "RETAILER";
  const isStaff = viewer?.membership.role === "STAFF";
  const staffCanPurchase = viewer?.membership.permissions?.includes("PURCHASES") ?? false;
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
          if (mode === "supplier" && pathname === "/" && !window.location.search.includes("mode=supplier")) {
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

  function chooseMode(mode: TradeMode) {
    setTradeMode(mode);
    window.localStorage.setItem("tijra-trade-mode", mode);
    router.push(mode === "supplier" ? "/?mode=supplier" : "/?mode=retailer");
  }

  useEffect(() => {
    if (publicPage) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [publicPage]);

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

  const quickLabel = navigation.quick?.href === "/sales" ? "فتح الكاشير" : navigation.quick?.href === "/inventory" ? "فتح المخزون" : navigation.quick?.href === "/accounting" ? "فتح التقارير" : navigation.mode === "supplier" ? "إضافة منتج" : "فتح السوق";
  const QuickIcon = navigation.quick?.icon ?? ShoppingBag;

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
          </div>
        ) : (
          <div className="workspaceSwitcher staticWorkspace">
            <div className="workspaceIcon"><Store size={17} /></div>
            <div><span>{viewer ? (isStaff ? "حساب موظف" : businessTypeLabels[viewer.business.businessType]) : "نوع الحساب"}</span><strong>{viewer?.business.name ?? "جاري التحميل..."}</strong></div>
            <ChevronDown size={15} />
          </div>
        )}

        <nav className="sideNav" aria-label="التنقل الرئيسي">
          {navigation.operations.length ? <div className="navGroup">
            <span className="navGroupLabel">{isStaff ? "صلاحيات العمل" : navigation.mode === "supplier" ? "إدارة البيع" : "الشراء والتوريد"}</span>
            {navigation.operations.map((item) => <NavLink key={`${item.href}-${item.label}`} {...item} pathname={pathname} onClick={() => setOpen(false)} />)}
          </div> : null}
          {navigation.management.length ? <div className="navGroup">
            <span className="navGroupLabel">الإدارة</span>
            {navigation.management.map((item) => <NavLink key={`${item.href}-${item.label}`} {...item} pathname={pathname} onClick={() => setOpen(false)} />)}
          </div> : null}
        </nav>

        <div className="sidebarInsight">
          <div className="sidebarInsightIcon"><PackageCheck size={18} /></div>
          <div>
            <strong>{isStaff ? "دخول حسب صلاحياتك" : navigation.mode === "supplier" ? "مخزونك متصل بالسوق" : "تسوق بذكاء"}</strong>
            <span>{isStaff ? "يعرض تِجرا فقط الأقسام المسموحة لهذا الحساب." : navigation.mode === "supplier" ? "حدّث منتجاتك ومخزونك وسجّل البيع الخارجي من الجوال." : "قارن الموردين والأسعار واطلب من داخل مدينتك أو من كل المدن."}</span>
          </div>
        </div>

        <div className="accountBlock">
          <div className="avatar"><CircleUserRound size={19} /></div>
          <div><strong>{viewer?.user.name ?? "حساب تِجرا"}</strong><span>{roleLabels[viewer?.membership.role ?? ""] ?? viewer?.user.email ?? ""}</span></div>
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
            <Search size={17} /><span>{isStaff ? "ابحث داخل صلاحياتك..." : navigation.mode === "supplier" ? "ابحث عن منتج، طلب أو مخزون..." : "ابحث عن منتج، مورد أو طلب..."}</span><kbd>⌘ K</kbd>
          </button>
          <div className="topActions">
            {canSwitchMode && <span className="modePill">{navigation.mode === "supplier" ? "وضع المورد" : "وضع التاجر"}</span>}
            {(!isStaff || staffCanPurchase) ? <Link className="iconButton notificationButton" href="/alerts" aria-label="التنبيهات"><Bell size={18} /><span className="notificationDot" /></Link> : null}
            {navigation.quick ? <Link className="quickSale" href={navigation.quick.href}><QuickIcon size={17} /><span>{quickLabel}</span></Link> : null}
          </div>
        </header>

        <main className="pageContent">{children}</main>

        {navigation.mobile.length ? <nav className="mobileBottomNav" aria-label="التنقل على الجوال">
          {navigation.mobile.map(({ href, label, icon: Icon, badge }) => {
            const cleanHref = href.split("#")[0].split("?")[0];
            const active = cleanHref === "/" ? pathname === "/" : pathname.startsWith(cleanHref);
            return <Link key={`${href}-${label}`} className={active ? "active" : ""} href={href}>{badge ? <span className="navSoonDot" /> : null}<Icon size={19} /><span>{label}</span></Link>;
          })}
        </nav> : null}
      </div>
    </div>
  );
}
