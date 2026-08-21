import {
  Boxes,
  Calculator,
  CircleDollarSign,
  PackageSearch,
  ReceiptText,
  ShoppingCart,
  Sparkles,
  Store,
  TrendingUp,
  TriangleAlert,
  UsersRound,
} from "lucide-react";

const stats = [
  { label: "مبيعات اليوم", value: "4,820 ر.س", note: "+8.4% عن أمس", icon: TrendingUp },
  { label: "الربح التقديري", value: "1,146 ر.س", note: "هامش 23.8%", icon: CircleDollarSign },
  { label: "قيمة المخزون", value: "38,540 ر.س", note: "612 صنفًا", icon: Boxes },
  { label: "مشتريات مقترحة", value: "2,740 ر.س", note: "31 صنفًا", icon: ShoppingCart },
];

const shortage = [
  { name: "مياه 330 مل", left: "2 كرتون", days: "يكفي يومًا واحدًا", action: "اطلب 8" },
  { name: "بيبسي 330 مل", left: "21 حبة", days: "يكفي يومين", action: "اطلب 3" },
  { name: "حليب كامل الدسم", left: "14 حبة", days: "يكفي يومين", action: "اطلب 2" },
];

const modules = [
  { title: "المخزون", description: "الأصناف والكميات وحركة المخزون", icon: Boxes },
  { title: "الموردون", description: "الأسعار والطلبات والمقارنة", icon: Store },
  { title: "المحاسبة", description: "المبيعات والمصاريف والأرباح", icon: Calculator },
  { title: "الفواتير", description: "المشتريات ومطابقة الاستلام", icon: ReceiptText },
  { title: "الموظفون والرواتب", description: "الرواتب والبدلات والخصومات", icon: UsersRound },
  { title: "المشتريات الذكية", description: "اقتراح ما تحتاجه ومتى تشتريه", icon: Sparkles },
];

export default function Home() {
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">ت</div>
          <div>
            <strong>تِجرا</strong>
            <span>إدارة تجارتك بذكاء</span>
          </div>
        </div>

        <nav>
          <a className="navItem active" href="#"><PackageSearch size={19} />الرئيسية</a>
          <a className="navItem" href="#inventory"><Boxes size={19} />المخزون</a>
          <a className="navItem" href="#suppliers"><Store size={19} />الموردون والمشتريات</a>
          <a className="navItem" href="#accounting"><Calculator size={19} />المحاسبة</a>
          <a className="navItem" href="#payroll"><UsersRound size={19} />الموظفون والرواتب</a>
        </nav>

        <div className="sidebarFoot">
          <span>تموينات النخيل</span>
          <small>حساب تجريبي</small>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <span className="eyebrow">الخميس، 21 أغسطس</span>
            <h1>مساء الخير 👋</h1>
            <p>هذه أهم الأشياء التي تحتاج انتباهك اليوم.</p>
          </div>
          <button className="primaryButton"><Sparkles size={18} /> جهّز مشتريات اليوم</button>
        </header>

        <section className="statsGrid">
          {stats.map(({ label, value, note, icon: Icon }) => (
            <article className="statCard" key={label}>
              <div className="iconBox"><Icon size={20} /></div>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{note}</small>
            </article>
          ))}
        </section>

        <section className="mainGrid">
          <article className="panel aiPanel">
            <div className="panelHead">
              <div>
                <span className="eyebrow">اقتراح تِجرا</span>
                <h2>طلبية اليوم جاهزة</h2>
              </div>
              <div className="spark"><Sparkles size={22} /></div>
            </div>

            <p className="lead">حللنا سرعة البيع والكميات الحالية، ونقترح طلب 31 صنفًا بقيمة 2,740 ر.س.</p>

            <div className="saving">
              <span>التوفير المتوقع بعد مقارنة الموردين</span>
              <strong>186 ر.س</strong>
            </div>

            <div className="actions">
              <button className="primaryButton">مراجعة الطلبية</button>
              <button className="ghostButton">عرض التفاصيل</button>
            </div>
          </article>

          <article className="panel">
            <div className="panelHead">
              <div>
                <span className="eyebrow">تنبيه المخزون</span>
                <h2>أصناف ستنفد قريبًا</h2>
              </div>
              <div className="warning"><TriangleAlert size={22} /></div>
            </div>

            <div className="shortageList">
              {shortage.map((item) => (
                <div className="shortageItem" key={item.name}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.left} · {item.days}</span>
                  </div>
                  <button>{item.action}</button>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="modules" id="inventory">
          <div className="sectionTitle">
            <div>
              <span className="eyebrow">كل أعمال محلك</span>
              <h2>من مكان واحد</h2>
            </div>
            <span className="muted">التوصيل يبقى بين التاجر والمورد مباشرة</span>
          </div>

          <div className="moduleGrid">
            {modules.map(({ title, description, icon: Icon }) => (
              <article className="moduleCard" key={title}>
                <div className="moduleIcon"><Icon size={22} /></div>
                <strong>{title}</strong>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
