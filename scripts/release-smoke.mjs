const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, { method = "GET", cookie, body, redirect = "follow" } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    redirect,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  return { response, text, data, cookie: response.headers.get("set-cookie")?.split(";")[0] || null };
}

async function expectJson(path, options, status) {
  const result = await request(path, options);
  assert(result.response.status === status, `${options?.method || "GET"} ${path}: expected ${status}, got ${result.response.status}. ${result.text.slice(0, 400)}`);
  return result;
}

async function waitForHealth() {
  let last = "";
  for (let attempt = 0; attempt < 45; attempt += 1) {
    try {
      const result = await request("/api/health");
      if (result.response.ok) return;
      last = `${result.response.status} ${result.text}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`App did not become healthy: ${last}`);
}

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function register({ activity, businessType = "RETAILER", label }) {
  const id = unique(label);
  const email = `${id}@smoke.tijra.test`;
  const result = await expectJson("/api/auth/register", {
    method: "POST",
    body: {
      name: `Owner ${label}`,
      email,
      password: "OwnerSmoke123!",
      businessName: `Smoke ${label}`,
      businessType,
      businessActivity: activity,
      city: "Jeddah",
    },
  }, 201);
  assert(result.cookie, `register ${label}: session cookie missing`);
  return { cookie: result.cookie, email, business: result.data.business };
}

async function createProduct(cookie, input) {
  const result = await expectJson("/api/products", { method: "POST", cookie, body: input }, 201);
  return result.data.product;
}

async function products(cookie) {
  const result = await expectJson("/api/products", { cookie }, 200);
  return result.data.products;
}

async function html(cookie, path) {
  const result = await request(path, { cookie, redirect: "manual" });
  assert(result.response.status === 200, `${path}: expected 200, got ${result.response.status}`);
  return result.text;
}

async function groceryAndStaffFlow() {
  const owner = await register({ activity: "GROCERY", label: "grocery" });
  const grocery = await createProduct(owner.cookie, {
    name: "مياه اختبار الإطلاق",
    barcode: unique("barcode"),
    category: "مشروبات",
    unit: "حبة",
    salePrice: 5,
    averageCost: 2,
    quantity: 10,
    reorderPoint: 2,
    targetCoverageDays: 7,
  });

  const recipesDenied = await request("/api/recipes", {
    method: "POST",
    cookie: owner.cookie,
    body: { saleProductId: grocery.id, ingredientName: "مكوّن غير مسموح", quantity: 1, unit: "حبة" },
  });
  assert(recipesDenied.response.status === 403, `grocery recipes should be forbidden, got ${recipesDenied.response.status}`);

  const ownerProductsPage = await html(owner.cookie, "/products");
  assert(!ownerProductsPage.includes("المكونات والإضافات"), "grocery products page unexpectedly exposes recipe settings");

  const staffEmail = `${unique("cashier")}@smoke.tijra.test`;
  await expectJson("/api/employees", {
    method: "POST",
    cookie: owner.cookie,
    body: {
      name: "كاشير اختبار الإطلاق",
      jobTitle: "كاشير",
      baseSalary: 3000,
      defaultAllowance: 0,
      createAccount: true,
      accountEmail: staffEmail,
      temporaryPassword: "CashierSmoke123!",
      permissions: ["CASHIER"],
    },
  }, 201);

  const login = await expectJson("/api/auth/login", {
    method: "POST",
    body: { email: staffEmail, password: "CashierSmoke123!" },
  }, 200);
  assert(login.cookie, "cashier login cookie missing");

  const cashierPage = await html(login.cookie, "/sales");
  assert(cashierPage.includes("امسح الباركود"), "grocery cashier did not render barcode experience");

  const analytics = await request("/sales/analytics", { cookie: login.cookie, redirect: "manual" });
  if ([302, 303, 307, 308].includes(analytics.response.status)) {
    const location = analytics.response.headers.get("location") || "";
    assert(location.includes("/sales"), `cashier analytics redirected to unexpected location: ${location}`);
  } else {
    assert(analytics.response.status === 200, `cashier analytics expected redirect semantics, got ${analytics.response.status}`);
    assert(!analytics.text.includes("إجمالي المبيعات") && !analytics.text.includes("مجمل الربح"), "cashier analytics response leaked owner metrics");
    assert(analytics.text.includes("/sales") || analytics.text.includes("NEXT_REDIRECT") || analytics.text.includes("refresh"), "cashier analytics response did not contain redirect semantics");
  }

  const staffProducts = await request("/api/products", { cookie: login.cookie });
  assert(staffProducts.response.status === 403, `cashier should not read inventory API, got ${staffProducts.response.status}`);

  await expectJson("/api/sales", {
    method: "POST",
    cookie: login.cookie,
    body: {
      paymentMethod: "CASH",
      invoiceNumber: unique("GROCERY"),
      items: [{ productId: grocery.id, quantity: 2, unitPrice: 5 }],
    },
  }, 201);

  const after = await products(owner.cookie);
  const soldProduct = after.find((item) => item.id === grocery.id);
  assert(Number(soldProduct?.quantity) === 8, `grocery stock expected 8, got ${soldProduct?.quantity}`);
}

async function restaurantFlow() {
  const owner = await register({ activity: "RESTAURANT", label: "restaurant" });
  const beans = await createProduct(owner.cookie, {
    name: "بن اختبار الإطلاق",
    category: "مكونات",
    unit: "غرام",
    salePrice: 0,
    averageCost: 0.05,
    quantity: 1000,
    reorderPoint: 100,
    targetCoverageDays: 7,
  });
  const syrup = await createProduct(owner.cookie, {
    name: "سيرب اختبار الإطلاق",
    category: "مكونات",
    unit: "مل",
    salePrice: 0,
    averageCost: 0.02,
    quantity: 100,
    reorderPoint: 10,
    targetCoverageDays: 7,
  });
  const coffee = await createProduct(owner.cookie, {
    name: "قهوة اليوم اختبار الإطلاق",
    category: "قهوة",
    unit: "حبة",
    salePrice: 15,
    averageCost: 0,
    quantity: 0,
    reorderPoint: 0,
    targetCoverageDays: 7,
  });

  await expectJson("/api/recipes", {
    method: "POST",
    cookie: owner.cookie,
    body: {
      saleProductId: coffee.id,
      ingredientProductId: beans.id,
      quantity: 18,
      unit: "غرام",
      canRemove: false,
      canExtra: false,
      extraPrice: 0,
      yieldPercent: 100,
    },
  }, 200);

  const extra = await expectJson("/api/recipes", {
    method: "POST",
    cookie: owner.cookie,
    body: {
      saleProductId: coffee.id,
      ingredientProductId: syrup.id,
      quantity: 10,
      unit: "مل",
      canRemove: false,
      canExtra: true,
      extraPrice: 2,
      yieldPercent: 100,
    },
  }, 200);

  const productsPage = await html(owner.cookie, "/products");
  assert(productsPage.includes("المكونات والإضافات"), "restaurant products page should expose recipe settings");
  const cashierPage = await html(owner.cookie, "/sales");
  assert(cashierPage.includes("اختر المنتج من الصور"), "restaurant cashier did not render image-menu experience");
  assert(!cashierPage.includes("18 غرام"), "cashier page leaked recipe quantity details");

  await expectJson("/api/sales", {
    method: "POST",
    cookie: owner.cookie,
    body: {
      paymentMethod: "CARD",
      invoiceNumber: unique("REST-NO-EXTRA"),
      items: [{ productId: coffee.id, quantity: 1, unitPrice: 15 }],
    },
  }, 201);

  let current = await products(owner.cookie);
  assert(Number(current.find((item) => item.id === beans.id)?.quantity) === 982, "restaurant base ingredient was not deducted by 18g");
  assert(Number(current.find((item) => item.id === syrup.id)?.quantity) === 100, "optional extra was deducted even though cashier did not select it");

  await expectJson("/api/sales", {
    method: "POST",
    cookie: owner.cookie,
    body: {
      paymentMethod: "CARD",
      invoiceNumber: unique("REST-WITH-EXTRA"),
      items: [{
        productId: coffee.id,
        quantity: 1,
        unitPrice: 15,
        adjustments: [{ componentId: extra.data.component.id, multiplier: 2 }],
      }],
    },
  }, 201);

  current = await products(owner.cookie);
  assert(Number(current.find((item) => item.id === beans.id)?.quantity) === 964, "second restaurant sale did not deduct base ingredient");
  assert(Number(current.find((item) => item.id === syrup.id)?.quantity) === 90, "selected optional extra did not deduct 10ml");
}

async function hardwareFlow() {
  const owner = await register({ activity: "HARDWARE", label: "parts" });
  await createProduct(owner.cookie, {
    name: "فلتر زيت اختبار الإطلاق",
    sku: "90915-YZZE1",
    category: "قطع غيار",
    unit: "حبة",
    salePrice: 25,
    averageCost: 12,
    quantity: 4,
    reorderPoint: 1,
    targetCoverageDays: 7,
  });
  const cashierPage = await html(owner.cookie, "/sales");
  assert(cashierPage.includes("اكتب رقم القطعة"), "hardware cashier did not render part-number lookup experience");
  assert(cashierPage.includes("90915-YZZE1"), "hardware cashier did not include part number in rendered catalog data");
}

async function marketplaceFlow() {
  const supplier = await register({ activity: "GROCERY", businessType: "SUPPLIER", label: "supplier" });
  const buyer = await register({ activity: "GROCERY", businessType: "RETAILER", label: "buyer" });

  const listing = await expectJson("/api/marketplace/listings", {
    method: "POST",
    cookie: supplier.cookie,
    body: {
      name: "مناديل سوق اختبار الإطلاق",
      sku: unique("SUP-SKU"),
      barcode: unique("SUP-BAR"),
      category: "مستهلكات",
      activity: "GROCERY",
      unit: "كرتون",
      price: 20,
      quantity: 50,
      minOrderQty: 2,
    },
  }, 201);

  const orderResult = await expectJson("/api/marketplace/orders", {
    method: "POST",
    cookie: buyer.cookie,
    body: { items: [{ listingId: listing.data.listing.id, quantity: 5 }] },
  }, 201);
  const orderId = orderResult.data.order.id;

  await expectJson(`/api/marketplace/orders/${orderId}/status`, {
    method: "PATCH",
    cookie: supplier.cookie,
    body: { action: "ACCEPT" },
  }, 200);

  await expectJson(`/api/marketplace/orders/${orderId}/status`, {
    method: "PATCH",
    cookie: buyer.cookie,
    body: { action: "RECEIVE" },
  }, 200);

  const buyerProducts = await products(buyer.cookie);
  const received = buyerProducts.find((item) => item.name === "مناديل سوق اختبار الإطلاق");
  assert(received && Number(received.quantity) === 5, `marketplace receipt expected 5 cartons, got ${received?.quantity}`);

  const supplierProducts = await products(supplier.cookie);
  const reserved = supplierProducts.find((item) => item.name === "مناديل سوق اختبار الإطلاق");
  assert(reserved && Number(reserved.quantity) === 45, `supplier stock expected 45 after reservation, got ${reserved?.quantity}`);
}

async function highVolumeInventoryAndAccountingFlow() {
  const owner = await register({ activity: "GROCERY", label: "stress" });

  // Seed a realistic catalogue: many products, barcodes, reorder points and stock levels.
  const seeded = [];
  for (let index = 1; index <= 60; index += 1) {
    seeded.push(await createProduct(owner.cookie, {
      name: `منتج ضغط اختبار ${String(index).padStart(2, "0")}`,
      barcode: `628${String(index).padStart(10, "0")}`,
      category: index % 3 === 0 ? "مشروبات" : index % 3 === 1 ? "مواد غذائية" : "منظفات",
      unit: "حبة",
      salePrice: 4 + index,
      averageCost: 2 + index / 2,
      quantity: 100 + index,
      reorderPoint: 10,
      targetCoverageDays: 14,
    }));
  }

  const stockPage = await html(owner.cookie, "/inventory");
  assert(stockPage.includes("المخزون"), "inventory page did not render for a populated catalogue");
  const catalog = await products(owner.cookie);
  assert(catalog.length >= 60, `high-volume inventory expected at least 60 products, got ${catalog.length}`);

  // Stress checkout with many different lines in one transaction.
  const saleItems = seeded.slice(0, 20).map((product, index) => ({
    productId: product.id,
    quantity: (index % 3) + 1,
    unitPrice: Number(product.salePrice),
  }));
  await expectJson("/api/sales", {
    method: "POST",
    cookie: owner.cookie,
    body: {
      paymentMethod: "CARD",
      invoiceNumber: unique("STRESS-SALE"),
      items: saleItems,
    },
  }, 201);

  const afterSale = await products(owner.cookie);
  for (let index = 0; index < saleItems.length; index += 1) {
    const expected = 100 + (index + 1) - saleItems[index].quantity;
    const actual = Number(afterSale.find((product) => product.id === saleItems[index].productId)?.quantity);
    assert(actual === expected, `stock mismatch after multi-line sale for product ${index + 1}: expected ${expected}, got ${actual}`);
  }

  // Accounting stress: several independent expenses must aggregate correctly.
  const expenseAmounts = [1250, 349.5, 780, 2100, 95.75];
  for (const [index, amount] of expenseAmounts.entries()) {
    await expectJson("/api/expenses", {
      method: "POST",
      cookie: owner.cookie,
      body: {
        category: index % 2 ? "تشغيل" : "إيجار ومرافق",
        description: `مصروف اختبار معاملة ${index + 1}`,
        amount,
      },
    }, 201);
  }

  const expenses = await expectJson("/api/expenses", { cookie: owner.cookie }, 200);
  const expectedExpenseTotal = expenseAmounts.reduce((sum, amount) => sum + amount, 0);
  const actualExpenseTotal = expenses.data.expenses
    .filter((expense) => String(expense.description || "").includes("مصروف اختبار معاملة"))
    .reduce((sum, expense) => sum + Number(expense.amount), 0);
  assert(Math.abs(actualExpenseTotal - expectedExpenseTotal) < 0.001, `expense aggregation mismatch: expected ${expectedExpenseTotal}, got ${actualExpenseTotal}`);

  const accountingPage = await html(owner.cookie, "/accounting");
  assert(accountingPage.includes("المحاسبة"), "accounting page did not render after complex transactions");
  assert(accountingPage.includes("مصروف اختبار معاملة"), "accounting page did not show recent expense activity");

  const staffIds = [];
  for (let index = 1; index <= 3; index += 1) {
    const employee = await expectJson("/api/employees", {
      method: "POST",
      cookie: owner.cookie,
      body: {
        name: `موظف محاسبة اختبار ${index}`,
        jobTitle: index === 1 ? "مدير" : "موظف",
        baseSalary: 4500 + index * 500,
        defaultAllowance: 500,
        createAccount: false,
        permissions: ["ACCOUNTING"],
      },
    }, 201);
    staffIds.push(employee.data.employee.id);
  }

  const payroll = await expectJson("/api/payroll/calculate", {
    method: "POST",
    cookie: owner.cookie,
    body: {
      employees: staffIds.map((employeeId, index) => ({
        employeeId,
        baseSalary: 4500 + (index + 1) * 500,
        allowances: 500,
        deductions: index === 1 ? 250 : 0,
        advances: index === 2 ? 400 : 0,
      })),
    },
  }, 200);
  assert(payroll.data.items.length === 3, `payroll expected 3 employees, got ${payroll.data.items.length}`);
  assert(Number(payroll.data.summary.totalNet) > 0, "payroll net total should be positive");
}

await waitForHealth();
await groceryAndStaffFlow();
await restaurantFlow();
await hardwareFlow();
await marketplaceFlow();
await highVolumeInventoryAndAccountingFlow();
console.log("TIJRA release smoke passed: owner/staff, grocery barcode cashier, restaurant recipes/extras, hardware part lookup, marketplace order + receipt, 60-product inventory stress, multi-line sale, expenses, accounting, and payroll calculation.");
