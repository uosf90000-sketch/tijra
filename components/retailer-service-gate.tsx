import Link from "next/link";
import { Boxes, Calculator, CheckCircle2, ScanBarcode, ShoppingBag, ShoppingCart, Sparkles } from "lucide-react";

type Service = "inventory" | "sales" | "accounting";

const configs = {
  inventory: {
    eyebrow: "الجرد الذكي",
    title: "نظام الجرد المتقدم قريبًا",
    description: "نجهّز تجربة جرد سريعة للمحل تعمل مع قارئ باركود مخصص، حتى لا يتحول الجوال إلى عبء أثناء استقبال وبيع مئات الأصناف.",
    icon: Boxes,
    bullets: ["قارئ باركود سريع للمحل", "تحديث فوري للكميات مع البيع", "تنبيهات نقص وإعادة طلب تلقائية"],
  },
  sales: {
    eyebrow: "الكاشير",
    title: "نقطة البيع وقارئ الباركود قريبًا",
    description: "الكاشير يحتاج قراءة متكررة وسريعة للمنتجات، لذلك سنفتحه للتاجر مع تجربة POS مناسبة وقارئ باركود بدل الاعتماد على كاميرا الجوال لكل عملية بيع.",
    icon: ShoppingCart,
    bullets: ["مسح متتابع وسريع للمنتجات", "خصم الكمية تلقائيًا من المخزون", "حساب الربح الحقيقي بعد كل عملية بيع"],
  },
  accounting: {
    eyebrow: "المحاسبة المتقدمة",
    title: "المحاسبة الكاملة قادمة مع نظام المتجر",
    description: "حاليًا نعطي التاجر ملخص مشترياته والتزاماته. الربح الحقيقي والمحاسبة التشغيلية الكاملة تُفتح عندما تكون المبيعات والجرد مسجلة تلقائيًا من نقطة البيع.",
    icon: Calculator,
    bullets: ["تكلفة بضاعة ومجمل ربح دقيق", "مصروفات ورواتب ضمن قائمة الدخل", "تقارير يومية وشهرية تلقائية"],
  },
} as const;

export function RetailerServiceGate({ service, compact = false }: { service: Service; compact?: boolean }) {
  const config = configs[service];
  const Icon = config.icon;

  return (
    <section className={`retailerGate ${compact ? "compact" : ""}`} aria-label={`${config.title} - قريبًا`}>
      <div className="retailerGateBackdrop" aria-hidden="true">
        <div className="retailerGhostCard wide" />
        <div className="retailerGhostGrid"><span /><span /><span /></div>
        <div className="retailerGhostTable"><span /><span /><span /><span /></div>
      </div>

      <div className="retailerGateGlass">
        <div className="retailerGateIcon"><Icon size={26} strokeWidth={1.7} /></div>
        <div className="retailerGateCopy">
          <div className="retailerGateTopline"><span className="eyebrow"><Sparkles size={13} /> {config.eyebrow}</span><span className="comingSoonBadge">قريبًا</span></div>
          <h2>{config.title}</h2>
          <p>{config.description}</p>
          <div className="retailerGateBullets">
            {config.bullets.map((item) => <span key={item}><CheckCircle2 size={15} /> {item}</span>)}
          </div>
          {!compact && (
            <div className="retailerGateActions">
              <Link className="button primary" href="/marketplace"><ShoppingBag size={16} /> الذهاب للسوق</Link>
              <Link className="button secondary" href="/alerts"><ScanBarcode size={16} /> السعر الأذكى</Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
