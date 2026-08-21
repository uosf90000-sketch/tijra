export type InventoryStatus = "healthy" | "low" | "critical";

export const inventoryProducts = [
  { id: "p1", name: "مياه صفا 330 مل", sku: "WAT-330", barcode: "628100000001", category: "مياه", quantity: 18, unit: "كرتون", reorderPoint: 24, salePrice: 18, averageCost: 13.5, avgDailySales: 8, status: "critical" as InventoryStatus },
  { id: "p2", name: "بيبسي 330 مل", sku: "PEP-330", barcode: "628100000002", category: "مشروبات", quantity: 21, unit: "حبة", reorderPoint: 36, salePrice: 2.5, averageCost: 1.85, avgDailySales: 11, status: "critical" as InventoryStatus },
  { id: "p3", name: "حليب كامل الدسم 1 لتر", sku: "MLK-1L", barcode: "628100000003", category: "ألبان", quantity: 14, unit: "حبة", reorderPoint: 18, salePrice: 7.5, averageCost: 5.8, avgDailySales: 6, status: "low" as InventoryStatus },
  { id: "p4", name: "شيبس ملح 160 جم", sku: "CHP-160", barcode: "628100000004", category: "سناكات", quantity: 42, unit: "حبة", reorderPoint: 20, salePrice: 8, averageCost: 5.25, avgDailySales: 5, status: "healthy" as InventoryStatus },
  { id: "p5", name: "مناديل 200 منديل", sku: "TIS-200", barcode: "628100000005", category: "منزل", quantity: 31, unit: "حبة", reorderPoint: 14, salePrice: 9.5, averageCost: 6.1, avgDailySales: 3, status: "healthy" as InventoryStatus },
  { id: "p6", name: "سكر أبيض 2 كجم", sku: "SUG-2K", barcode: "628100000006", category: "مواد غذائية", quantity: 12, unit: "كيس", reorderPoint: 10, salePrice: 11, averageCost: 8.4, avgDailySales: 2, status: "low" as InventoryStatus },
  { id: "p7", name: "زيت دوار الشمس 1.5 لتر", sku: "OIL-15", barcode: "628100000007", category: "مواد غذائية", quantity: 26, unit: "حبة", reorderPoint: 12, salePrice: 24, averageCost: 18.7, avgDailySales: 2.4, status: "healthy" as InventoryStatus },
  { id: "p8", name: "مكرونة 450 جم", sku: "PAS-450", barcode: "628100000008", category: "مواد غذائية", quantity: 49, unit: "حبة", reorderPoint: 16, salePrice: 5.5, averageCost: 3.65, avgDailySales: 4, status: "healthy" as InventoryStatus },
];

export const suppliers = [
  { id: "s1", name: "شركة المورد الأول", phone: "05••• ••128", products: 86, openOrders: 2, balance: 2840, note: "التوصيل يتم بالاتفاق المباشر" },
  { id: "s2", name: "مؤسسة الإمداد السريع", phone: "05••• ••742", products: 54, openOrders: 1, balance: 1190, note: "التوصيل يتم بالاتفاق المباشر" },
  { id: "s3", name: "تجارة الخليج للمواد الغذائية", phone: "05••• ••319", products: 112, openOrders: 0, balance: 0, note: "التوصيل يتم بالاتفاق المباشر" },
  { id: "s4", name: "موزع المشروبات المتحدة", phone: "05••• ••665", products: 37, openOrders: 1, balance: 730, note: "التوصيل يتم بالاتفاق المباشر" },
];

export const purchaseSuggestions = [
  { product: "مياه صفا 330 مل", current: 18, demand: 56, suggested: 40, unit: "كرتون", supplier: "شركة المورد الأول", unitPrice: 13.2, previousPrice: 13.8, saving: 24 },
  { product: "بيبسي 330 مل", current: 21, demand: 77, suggested: 60, unit: "حبة", supplier: "موزع المشروبات المتحدة", unitPrice: 1.78, previousPrice: 1.91, saving: 7.8 },
  { product: "حليب كامل الدسم 1 لتر", current: 14, demand: 42, suggested: 30, unit: "حبة", supplier: "مؤسسة الإمداد السريع", unitPrice: 5.62, previousPrice: 5.9, saving: 8.4 },
  { product: "سكر أبيض 2 كجم", current: 12, demand: 18, suggested: 8, unit: "كيس", supplier: "تجارة الخليج للمواد الغذائية", unitPrice: 8.15, previousPrice: 8.45, saving: 2.4 },
];

export const purchaseOrders = [
  { id: "PO-1042", supplier: "شركة المورد الأول", items: 12, total: 1280, status: "confirmed", date: "21 أغسطس" },
  { id: "PO-1041", supplier: "مؤسسة الإمداد السريع", items: 7, total: 620, status: "sent", date: "20 أغسطس" },
  { id: "PO-1040", supplier: "موزع المشروبات المتحدة", items: 5, total: 840, status: "partial", date: "19 أغسطس" },
  { id: "PO-1039", supplier: "تجارة الخليج للمواد الغذائية", items: 16, total: 1920, status: "received", date: "18 أغسطس" },
];

export const recentSales = [
  { id: "INV-2198", time: "17:42", items: 5, total: 64.5, cost: 42.1, payment: "مدى" },
  { id: "INV-2197", time: "17:31", items: 2, total: 17, cost: 10.7, payment: "نقدي" },
  { id: "INV-2196", time: "17:14", items: 8, total: 121.25, cost: 78.4, payment: "مدى" },
  { id: "INV-2195", time: "16:58", items: 3, total: 32, cost: 21.5, payment: "نقدي" },
  { id: "INV-2194", time: "16:40", items: 6, total: 89.5, cost: 57.9, payment: "مدى" },
];

export const accountingEntries = [
  { date: "21 أغسطس", type: "مبيعات", description: "مبيعات اليوم حتى الآن", amount: 4820, direction: "in" },
  { date: "21 أغسطس", type: "مشتريات", description: "فاتورة شركة المورد الأول", amount: 1280, direction: "out" },
  { date: "21 أغسطس", type: "مصروف", description: "كهرباء ومرافق", amount: 210, direction: "out" },
  { date: "20 أغسطس", type: "مبيعات", description: "إقفال مبيعات اليوم", amount: 4460, direction: "in" },
  { date: "20 أغسطس", type: "مصروف", description: "مواد تغليف", amount: 95, direction: "out" },
];

export const employees = [
  { id: "e1", name: "محمد علي", role: "كاشير", baseSalary: 4200, allowances: 300, deductions: 0, advances: 250, status: "active" },
  { id: "e2", name: "سالم أحمد", role: "مشرف فرع", baseSalary: 5200, allowances: 500, deductions: 120, advances: 0, status: "active" },
  { id: "e3", name: "خالد حسن", role: "عامل ترتيب", baseSalary: 3600, allowances: 250, deductions: 0, advances: 150, status: "active" },
  { id: "e4", name: "ناصر سعيد", role: "كاشير", baseSalary: 4200, allowances: 300, deductions: 75, advances: 0, status: "active" },
];

export const payrollRuns = [
  { period: "أغسطس 2026", employees: 4, gross: 18550, deductions: 595, net: 17955, status: "draft" },
  { period: "يوليو 2026", employees: 4, gross: 18550, deductions: 320, net: 18230, status: "paid" },
  { period: "يونيو 2026", employees: 4, gross: 18100, deductions: 450, net: 17650, status: "paid" },
];

export const weeklySales = [
  { day: "السبت", value: 3880 },
  { day: "الأحد", value: 4210 },
  { day: "الاثنين", value: 3950 },
  { day: "الثلاثاء", value: 4680 },
  { day: "الأربعاء", value: 4390 },
  { day: "الخميس", value: 4820 },
  { day: "الجمعة", value: 3540 },
];
