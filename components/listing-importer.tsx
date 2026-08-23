"use client";

import { FileSpreadsheet, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { ChangeEvent, useMemo, useState } from "react";

type Row = {
  name: string;
  sku?: string;
  barcode?: string;
  category?: string;
  unit: string;
  price: number;
  quantity: number;
  minOrderQty: number;
};

const activity = "GROCERY";

function splitLine(line: string, delimiter: string) {
  const result: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      result.push(current.trim()); current = "";
    } else current += char;
  }
  result.push(current.trim());
  return result;
}

function parseText(text: string): Row[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((line) => line.trim());
  if (!lines.length) return [];
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const first = splitLine(lines[0], delimiter).map((value) => value.toLowerCase());
  const hasHeader = first.some((value) => ["name", "اسم", "المنتج", "price", "السعر", "barcode", "باركود"].includes(value));
  const body = hasHeader ? lines.slice(1) : lines;

  const indexOf = (...names: string[]) => first.findIndex((value) => names.includes(value));
  const indexes = hasHeader ? {
    name: indexOf("name", "اسم", "المنتج", "اسم المنتج"),
    sku: indexOf("sku", "رمز", "رمز الصنف"),
    barcode: indexOf("barcode", "باركود", "الباركود"),
    category: indexOf("category", "التصنيف", "الفئة"),
    unit: indexOf("unit", "الوحدة"),
    price: indexOf("price", "السعر"),
    quantity: indexOf("quantity", "qty", "الكمية"),
    minOrderQty: indexOf("minorderqty", "minimum", "الحد الأدنى", "اقل كمية"),
  } : { name: 0, sku: 1, barcode: 2, category: 3, unit: 4, price: 5, quantity: 6, minOrderQty: 7 };

  return body.map((line) => {
    const cells = splitLine(line, delimiter);
    const get = (index: number) => index >= 0 ? (cells[index] || "").trim() : "";
    return {
      name: get(indexes.name),
      sku: get(indexes.sku) || undefined,
      barcode: get(indexes.barcode) || undefined,
      category: get(indexes.category) || undefined,
      unit: get(indexes.unit) || "حبة",
      price: Number(get(indexes.price) || 0),
      quantity: Number(get(indexes.quantity) || 0),
      minOrderQty: Number(get(indexes.minOrderQty) || 1),
    };
  }).filter((row) => row.name.length >= 2 && row.price > 0 && row.quantity >= 0 && row.minOrderQty > 0);
}

export function ListingImporter() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const rows = useMemo(() => parseText(text), [text]);

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setText(await file.text());
  }

  async function importRows() {
    setLoading(true);
    setMessage("");
    let success = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        const response = await fetch("/api/marketplace/listings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...row, activity }),
        });
        if (response.ok) success += 1;
        else failed += 1;
      } catch { failed += 1; }
    }
    setLoading(false);
    setMessage(`تمت إضافة ${success} منتج${failed ? ` · تعذر ${failed}` : ""}.`);
    router.refresh();
  }

  return (
    <section className="panel workflowPanel">
      <div className="panelHeader"><div><span className="eyebrow"><FileSpreadsheet size={14} /> استيراد جماعي</span><h2>Excel / CSV</h2></div></div>
      <p className="panelLead">ارفع CSV، أو انسخ الصفوف من Excel والصقها هنا مباشرة. الأعمدة: اسم المنتج، SKU، باركود، التصنيف، الوحدة، السعر، الكمية، الحد الأدنى.</p>
      <label className="fileDrop">
        <Upload size={20} />
        <strong>اختيار ملف CSV</strong>
        <span>أو صدّر ملف Excel بصيغة CSV</span>
        <input type="file" accept=".csv,text/csv" onChange={readFile} />
      </label>
      <label className="field workflowTextareaLabel">
        <span>أو الصق من Excel</span>
        <textarea value={text} onChange={(event) => setText(event.target.value)} rows={9} placeholder={'قودي تونة بالزيت 185 جم\tSKU-10\t628...\tمعلبات\tكرتون\t85\t40\t2'} />
      </label>
      <div className="importSummary"><strong>{rows.length}</strong><span>صف صالح للاستيراد</span></div>
      <button className="button primary" type="button" onClick={importRows} disabled={loading || !rows.length}>{loading ? "جاري الاستيراد..." : `استيراد ${rows.length} منتج`}</button>
      {message ? <div className="infoNote">{message}</div> : null}
    </section>
  );
}
