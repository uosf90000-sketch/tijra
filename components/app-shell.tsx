"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BadgeDollarSign,
  Bell,
  Boxes,
  Calculator,
  ChevronDown,
  CircleUserRound,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageCheck,
  Search,
  ShoppingBag,
  ShoppingBasket,
  ShoppingCart,
  Store,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { CommandPalette } from "@/components/command-palette";

const operations = [
  { href: "/", label: "الرئيسية", icon: LayoutDashboard },
  { href: "/marketplace", label: "سوق تِجرا", icon: ShoppingBag },
  { href: "/inventory", label: "المخزون", icon: Boxes },
  { href: "/sales", label: "المبيعات", icon: ShoppingCart },
  { href: "/purchases", label: "المشتريات", icon: ShoppingBasket },
];

const management = [
  { href: "/accounting", label: "المحاسبة", icon: Calculator },
  { href: "/employees", label: "الموظفون", icon: UsersRound },
  { href: "/payroll", label: "الرواتب", icon: WalletCards },
];

const mobileNav = [operations[0], operations[1], operations[2], management[0], management[2]];

type Viewer = {
  user: { name: string; email: string };
  membership: { role: string };
  business: { name: string; businessType: "RETAILER" | "SUPPLIER" | "BOTH" };
};

function NavLink({ href, label, icon: Icon, pathname, onClick }: {
  href: string;
  label: string;
  icon: LucideIcon;
  pathname: string;
  onClick?: () => void;
}) {
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link className={`navItem ${active ? "active" : ""}`} href={href} onClick={onClick}>
      <Icon size={19} strokeWidth={1.9} />
      <span>{label}</span>
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
  const canSell = viewer?.business.businessType === "SUPPLIER" || viewer?.business.businessType === "BOTH";

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
          <Link href="/" className="brand" aria-label="تِجرا - الرئيسية"><div className="brandMark">ت</div><div className="brandText"><strong>تِجرا</strong><span>سوق وتشغيل التجارة</span></div></Link>
          <button type="button" className="iconButton sidebarClose" onClick={() => setOpen(false)} aria-label="إغلاق القائمة"><X size={20} /></button>
        </div>
        <button type="button" className="workspaceSwitcher"><div className="workspaceIcon"><Store size={18} /></div><div><span>{viewer ? businessTypeLabels[viewer.business.businessType] : "المنشأة الحالية"}</span><strong>{viewer?.business.name ?? "جاري التحميل..."}</strong></div><ChevronDown size={16} /></button>
        <nav className="sideNav" aria-label="التنقل الرئيسي">
          <div className="navGroup"><span className="navGroupLabel">التشغيل</span>{operations.map((item) => <NavLink key={item.href} {...item} pathname={pathname} onClick={() => setOpen(false)} />)}{canSell && <NavLink href="/marketplace/seller" label="متجري كمورد" icon={Store} pathname={pathname} onClick={() => setOpen(false)} />}</div>
          <div className="navGroup"><span className="navGroupLabel">الإدارة</span>{management.map((item) => <NavLink key={item.href} {...item} pathname={pathname} onClick={() => setOpen(false)} />)}</div>
        </nav>
        <div className="sidebarInsight"><div className="sidebarInsightIcon"><PackageCheck size={18} /></div><strong>{canSell ? "متجرك متصل بالسوق" : "اشترِ بأفضل سعر"}</strong><span>{canSell ? "حدّث أسعارك ومخزونك ليشاهدها التجار فورًا." : "قارن عروض الموردين ثم أدخل مشترياتك مباشرة إلى التشغيل."}</span></div>
        <div className="accountBlock"><div className="avatar"><CircleUserRound size={20} /></div><div><strong>{viewer?.user.name ?? "حساب تِجرا"}</strong><span>{roleLabels[viewer?.membership.role ?? ""] ?? viewer?.user.email ?? ""}</span></div><button type="button" className="iconButton" onClick={logout} aria-label="تسجيل الخروج" title="تسجيل الخروج"><LogOut size={17} /></button></div>
      </aside>
      <div className="appMain">
        <header className="appTopbar">
          <div className="mobileBrand"><button type="button" className="iconButton" onClick={() => setOpen(true)} aria-label="فتح القائمة"><Menu size={21} /></button><Link href="/" className="brand brandCompact"><div className="brandMark">ت</div><strong>تِجرا</strong></Link></div>
          <button type="button" className="searchTrigger" onClick={() => setCommandOpen(true)} aria-label="فتح البحث السريع"><Search size={18} /><span>ابحث في السوق، المخزون أو الموردين...</span><kbd>⌘ K</kbd></button>
          <div className="topActions"><span className="syncStatus"><span className="syncDot" /> متزامن الآن</span><Link className="iconButton notificationButton" href="/alerts" aria-label="تنبيهات السعر الأذكى" title="تنبيهات السعر الأذكى"><Bell size={19} /><span className="notificationDot" /></Link>{canSell ? <Link className="quickSale" href="/marketplace/seller"><Store size={18} /><span>إضافة بضاعة</span></Link> : <Link className="quickSale" href="/sales"><BadgeDollarSign size={18} /><span>بيع جديد</span></Link>}</div>
        </header>
        <main className="pageContent">{children}</main>
        <nav className="mobileBottomNav" aria-label="التنقل على الجوال">
          {mobileNav.map(({ href, label, icon: Icon }) => { const active = href === "/" ? pathname === "/" : pathname.startsWith(href); return <Link key={href} className={active ? "active" : ""} href={href}><Icon size={20} /><span>{label}</span></Link>; })}
        </nav>
      </div>
    </div>
  );
}
