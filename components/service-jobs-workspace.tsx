"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Job = {
  id: string; title: string; description: string | null; scheduledAt: string;
  status: "OPEN" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  quotedAmount: string | null; customer: string | null; employee: string | null;
  assignedToMe: boolean; assignedEmployeeId: string | null; completionNote: string | null;
};
type Option = { id:string; name:string };
const labels = {
  OPEN:"جديد", SCHEDULED:"مجدول للفني", IN_PROGRESS:"جاري التنفيذ",
  COMPLETED:"مكتمل داخليًا", CANCELLED:"ملغي",
};
export function ServiceJobsWorkspace({jobs,customers,employees,locations,canManage,canAct,currency}:{
  jobs:Job[]; customers:Option[]; employees:Option[]; locations:Option[];
  canManage:boolean; canAct:boolean; currency:string;
}){
  const router=useRouter(),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [activeFilter,setActiveFilter]=useState("ALL");
  async function call(path:string,method:"POST"|"PATCH",data:object){
    if(busy)return;
    setBusy(true);setMessage("");
    try{
      const res=await fetch(path,{method,headers:{"content-type":"application/json"},body:JSON.stringify(data)});
      const payload=await res.json().catch(()=>({}));
      if(!res.ok){setMessage("تعذر الإجراء: "+(payload.error||"راجع البيانات"));return;}
      setMessage("حُفظ التحديث. التنفيذ مسجل داخليًا ولم يتحقق مدار من حضور الفني أو الدفع خارجيًا.");
      router.refresh();
    }catch{setMessage("تعذر الاتصال؛ افحص الأمر قبل إعادة الطلب.");}
    finally{setBusy(false);}
  }
  function create(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const f=new FormData(e.currentTarget),dt=String(f.get("scheduledAt")||"");
    const scheduledAt=new Date(dt);
    if(!dt||!Number.isFinite(scheduledAt.getTime())){setMessage("أدخل موعدًا صحيحًا");return;}
    void call("/api/service-jobs","POST",{
      title:String(f.get("title")||""),description:f.get("description")||undefined,
      customerId:f.get("customerId")||undefined,
      assignedEmployeeId:f.get("assignedEmployeeId")||undefined,
      quotedAmount:f.get("quotedAmount")||undefined,
      locationId:f.get("locationId")||undefined,
      scheduledAt:scheduledAt.toISOString(),
    });
  }
  function action(job:Job,act:"ASSIGN"|"START"|"COMPLETE"|"CANCEL",assignedEmployeeId?:string){
    if(act==="ASSIGN"&&(!assignedEmployeeId||!employees.some(e=>e.id===assignedEmployeeId)))return;
    const note=act==="START"?"":window.prompt(act==="COMPLETE"?
      "اكتب دليل إنجاز الخدمة أو ملاحظة التسليم (8 أحرف على الأقل):":
      act==="CANCEL"?"سبب إلغاء أمر الخدمة (8 أحرف):":"سبب إعادة/تحديد التعيين (8 أحرف):");
    if(act!=="START"&&(!note||note.trim().length<8))return;
    void call("/api/service-jobs/"+encodeURIComponent(job.id),"PATCH",{
      action:act,assignedEmployeeId,note:note||"",
    });
  }
  const shown=jobs.filter(j=>activeFilter==="ALL"||j.status===activeFilter);
  return <div style={{display:"grid",gap:18}}>
    {message&&<div className="infoNote" role="status">{message}</div>}
    <section className="metricsGrid three">
      <article className="panel"><span className="eyebrow">أوامر في المعروض</span><h2>{jobs.length}</h2></article>
      <article className="panel"><span className="eyebrow">قيد التنفيذ</span><h2>{jobs.filter(j=>j.status==="IN_PROGRESS").length}</h2></article>
      <article className="panel"><span className="eyebrow">تجاوز موعدها دون إكمال</span><h2>{jobs.filter(j=>!["COMPLETED","CANCELLED"].includes(j.status)&&new Date(j.scheduledAt)<new Date()).length}</h2></article>
    </section>
    <div className="infoNote">تعرض الشاشة حتى 200 أمر من الأقرب موعدًا. حالة «مكتمل» تعني أن موظفًا مخولًا سجل الإنجاز؛ لا تعني إثباتًا بنكيًا أو اعتماد العميل عبر OTP.</div>
    {canManage&&<section className="panel">
      <div className="panelHeader"><div><span className="eyebrow">تشغيل الخدمة</span><h2>أمر خدمة جديد</h2></div></div>
      <form className="formGrid" onSubmit={create}>
        <label className="field"><span>اسم الخدمة</span><input name="title" required minLength={3} maxLength={180} placeholder="صيانة مكيف الدور الأول" /></label>
        <label className="field"><span>وصف العمل</span><input name="description" maxLength={1500} placeholder="وصف المشكلة والمتطلبات" /></label>
        <label className="field"><span>العميل</span><select name="customerId" defaultValue=""><option value="">غير محدد</option>{customers.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="field"><span>الفني / الموظف</span><select name="assignedEmployeeId" defaultValue=""><option value="">يُعيَّن لاحقًا</option>{employees.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="field"><span>موعد الخدمة</span><input name="scheduledAt" type="datetime-local" required /></label>
        <label className="field"><span>القيمة المتوقعة ({currency})</span><input name="quotedAmount" type="number" min="0" step="0.01" /></label>
        <label className="field"><span>الموقع</span><select name="locationId" defaultValue="">
          <option value="">الموقع الافتراضي</option>{locations.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
        </select></label>
        <div className="formActions"><button className="button primary" disabled={busy}>إنشاء الأمر</button></div>
      </form>
    </section>}
    <section className="panel tablePanel">
      <div className="panelHeader"><div><span className="eyebrow">الأعمال المسجلة</span><h2>قائمة أوامر الخدمات</h2></div>
        <select aria-label="فلترة حسب حالة الأمر" value={activeFilter} onChange={e=>setActiveFilter(e.target.value)}>
          <option value="ALL">كل الحالات</option>
          {Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <div className="tableScroll"><table className="dataTable">
        <thead><tr><th>العمل</th><th>العميل</th><th>الفني</th><th>الموعد</th><th>الحالة</th><th>إجراء</th></tr></thead>
        <tbody>{shown.map(job=><tr key={job.id}>
          <td><strong>{job.title}</strong><div className="mutedText">{job.description||""}{job.quotedAmount?" · "+job.quotedAmount+" "+currency:""}</div></td>
          <td>{job.customer||"—"}</td><td>{job.employee||"لم يعيّن"}</td>
          <td>{new Date(job.scheduledAt).toLocaleString("ar-SA",{dateStyle:"medium",timeStyle:"short"})}</td>
          <td>{labels[job.status]}</td>
          <td><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {canManage&&["OPEN","SCHEDULED"].includes(job.status)&&employees.length>0&&
              <select aria-label={"تعيين فني لأمر "+job.title} value={job.assignedEmployeeId||""} disabled={busy}
                onChange={e=>{if(e.target.value!==job.assignedEmployeeId) action(job,"ASSIGN",e.target.value);}}>
                <option value="">تعيين فني</option>{employees.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
              </select>}
            {canAct&&(canManage||job.assignedToMe)&&
              ["OPEN","SCHEDULED"].includes(job.status)&&job.assignedEmployeeId&&
              <button type="button" disabled={busy} className="button secondary" onClick={()=>action(job,"START")}>بدء</button>}
            {canAct&&(canManage||job.assignedToMe)&&job.status==="IN_PROGRESS"&&
              <button type="button" disabled={busy} className="button secondary" onClick={()=>action(job,"COMPLETE")}>توثيق الإنجاز</button>}
            {canManage&&!["COMPLETED","CANCELLED"].includes(job.status)&&
              <button type="button" disabled={busy} className="button secondary" onClick={()=>action(job,"CANCEL")}>إلغاء</button>}
          </div></td>
        </tr>)}
        {!shown.length&&<tr><td colSpan={6}>لا توجد أوامر تطابق الفلتر.</td></tr>}
        </tbody></table></div>
    </section>
  </div>;
}
