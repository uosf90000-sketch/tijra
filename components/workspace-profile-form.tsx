"use client";

import { CheckCircle2, Settings2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  workspaceModules, scaleOptions, modelOptions, resolveWorkspaceModules,
  type BusinessScaleValue, type OperatingModelValue, type WorkspaceModuleKey,
} from "@/lib/workspace-profile";

export function WorkspaceProfileForm({
  initialScale, initialModel, initialModules,
}: {
  initialScale: BusinessScaleValue;
  initialModel: OperatingModelValue;
  initialModules: string[];
}) {
  const router = useRouter();
  const [scale, setScale] = useState<BusinessScaleValue>(initialScale);
  const [model, setModel] = useState<OperatingModelValue>(initialModel);
  const [modules, setModules] = useState<WorkspaceModuleKey[]>(
    resolveWorkspaceModules(initialScale, initialModel, initialModules),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function changePreset(nextScale: BusinessScaleValue, nextModel: OperatingModelValue) {
    setScale(nextScale);
    setModel(nextModel);
    setModules(resolveWorkspaceModules(nextScale, nextModel, []));
  }

  function toggle(key: WorkspaceModuleKey) {
    setModules((current) => current.includes(key)
      ? current.length <= 1 ? current : current.filter((value) => value !== key)
      : [...current, key]);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/business/workspace", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessScale: scale, operatingModel: model, workspaceModules: modules }),
      });
      if (!response.ok) throw new Error("SAVE_FAILED");
      setMessage("تم حفظ مساحة العمل لهذه المنشأة. تتحدث الأدوات الظاهرة حسب اختياراتك.");
      router.refresh();
    } catch {
      setMessage("تعذر الحفظ. تأكد من الاتصال وصلاحية مالك المنشأة.");
    } finally {
      setSaving(false);
    }
  }

  return <article className="panel" style={{ display: "grid", gap: 16 }}>
    <div className="panelHeader"><div><span className="eyebrow">تهيئة الأعمال</span><h2>اختر حجم المنشأة ونشاطها</h2></div><Settings2 size={20} /></div>
    <div className="formGrid">
      <label className="field"><span>حجم المنشأة</span>
        <select value={scale} onChange={(event) => changePreset(event.target.value as BusinessScaleValue, model)}>
          {scaleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="field"><span>النشاط التشغيلي</span>
        <select value={model} onChange={(event) => changePreset(scale, event.target.value as OperatingModelValue)}>
          {modelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    </div>
    <div className="infoNote">
      المميزات موجودة في النظام، وهذه الخيارات تحدد ما يبرز في واجهة المنشأة.
      لا تغيّر صلاحيات الموظفين، ولا تعني اكتمال التكامل الضريبي أو المالي للشركات الكبيرة.
    </div>
    <div className="panelHeader"><div><span className="eyebrow">مساحة قابلة للتخصيص</span><h2>الوحدات الظاهرة</h2></div></div>
    <div className="ownerHubGrid">
      {workspaceModules.map((item) => (
        <label key={item.key} className="ownerHubCard" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={modules.includes(item.key)} onChange={() => toggle(item.key)} />
          <div><strong>{item.label}</strong><span>{item.description}</span></div>
        </label>
      ))}
    </div>
    {message && <div className="infoNote">{message}</div>}
    <div className="formActions"><button type="button" className="button primary" disabled={saving} onClick={save}>
      {saving ? <Save size={17} /> : <CheckCircle2 size={17} />}
      {saving ? "جاري الحفظ..." : "حفظ إعدادات المنشأة"}
    </button></div>
  </article>;
}
