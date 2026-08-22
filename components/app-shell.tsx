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
type NavItem = { href: string; label: string; icon: LucideIcon; badge?: string };

const home: NavItem = { href: "/", label: "الرئيسية", icon: LayoutDashboard };
const market: NavItem = { href: "/marketplace", label: "السوق", icon: ShoppingBag };
const orders: NavItem = { href: "/marketplace/orders", label: "طلباتي", icon: ClipboardList };
const smartPrice: NavItem = { href: "/alerts", label: "السعر الأذكى", icon: Tags };
const inventory: NavItem = { href: "/inventory", label: "الجرد", icon: Boxes };
const lockedInventory: NavItem = { ...inventory, badge: "قريبًا" };
const sales: NavItem = { href: "/sales", label: "الكاشير", icon: ShoppingCart };
const lockedSales: NavItem = { ...sales, badge: "قريبًا" };
const purchases: NavItem = { href: "/purchases", label: "المشتريات", icon: ShoppingBasket };
const seller: NavItem = { href: "/marketplace/seller", label: "لوحة المورد", icon: Store };
const accounting: NavItem = { href: "/accounting", label: "المحاسبة", icon: Calculator };
const employees: NavItem = { href: "/employees", label: "الموظفون", icon: UsersRound };
const payroll: NavItem = { href: "/payroll", label: "الرواتب", icon: WalletCards };

const retailerOperations: NavItem[] = [home, market, orders, smartPrice, purchases, lockedInventory, lockedSales];
const supplierOperations: NavItem[] = [home, seller, market, inventory];
const bothOperations: NavItem[] = [home, market, seller, orders, smartPrice, inventory, sales, purchases];
const retailerManagement: NavItem[] = [{ ...accounting, label: "الملخص المالي" }, employees, payroll];
const fullManagement: NavItem[] = [accounting, employees, payroll];

type Viewer = {
  user: { name: string; email: string };
  membership: { role: string; permissions: Permission[] };
  business: { name: string; businessType: "RETAILER" | "SUPPLIER" | "BOTH" };
};

function NavLink({ href, label, icon: Icon, badge, pathname, onClick }: NavItem & { pathname: string; onClick?: () => void }) {
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link className={`navItem ${active ? "active" : ""}`} href={href} onClick={onClick}>
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
  const publicPage = pathname === "/login" || pathname === "/register" || pathname.startsWith("/supplier/order/");

  const navigation = useMemo(() => {
    if (!viewer) return { operations: [] as NavItem[], management: [] as NavItem[], mobile: [] as NavItem[], homeHref: "/", allowedHrefs: undefined as string[] | undefined, quick: null as NavItem | null };

    const businessType = viewer.business.businessType;
    const canSell = businessType === "SUPPLIER" || businessType === "BOTH";
    const isStaff = viewer.membership.role === "STAFF";
    const permissions = new Set(viewer.membership.permissions ?? []);

    if (isStaff) {
      const operations: NavItem[] = [];
      const management: NavItem[] = [];
      if (permissions.has("CASHIER")) operations.push(sales);
      if (permissions.has("INVENTORY")) {
        operations.push(inventory);
        if (canSell) operations.push(seller);
      }
      if (permissions.has("PURCHASES")) operations.push(market, orders, smartPrice, purchases);
      if (permissions.has("ACCOUNTING")) management.push(accounting);

      const all = [...operations, ...management];
      const preferred = permissions.has("CASHIER") ? sales : permissions.has("INVENTORY") ? inventory : permissions.has("PURCHASES") ? market : permissions.has("ACCOUNTING") ? accounting : null;
      const homeHref = preferred?.href ?? "/no-access";
      return {
        operations,
        management,
        mobile: all.slice(0, 5),
        homeHref,
        allowedHrefs: Array.from(new Set(all.map((item) => item.href))),
        quick: preferred,
      };
    }

    const retailerOnly = businessType === "RETAILER";
    const operations = businessType === "SUPPLIER" ? supplierOperations : businessType === "BOTH" ? bothOperations : retailerOperations;
    const management = retailerOnly ? retailerManagement : fullManagement;
    const mobile = businessType === "SUPPLIER"
      ? [home, seller, market, inventory, accounting]
      : businessType === "BOTH"
        ? [home, market, seller, inventory, accounting]
        : [home, market, orders, smartPrice, retailerManagement[0]];
    return { operations, management, mobile, homeHref: "/", allowedHrefs: undefined, quick: canSell ? seller : market };
  }, [viewer]);

  const businessType = viewer?.business.businessType ?? "RETAILER";
  const canSell = businessType === "SUPPLIER" || businessType === "BOTH";
  const retailerOnly = businessType === "RETAILER";
  const isStaff = viewer?.membership.role === "STAFF";
  const staffCanPurchase = viewer?.membership.permissions?.includes("PURCHASES") ?? false;

  useEffect(() => {
    if (publicPage) return;
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (active && data) setViewer(data); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [publicPage]);

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

  const quickLabel = navigation.quick?.href === "/sales" ? "فتح الكاشير" : navigation.quick?.href === "/inventory" ? "فتح المخزون" : navigation.quick?.href === "/accounting" ? "فتح المحاسبة" : navigation.quick?.href === "/marketplace/seller" ? "إضافة بضاعة" : "فتح السوق";
  const QuickIcon = navigation.quick?.icon ?? ShoppingBag;

  return (
    <div className="appFrame">
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} allowedHrefs={navigation.allowedHrefs} />
      <button type="button" className={`sidebarBackdrop ${open ? "show" : ""}`} aria-label="إغلاق القائمة" onClick={() => setOpen(false)} />

      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebarTop">
          <Link href={navigation.homeHref} className="brand" aria-label="تِجرا"><TijraLogo inverse size={52} /></Link>
          <button type="button" className="iconButton sidebarClose" onClick={() => setOpen(false)} aria-label="إغلاق القائمة"><X size={20} /></button>
        </div>

        <button type="button" className="workspaceSwitcher">
          <div className="workspaceIcon"><Store size={17} /></div>
          <div><span>{viewer ? (isStaff ? "حساب موظف" : businessTypeLabels[viewer.business.businessType]) : "نوع الحساب"}</span><strong>{viewer?.business.name ?? "جاري التحميل..."}</strong></div>
          <ChevronDown size={15} />
        </button>

        <nav className="sideNav" aria-label="التنقل الرئيسي">
          {navigation.operations.length ? <div className="navGroup">
            <span className="navGroupLabel">{isStaff ? "صلاحيات العمل" : retailerOnly ? "الشراء والتوريد" : "التجارة"}</span>
            {navigation.operations.map((item) => <NavLink key={`${item.href}-${item.label}`} {...item} pathname={pathname} onClick={() => setOpen(false)} />)}
          </div> : null}
          {navigation.management.length ? <div className="navGroup">
            <span className="navGroupLabel">الإدارة</span>
            {navigation.management.map((item) => <NavLink key={item.href} {...item} pathname={pathname} onClick={() => setOpen(false)} />)}
          </div> : null}
        </nav>

        <div className="sidebarInsight">
          <div className="sidebarInsightIcon"><PackageCheck size={18} /></div>
          <div>
            <strong>{isStaff ? "دخول حسب صلاحياتك" : canSell ? "مخزونك متصل بالسوق" : "ركّز على الشراء الأذكى"}</strong>
            <span>{isStaff ? "يعرض تِجرا فقط الأقسام التي فعّلها مالك المنشأة لهذا الحساب." : canSell ? "امسح الباركود بالجوال وحدّث السعر والكمية للتجار." : "السوق والمقارنة والطلبات تعمل الآن، والجرد والكاشير نجهزها مع قارئ باركود مناسب."}</span>
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
            <Search size={17} /><span>{isStaff ? "ابحث داخل صلاحياتك..." : retailerOnly ? "ابحث عن منتج، مورد أو طلب..." : "ابحث عن منتج، طلب أو مخزون..."}</span><kbd>⌘ K</kbd>
          </button>
          <div className="topActions">
            <span className="syncStatus"><span className="syncDot" /> متزامن</span>
            {(!isStaff || staffCanPurchase) ? <Link className="iconButton notificationButton" href="/alerts" aria-label="تنبيهات السعر الأذكى" title="تنبيهات السعر الأذكى"><Bell size={18} /><span className="notificationDot" /></Link> : null}
            {navigation.quick ? <Link className="quickSale" href={navigation.quick.href}><QuickIcon size={17} /><span>{quickLabel}</span></Link> : null}
          </div>
        </header>

        <main className="pageContent">{children}</main>

        {navigation.mobile.length ? <nav className="mobileBottomNav" aria-label="التنقل على الجوال">
          {navigation.mobile.map(({ href, label, icon: Icon, badge }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return <Link key={`${href}-${label}`} className={active ? "active" : ""} href={href}>{badge ? <span className="navSoonDot" /> : null}<Icon size={19} /><span>{label}</span></Link>;
          })}
        </nav> : null}
      </div>
    </div>
  );
}
