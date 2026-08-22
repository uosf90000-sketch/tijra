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
import { useEffect, useState } from "react";
import { CommandPalette } from "@/components/command-palette";
import { TijraLogo } from "@/components/tijra-logo";

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

const retailerOperations: NavItem[] = [home, market, orders, smartPrice, purchases, lockedInventory, lockedSales];
const supplierOperations: NavItem[] = [home, seller, market, inventory];
const bothOperations: NavItem[] = [home, market, seller, orders, smartPrice, inventory, sales, purchases];

const retailerManagement: NavItem[] = [
  { href: "/accounting", label: "الملخص المالي", icon: Calculator },
  { href: "/employees", label: "الموظفون", icon: UsersRound },
  { href: "/payroll", label: "الرواتب", icon: WalletCards },
];
const fullManagement: NavItem[] = [
  { href: "/accounting", label: "المحاسبة", icon: Calculator },
  { href: "/employees", label: "الموظفون", icon: UsersRound },
  { href: "/payroll", label: "الرواتب", icon: WalletCards },
];

type Viewer = {
  user: { name: string; email: string };
  membership: { role: string };
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
};

const businessTypeLabels = { RETAILER: "تاجر تجزئة", SUPPLIER: "مورد", BOTH: "مورد وتاجر" } as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const publicPage = pathname === "/login" || pathname === "/register" || pathname.startsWith("/supplier/order/");
  const businessType = viewer?.business.businessType ?? "RETAILER";
  const canSell = businessType === "SUPPLIER" || businessType === "BOTH";
  const retailerOnly = businessType === "RETAILER";
  const operationItems = businessType === "SUPPLIER" ? supplierOperations : businessType === "BOTH" ? bothOperations : retailerOperations;
  const managementItems = retailerOnly ? retailerManagement : fullManagement;
  const mobileItems: NavItem[] = businessType === "SUPPLIER"
    ? [home, seller, market, inventory, fullManagement[0]]
    : businessType === "BOTH"
      ? [home, market, seller, inventory, fullManagement[0]]
      : [home, market, orders, smartPrice, retailerManagement[0]];

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

  return (
    <div className="appFrame">
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
      <button type="button" className={`sidebarBackdrop ${open ? "show" : ""}`} aria-label="إغلاق القائمة" onClick={() => setOpen(false)} />

      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebarTop">
          <Link href="/" className="brand" aria-label="تِجرا - الرئيسية"><TijraLogo inverse size={52} /></Link>
          <button type="button" className="iconButton sidebarClose" onClick={() => setOpen(false)} aria-label="إغلاق القائمة"><X size={20} /></button>
        </div>

        <button type="button" className="workspaceSwitcher">
          <div className="workspaceIcon"><Store size={17} /></div>
          <div><span>{viewer ? businessTypeLabels[viewer.business.businessType] : "نوع الحساب"}</span><strong>{viewer?.business.name ?? "جاري التحميل..."}</strong></div>
          <ChevronDown size={15} />
        </button>

        <nav className="sideNav" aria-label="التنقل الرئيسي">
          <div className="navGroup">
            <span className="navGroupLabel">{retailerOnly ? "الشراء والتوريد" : "التجارة"}</span>
            {operationItems.map((item) => <NavLink key={`${item.href}-${item.label}`} {...item} pathname={pathname} onClick={() => setOpen(false)} />)}
          </div>
          <div className="navGroup">
            <span className="navGroupLabel">الإدارة</span>
            {managementItems.map((item) => <NavLink key={item.href} {...item} pathname={pathname} onClick={() => setOpen(false)} />)}
          </div>
        </nav>

        <div className="sidebarInsight">
          <div className="sidebarInsightIcon"><PackageCheck size={18} /></div>
          <div>
            <strong>{canSell ? "مخزونك متصل بالسوق" : "ركّز على الشراء الأذكى"}</strong>
            <span>{canSell ? "امسح الباركود بالجوال وحدّث السعر والكمية للتجار." : "السوق والمقارنة والطلبات تعمل الآن، والجرد والكاشير نجهزها مع قارئ باركود مناسب."}</span>
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
            <Link href="/" className="brand brandCompact"><TijraLogo compact size={42} /></Link>
          </div>
          <button type="button" className="searchTrigger" onClick={() => setCommandOpen(true)} aria-label="فتح البحث السريع">
            <Search size={17} /><span>{retailerOnly ? "ابحث عن منتج، مورد أو طلب..." : "ابحث عن منتج، طلب أو مخزون..."}</span><kbd>⌘ K</kbd>
          </button>
          <div className="topActions">
            <span className="syncStatus"><span className="syncDot" /> متزامن</span>
            <Link className="iconButton notificationButton" href="/alerts" aria-label="تنبيهات السعر الأذكى" title="تنبيهات السعر الأذكى"><Bell size={18} /><span className="notificationDot" /></Link>
            {canSell
              ? <Link className="quickSale" href="/marketplace/seller"><Store size={17} /><span>إضافة بضاعة</span></Link>
              : <Link className="quickSale" href="/marketplace"><ShoppingBag size={17} /><span>تسوق الآن</span></Link>}
          </div>
        </header>

        <main className="pageContent">{children}</main>

        <nav className="mobileBottomNav" aria-label="التنقل على الجوال">
          {mobileItems.map(({ href, label, icon: Icon, badge }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return <Link key={`${href}-${label}`} className={active ? "active" : ""} href={href}>{badge ? <span className="navSoonDot" /> : null}<Icon size={19} /><span>{label}</span></Link>;
          })}
        </nav>
      </div>
    </div>
  );
}
