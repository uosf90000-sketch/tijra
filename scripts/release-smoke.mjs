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
  assert(!ownerProductsPage.includes('href="/recipes"'), "grocery products page unexpectedly exposes recipes");

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
  assert(productsPage.includes('href="/recipes"'), "restaurant products page should expose recipe settings");
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

await waitForHealth();
await groceryAndStaffFlow();
await restaurantFlow();
await hardwareFlow();
await marketplaceFlow();
console.log("TIJRA release smoke passed: owner/staff, grocery, restaurant recipes/extras, hardware part lookup, marketplace order + receipt.");
