export type PosExperience = "BARCODE" | "MENU" | "PART_LOOKUP" | "CATALOG";

export function isFoodActivity(activity: string) {
  return activity === "RESTAURANT" || activity === "CAFE";
}

export function posExperienceFor(activity: string): PosExperience {
  if (isFoodActivity(activity)) return "MENU";
  if (activity === "HARDWARE" || activity === "ELECTRONICS") return "PART_LOOKUP";
  if (["GROCERY", "PHARMACY", "BEAUTY", "OFFICE"].includes(activity)) return "BARCODE";
  return "CATALOG";
}

export const businessActivityLabels: Record<string, string> = {
  GROCERY: "بقالة وتموينات",
  ELECTRONICS: "إلكترونيات",
  PHARMACY: "صيدلية",
  RESTAURANT: "مطعم",
  CAFE: "مقهى",
  FASHION: "ملابس",
  BEAUTY: "عناية وتجميل",
  HARDWARE: "قطع غيار وأدوات",
  OFFICE: "مكتبة ومستلزمات مكتبية",
  OTHER: "نشاط آخر",
};
