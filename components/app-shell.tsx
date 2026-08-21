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
  ShoppingBasket,
  ShoppingCart,
  Store,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

const operations = [
  { href: "/", label: "الرئيسية", icon: LayoutDashboard },
  { href: "/inventory", label: "المخزون", icon: Boxes },
  { href: "/sales", label: "المبيعات", icon: ShoppingCart },
  { href: "/suppliers", label: "الموردون", icon: Store },
  { href: "/purchases", label: "المشتريات", icon: ShoppingBasket },
];

const management = [
  { href: "/accounting", label: "المحاسبة", icon: Calculator },
  { href: "/employees", label: "الموظفون", icon: UsersRound },
  { href: "/payroll", label: "الرواتب", icon: WalletCards },
];

const mobileNav = [operations[0], operations[1], operations[4], management[0], management[2]];

type Viewer = {
  user: { name: string; email: string };
  membership: { role: string };
  business: { name: string };
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

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const authPage = pathname === "/login" || pathname === "/register";

  useEffect(() => {
    if (authPage) return;
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (active && data) setViewer(data); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [authPage]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  if (authPage) return <>{children}</>;

  return (
    <div className="appFrame">
      <button className={`sidebarBackdrop ${open ? "show" : ""}`} aria-label="إغلاق القائمة" onClick={() => setOpen(false)} />

      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebarTop">
          <Link href="/" className="brand" aria-label="تِجرا - الرئيسية">
            <div className="brandMark">ت</div>
            <div className="brandText"><strong>تِجرا</strong><span>إدارة تجارتك بذكاء</span></div>
          </Link>
          <button className="iconButton sidebarClose" onClick={() => setOpen(false)} aria-label="إغلاق القائمة"><X size={20} /></button>
        </div>

        <button className="workspaceSwitcher">
          <div className="workspaceIcon"><Store size={18} /></div>
          <div><span>المنشأة الحالية</span><strong>{viewer?.business.name ?? "جاري التحميل..."}</strong></div>
          <ChevronDown size={16} />
        </button>

        <nav className="sideNav" aria-label="التنقل الرئيسي">
          <div className="navGroup">
            <span className="navGroupLabel">التشغيل</span>
            {operations.map((item) => <NavLink key={item.href} {...item} pathname={pathname} onClick={() => setOpen(false)} />)}
          </div>
          <div className="navGroup">
            <span className="navGroupLabel">الإدارة</span>
            {management.map((item) => <NavLink key={item.href} {...item} pathname={pathname} onClick={() => setOpen(false)} />)}
          </div>
        </nav>

        <div className="sidebarInsight">
          <div className="sidebarInsightIcon"><PackageCheck size={18} /></div>
          <strong>المخزون تحت السيطرة</strong>
          <span>تظهر هنا التنبيهات الحقيقية بعد إضافة المنتجات وحركة البيع.</span>
        </div>

        <div className="accountBlock">
          <div className="avatar"><CircleUserRound size={20} /></div>
          <div>
            <strong>{viewer?.user.name ?? "حساب تِجرا"}</strong>
            <span>{roleLabels[viewer?.membership.role ?? ""] ?? viewer?.user.email ?? ""}</span>
          </div>
          <button className="iconButton" onClick={logout} aria-label="تسجيل الخروج" title="تسجيل الخروج"><LogOut size={17} /></button>
        </div>
      </aside>

      <div className="appMain">
        <header className="appTopbar">
          <div className="mobileBrand">
            <button className="iconButton" onClick={() => setOpen(true)} aria-label="فتح القائمة"><Menu size={21} /></button>
            <Link href="/" className="brand brandCompact"><div className="brandMark">ت</div><strong>تِجرا</strong></Link>
          </div>

          <button className="searchTrigger"><Search size={18} /><span>ابحث عن صنف، مورد أو فاتورة...</span><kbd>⌘ K</kbd></button>

          <div className="topActions">
            <span className="syncStatus"><span className="syncDot" /> متزامن الآن</span>
            <button className="iconButton notificationButton" aria-label="التنبيهات"><Bell size={19} /><span className="notificationDot" /></button>
            <Link className="quickSale" href="/sales"><BadgeDollarSign size={18} /><span>بيع جديد</span></Link>
          </div>
        </header>

        <main className="pageContent">{children}</main>

        <nav className="mobileBottomNav" aria-label="التنقل على الجوال">
          {mobileNav.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return <Link key={href} className={active ? "active" : ""} href={href}><Icon size={20} /><span>{label}</span></Link>;
          })}
        </nav>
      </div>
    </div>
  );
}
