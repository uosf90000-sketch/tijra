/**
 * Workspace configuration controls navigation and onboarding defaults, not API authorization,
 * billing, enterprise readiness, or statutory compliance. Auth is enforced separately.
 */
export const workspaceModules = [
  { key: "SALES", label: "المبيعات والكاشير", href: "/sales", description: "نقطة بيع وفواتير المبيعات" },
  { key: "INVENTORY", label: "المخزون والدفعات", href: "/inventory", description: "الرصيد والجرد وحركة الأصناف" },
  { key: "PURCHASING", label: "الشراء والموردون", href: "/purchases", description: "طلب الشراء ومطابقة المورد" },
  { key: "MARKETPLACE", label: "سوق تِجرا", href: "/marketplace", description: "الشراء والبيع بين الشركات المسجلة" },
  { key: "ACCOUNTING", label: "المحاسبة والتقارير", href: "/accounting", description: "الأرباح والتسويات والمصاريف" },
  { key: "STAFF", label: "الموظفون والرواتب", href: "/employees", description: "الموظفون والصلاحيات والرواتب" },
  { key: "LOCATIONS", label: "الفروع والمستودعات", href: "/inventory/locations", description: "أماكن التخزين وجردها" },
  { key: "INSIGHTS", label: "التحليلات ومراقب المشتريات", href: "/purchases/insights", description: "التنبيهات والفروقات وهوامش الربح" },
  { key: "CRM", label: "العملاء وعروض الأسعار", href: "/crm", description: "العملاء، العروض، الذمم والتحصيل" },
  { key: "SOURCING", label: "مقارنة الموردين", href: "/sourcing", description: "طلب عروض الأسعار واختيار العرض الأفضل" },
  { key: "FLOW", label: "تِجرا Flow", href: "/flow", description: "قواعد التنبيهات والمهام المشتركة" },
  { key: "COMPLIANCE", label: "التصاريح والمستندات", href: "/compliance", description: "متابعة صلاحية مستندات المنشأة والموردين" },
] as const;

export type WorkspaceModuleKey = (typeof workspaceModules)[number]["key"];
export const moduleKeys = workspaceModules.map((item) => item.key);
export const scaleOptions = [
  { value: "MICRO", label: "متناهي الصغر / فود ترك" },
  { value: "SMALL", label: "منشأة صغيرة" },
  { value: "MEDIUM", label: "منشأة متوسطة" },
  { value: "ENTERPRISE", label: "شركة كبيرة / مجموعة شركات" },
] as const;
export const modelOptions = [
  { value: "FOOD_TRUCK", label: "فود ترك / عربة طعام" },
  { value: "SHOP", label: "محل أو متجر" },
  { value: "RESTAURANT", label: "مطعم / مقهى" },
  { value: "WHOLESALE", label: "مورد أو تجارة جملة" },
  { value: "SERVICES", label: "شركة خدمات" },
  { value: "MANUFACTURING", label: "مصنع" },
  { value: "LOGISTICS", label: "نقل وخدمات لوجستية" },
  { value: "MIXED", label: "أنشطة متعددة" },
] as const;

export type BusinessScaleValue = (typeof scaleOptions)[number]["value"];
export type OperatingModelValue = (typeof modelOptions)[number]["value"];

const defaultModules: Record<OperatingModelValue, WorkspaceModuleKey[]> = {
  FOOD_TRUCK: ["SALES", "INVENTORY", "PURCHASING", "ACCOUNTING", "INSIGHTS", "COMPLIANCE"],
  SHOP: ["SALES", "INVENTORY", "PURCHASING", "MARKETPLACE", "ACCOUNTING", "INSIGHTS", "CRM", "FLOW"],
  RESTAURANT: ["SALES", "INVENTORY", "PURCHASING", "ACCOUNTING", "STAFF", "INSIGHTS", "CRM", "FLOW", "COMPLIANCE"],
  WHOLESALE: ["SALES", "INVENTORY", "PURCHASING", "MARKETPLACE", "ACCOUNTING", "STAFF", "LOCATIONS", "INSIGHTS", "CRM", "SOURCING", "FLOW", "COMPLIANCE"],
  SERVICES: ["SALES", "PURCHASING", "ACCOUNTING", "STAFF", "INSIGHTS", "CRM", "FLOW"],
  MANUFACTURING: ["INVENTORY", "PURCHASING", "MARKETPLACE", "ACCOUNTING", "STAFF", "LOCATIONS", "INSIGHTS", "CRM", "SOURCING", "FLOW"],
  LOGISTICS: ["SALES", "PURCHASING", "ACCOUNTING", "STAFF", "LOCATIONS", "INSIGHTS", "CRM", "FLOW", "COMPLIANCE"],
  MIXED: [...moduleKeys],
};

export function resolveWorkspaceModules(
  scale: BusinessScaleValue,
  model: OperatingModelValue,
  selected: readonly string[],
): WorkspaceModuleKey[] {
  const allowed = new Set<string>(moduleKeys);
  const saved = [...new Set(selected)].filter((module) => allowed.has(module)) as WorkspaceModuleKey[];
  if (saved.length > 0) return saved;
  const defaults = defaultModules[model];
  return scale === "ENTERPRISE" ? [...moduleKeys] :
    scale === "MEDIUM" ? [...new Set([...defaults, "STAFF", "LOCATIONS"])] :
    [...defaults];
}

/** Suggested landing page only; never an access control gate. */
export function primaryWorkspaceHref(scale: BusinessScaleValue, model: OperatingModelValue, selected: readonly string[]) {
  const enabled = resolveWorkspaceModules(scale, model, selected);
  return workspaceModules.find((module) => enabled.includes(module.key))?.href ?? "/";
}
