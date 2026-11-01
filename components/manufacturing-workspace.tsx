"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

type Product={id:string;name:string;unit:string;quantity:number;cost:number};
type Bom={id:string;name:string;output:string;outputQty:number;
  components:Array<{productId:string;name:string;unit:string;quantity:number}>};
type Order={id:string;output:string;bom:string;status:"PLANNED"|"COMPLETED"|"CANCELLED";
  quantity:number;unit:string;materialCost:string|null;createdAt:string;
  materials:Array<{name:string;quantity:number}>};
type Location={id:string;name:string};
const statuses={PLANNED:"مخطط ولم يُخصم المخزون",COMPLETED:"مكتمل",CANCELLED:"ملغي"};
export function ManufacturingWorkspace({products,boms,orders,locations,canManage,currency}:{
  products:Product[];boms:Bom[];orders:Order[];locations:Location[];canManage:boolean;currency:string;
}){
  const router=useRouter(),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [parts,setParts]=useState([{productId:"",quantity:"1"}]);
  const [outputProduct,setOutputProduct]=useState("");
  const request=useRef<{signature:string;id:string}|null>(null);
  async function api(path:string,method:"POST"|"PATCH",body:object){
    if(busy)return;
    setBusy(true);setMessage("");
    try{
      const res=await fetch(path,{method,headers:{"content-type":"application/json"},body:JSON.stringify(body)});
      const payload=await res.json().catch(()=>({}));
      if(!res.ok){setMessage("تعذر الحفظ: "+(payload.error||"تحقق من المواد والكميات والصلاحيات"));return;}
      if(path==="/api/manufacturing/orders"&&method==="POST")request.current=null;
      setMessage("تم تحديث السجلات الداخلية. المخزون يتغير فقط عند إكمال أمر الإنتاج بنجاح.");
      router.refresh();
    }catch{setMessage("تعذر الاتصال. تحقق من حالة الأمر قبل إعادة المحاولة.");}
    finally{setBusy(false);}
  }
  function createBom(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const f=new FormData(e.currentTarget);
    const components=parts.map(x=>({productId:x.productId,quantity:Number(x.quantity)}));
    if(!outputProduct || components.some(x=>!x.productId||!(x.quantity>0)||
      x.productId===outputProduct) || new Set(components.map(x=>x.productId)).size!==components.length){
      setMessage("حدد منتجًا نهائيًا ومكونات مختلفة وصحيحة.");return;
    }
    void api("/api/manufacturing/boms","POST",{
      name:String(f.get("bomName")||""),outputProductId:outputProduct,
      outputQty:Number(f.get("outputQty")||0),components,
    });
  }
  function plan(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const f=new FormData(e.currentTarget);
    const body={bomId:String(f.get("bomId")||""),quantity:Number(f.get("quantity")),
      locationId:f.get("locationId")||undefined,lotNumber:f.get("lotNumber")||undefined};
    const signature=JSON.stringify(body);
    if(request.current?.signature!==signature)request.current={signature,id:crypto.randomUUID()};
    void api("/api/manufacturing/orders","POST",{...body,clientRequestId:request.current.id});
  }
  function decide(id:string,action:"COMPLETE"|"CANCEL"){
    if(action==="COMPLETE"){
      if(!window.confirm("هل تأكدت من توفر المواد والإنتاج الفعلي؟ سيتم خصم المواد وإضافة المنتج النهائي في معاملة واحدة."))return;
      void api("/api/manufacturing/orders/"+encodeURIComponent(id),"PATCH",{action});
      return;
    }
    const reason=window.prompt("سبب الإلغاء (8 أحرف على الأقل):");
    if(!reason||reason.trim().length<8)return;
    void api("/api/manufacturing/orders/"+encodeURIComponent(id),"PATCH",{action,reason});
  }
  const setPart=(index:number,key:"productId"|"quantity",value:string)=>
    setParts(items=>items.map((x,i)=>i===index?{...x,[key]:value}:x));
  return <div style={{display:"grid",gap:18}}>
    {message&&<div className="infoNote" role="status">{message}</div>}
    <section className="metricsGrid three">
      <article className="panel"><span className="eyebrow">قوائم الإنتاج</span><h2>{boms.length}</h2></article>
      <article className="panel"><span className="eyebrow">أوامر تنتظر الإنتاج</span><h2>{orders.filter(x=>x.status==="PLANNED").length}</h2></article>
      <article className="panel"><span className="eyebrow">أوامر مكتملة</span><h2>{orders.filter(x=>x.status==="COMPLETED").length}</h2></article>
    </section>
    <div className="infoNote">هذا تشغيل إنتاج أساسي، وليس محرك MRP مؤسسيًا مكتملًا. التكلفة من متوسط تكلفة المواد عند تسجيل الإنتاج، دون أجور أو كهرباء أو هدر تصنيع أو قيود محاسبية وضريبية.</div>
    {canManage&&<section className="panel">
      <div className="panelHeader"><div><span className="eyebrow">قائمة المواد BOM</span><h2>تعريف منتج قابل للتصنيع</h2></div></div>
      <form className="formGrid" onSubmit={createBom}>
        <label className="field"><span>اسم نسخة الوصفة الإنتاجية</span><input name="bomName" minLength={3} maxLength={160} placeholder="الإصدار الأول للمنتج" required /></label>
        <label className="field"><span>المنتج النهائي</span><select required value={outputProduct} onChange={e=>setOutputProduct(e.target.value)}>
          <option value="">اختر المنتج</option>{products.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}
        </select></label>
        <label className="field"><span>عدد الوحدات الناتجة من الدفعة</span><input type="number" name="outputQty" min="0.001" step="0.001" defaultValue="1" required /></label>
        <div style={{gridColumn:"1 / -1",display:"grid",gap:10}}>
          <strong>مواد الإنتاج لكل دفعة</strong>
          {parts.map((part,i)=><div key={i} style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <select aria-label={"المادة رقم "+(i+1)} required value={part.productId} onChange={e=>setPart(i,"productId",e.target.value)}>
              <option value="">اختر المادة</option>{products.filter(p=>p.id!==outputProduct).map(p=><option key={p.id} value={p.id}>{p.name} — {p.unit}</option>)}
            </select>
            <input aria-label={"كمية المادة رقم "+(i+1)} type="number" min="0.001" step="0.001" required value={part.quantity}
              onChange={e=>setPart(i,"quantity",e.target.value)} />
            {parts.length>1&&<button type="button" className="button secondary"
              onClick={()=>setParts(items=>items.filter((_,j)=>j!==i))}>حذف</button>}
          </div>)}
          <div><button type="button" className="button secondary" disabled={parts.length>=80}
            onClick={()=>setParts(items=>[...items,{productId:"",quantity:"1"}])}>إضافة مادة</button></div>
        </div>
        <div className="formActions"><button className="button primary" disabled={busy}>حفظ قائمة إنتاج جديدة</button></div>
      </form>
      <p className="policyNote">قائمة المواد بعد الحفظ ثابتة. لإنشاء تركيبة مختلفة، احفظ إصدارًا جديدًا باسم مختلف ولا تعدّل أوامر الإنتاج القديمة.</p>
    </section>}
    {canManage&&<section className="panel">
      <div className="panelHeader"><div><span className="eyebrow">خطة إنتاج</span><h2>إنشاء أمر إنتاج</h2></div></div>
      <form className="formGrid" onSubmit={plan}>
        <label className="field"><span>قائمة المواد المعتمدة داخليًا</span><select name="bomId" required defaultValue="">
          <option value="">اختر BOM</option>{boms.map(b=><option key={b.id} value={b.id}>{b.output} — {b.name}</option>)}
        </select></label>
        <label className="field"><span>الكمية المطلوب إنتاجها</span><input name="quantity" type="number" step="0.001" min="0.001" defaultValue="1" required /></label>
        <label className="field"><span>موقع استهلاك وإضافة المخزون</span><select name="locationId" defaultValue="">
          <option value="">الموقع الافتراضي</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
        </select></label>
        <label className="field"><span>رقم الدفعة (اختياري)</span><input name="lotNumber" maxLength={100} placeholder="BATCH-001" /></label>
        <div className="formActions"><button className="button primary" disabled={busy}>إنشاء أمر مخطط</button></div>
      </form>
    </section>}
    <section className="panel tablePanel">
      <div className="panelHeader"><div><span className="eyebrow">قوائم المواد</span><h2>تركيبات الإنتاج</h2></div></div>
      <div className="tableScroll"><table className="dataTable"><thead><tr>
        <th>المنتج النهائي</th><th>الإصدار</th><th>الناتج لكل دفعة</th><th>المكونات</th>
      </tr></thead><tbody>
        {boms.map(b=><tr key={b.id}><td>{b.output}</td><td>{b.name}</td><td>{b.outputQty}</td>
          <td>{b.components.map(c=>c.name+" ("+c.quantity+" "+c.unit+")").join("، ")}</td>
        </tr>)}
        {!boms.length&&<tr><td colSpan={4}>لا توجد قوائم تصنيع.</td></tr>}
      </tbody></table></div>
    </section>
    <section className="panel tablePanel">
      <div className="panelHeader"><div><span className="eyebrow">حركة الإنتاج</span><h2>أوامر الإنتاج</h2></div></div>
      <div className="tableScroll"><table className="dataTable"><thead><tr>
        <th>الناتج</th><th>المطلوب</th><th>الحالة</th><th>المواد</th><th>التكلفة المسجلة</th><th>إجراء</th>
      </tr></thead><tbody>
        {orders.map(o=><tr key={o.id}>
          <td><strong>{o.output}</strong><div className="mutedText">{o.bom}</div></td>
          <td>{o.quantity.toFixed(3)} {o.unit}</td><td>{statuses[o.status]}</td>
          <td>{o.materials.map(m=>m.name+" "+m.quantity).join("، ")}</td>
          <td>{o.materialCost?o.materialCost+" "+currency:"غير محسوبة بعد"}</td>
          <td>{canManage&&o.status==="PLANNED"&&<div style={{display:"flex",gap:8}}>
            <button type="button" disabled={busy} className="button primary" onClick={()=>decide(o.id,"COMPLETE")}>اعتماد الإنتاج</button>
            <button type="button" disabled={busy} className="button secondary" onClick={()=>decide(o.id,"CANCEL")}>إلغاء</button>
          </div>}</td>
        </tr>)}
        {!orders.length&&<tr><td colSpan={6}>لا توجد أوامر إنتاج حتى الآن.</td></tr>}
      </tbody></table></div>
    </section>
    <div className="infoNote">تعرض القوائم حتى 120 BOM و150 أمر إنتاج، والمنتجات حتى 500 صنف. يلزم ترقيم صفحات قبل التشغيل على نطاق صناعي كبير.</div>
  </div>;
}
