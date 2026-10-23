"use client";

import { Building2, CheckCircle2, PlusCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { modelOptions, scaleOptions } from "@/lib/workspace-profile";

type LinkedBusiness = {
  id: string; name: string; role: string; businessScale: string;
  operatingModel: string; organizationId: string | null;
};

export function CompanyWorkspaceManager({
  companies, activeBusinessId, canCreate,
}: {
  companies: LinkedBusiness[]; activeBusinessId: string; canCreate: boolean;
}) {
  const router = useRouter();
  const [switching, setSwitching] = useState("");
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");

  async function switchCompany(businessId: string) {
    if (businessId === activeBusinessId || switching) return;
    setSwitching(businessId);
    setMessage("");
    try {
      const response = await fetch("/api/businesses/switch", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessId }),
      });
      if (!response.ok) throw new Error("SWITCH_FAILED");
      // Hard navigation refreshes all server data and avoids cross-company client state.
      window.location.assign("/management/workspace");
    } catch {
      setMessage("تعذر اختيار الشركة. تأكد أن لديك صلاحية فعلية فيها.");
      setSwitching("");
    }
  }

  async function createBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate || adding) return;
    setAdding(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/businesses", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"), city: form.get("city") || undefined,
          businessType: form.get("businessType"),
          businessActivity: form.get("businessActivity"),
          businessScale: form.get("businessScale"),
          operatingModel: form.get("operatingModel"),
        }),
      });
      if (!response.ok) throw new Error("CREATE_FAILED");
      window.location.assign("/management/workspace");
    } catch {
      setMessage("تعذر إنشاء الشركة. لم تتغير الشركة الحالية.");
      setAdding(false);
    }
  }

  return <article className="panel" style={{ display: "grid", gap: 16 }}>
    <div className="panelHeader"><div><span className="eyebrow">تعدد الشركات</span><h2>الشركات التي تملك صلاحية الوصول إليها</h2></div><Building2 size={20} /></div>
    <div className="infoNote">
      الشركة هنا كيان مستقل ببياناتها ومخزونها وعضويتها. الفروع والمستودعات داخل الشركة تُدار من قسم «الفروع والمستودعات».
      هذه ليست لوحة توحيد قوائم مالية بين الشركات.
    </div>
    <div className="alertList">
      {companies.map((company) => (
        <div className="alertRow" key={company.id}>
          <div className="grow"><strong>{company.name}</strong><span>{company.role === "OWNER" ? "مالك" : company.role} · {company.businessScale}</span></div>
          {company.id === activeBusinessId
            ? <span><CheckCircle2 size={16} /> الحالية</span>
            : <button type="button" disabled={Boolean(switching)} className="button secondary" onClick={() => switchCompany(company.id)}>
              <RefreshCw size={15} /> {switching === company.id ? "جاري التبديل..." : "فتح الشركة"}
            </button>}
        </div>
      ))}
    </div>
    {message && <div className="infoNote">{message}</div>}
    {canCreate && (
      <form className="onboardingForm" onSubmit={createBusiness} style={{ display: "grid", gap: 12 }}>
        <div className="panelHeader"><div><span className="eyebrow">مجموعة شركات</span><h2>إضافة شركة جديدة مستقلة</h2></div></div>
        <div className="formGrid">
          <label className="field"><span>اسم الشركة</span><input name="name" required minLength={2} maxLength={140} placeholder="مثال: شركة توزيع المنطقة الغربية" /></label>
          <label className="field"><span>المدينة</span><input name="city" maxLength={100} placeholder="اختياري" /></label>
          <label className="field"><span>العلاقة التجارية</span><select name="businessType" defaultValue="RETAILER">
            <option value="RETAILER">تاجر / مشتري</option><option value="SUPPLIER">مورد / بائع</option><option value="BOTH">مورد وتاجر</option>
          </select></label>
          <label className="field"><span>النشاط الرئيسي</span><select name="businessActivity" defaultValue="OTHER">
            <option value="GROCERY">مواد غذائية</option><option value="CAFE">مقهى</option><option value="RESTAURANT">مطعم</option><option value="ELECTRONICS">إلكترونيات</option>
            <option value="PHARMACY">صيدلية</option><option value="FASHION">ملابس</option><option value="BEAUTY">تجميل</option>
            <option value="HARDWARE">قطع غيار / أدوات</option><option value="OFFICE">مكتبي</option><option value="OTHER">خدمات / آخر</option>
          </select></label>
          <label className="field"><span>حجم الشركة</span><select name="businessScale" defaultValue="MEDIUM">
            {scaleOptions.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select></label>
          <label className="field"><span>النشاط التشغيلي</span><select name="operatingModel" defaultValue="MIXED">
            {modelOptions.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select></label>
        </div>
        <div className="infoNote">إنشاء شركة ينشئ بيئة وبيانات مستقلة، وليس مجرد فرع. لا تُنسخ أسعار أو منتجات أو فواتير الشركة الحالية تلقائيًا.</div>
        <div className="formActions"><button className="button secondary" disabled={adding}>
          <PlusCircle size={17} /> {adding ? "جاري الإضافة..." : "إنشاء الشركة وفتحها"}
        </button></div>
      </form>
    )}
  </article>;
}
