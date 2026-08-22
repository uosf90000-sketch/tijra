"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BellRing,
  Boxes,
  Calculator,
  ClipboardList,
  LayoutDashboard,
  Search,
  ShoppingBag,
  ShoppingBasket,
  ShoppingCart,
  Store,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";

const commands = [
  { href: "/", label: "الرئيسية", hint: "لوحة التحكم", icon: LayoutDashboard },
  { href: "/marketplace", label: "سوق تِجرا", hint: "منتجات الموردين والأسعار والمخزون", icon: ShoppingBag },
  { href: "/marketplace/orders", label: "طلباتي من السوق", hint: "متابعة طلبات الموردين والاستلام", icon: ClipboardList },
  { href: "/marketplace/seller", label: "متجري كمورد", hint: "عرض البضاعة ومخزون المورد", icon: Store },
  { href: "/inventory", label: "المخزون", hint: "الأصناف والكميات والتنبيهات", icon: Boxes },
  { href: "/sales", label: "المبيعات", hint: "بيع جديد وسجل المبيعات", icon: ShoppingCart },
  { href: "/purchases", label: "المشتريات", hint: "الطلبات والاقتراحات الذكية", icon: ShoppingBasket },
  { href: "/alerts", label: "السعر الأذكى", hint: "فرص التوفير بين الموردين", icon: BellRing },
  { href: "/accounting", label: "المحاسبة", hint: "المبيعات والتكاليف والربح", icon: Calculator },
  { href: "/employees", label: "الموظفون", hint: "إدارة فريق المنشأة", icon: UsersRound },
  { href: "/payroll", label: "الرواتب", hint: "المسيرات والاعتماد", icon: WalletCards },
];

export function CommandPalette({ open, onClose, allowedHrefs }: { open: boolean; onClose: () => void; allowedHrefs?: string[] }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filtered = useMemo(() => {
    const available = allowedHrefs ? commands.filter((item) => allowedHrefs.includes(item.href)) : commands;
    const normalized = query.trim().toLowerCase();
    if (!normalized) return available;
    return available.filter((item) => `${item.label} ${item.hint}`.toLowerCase().includes(normalized));
  }, [query, allowedHrefs]);

  if (!open) return null;

  return (
    <div className="commandOverlay" role="presentation" onMouseDown={onClose}>
      <section className="commandPalette" role="dialog" aria-modal="true" aria-label="بحث سريع" onMouseDown={(event) => event.stopPropagation()}>
        <div className="commandSearch">
          <Search size={19} />
          <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث داخل الأقسام المسموح بها..." aria-label="بحث سريع" />
          <button type="button" className="commandClose" onClick={onClose} aria-label="إغلاق"><X size={18} /></button>
        </div>
        <div className="commandMeta"><span>انتقال سريع</span><kbd>ESC</kbd></div>
        <div className="commandList">
          {filtered.map(({ href, label, hint, icon: Icon }) => (
            <Link key={href} href={href} className="commandItem" onClick={onClose}>
              <span className="commandIcon"><Icon size={18} /></span>
              <span className="commandCopy"><strong>{label}</strong><small>{hint}</small></span>
              <span className="commandArrow">←</span>
            </Link>
          ))}
          {!filtered.length && <div className="commandEmpty">لا توجد نتيجة ضمن صلاحيات هذا الحساب.</div>}
        </div>
      </section>
    </div>
  );
}
