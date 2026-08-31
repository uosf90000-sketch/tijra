import fs from 'node:fs/promises';
import path from 'node:path';
import { request, type APIRequestContext } from 'playwright';
import type { QAResult } from '../types.js';

type AddResult = (r: Omit<QAResult, 'timestamp'>) => void;
type Account = { role:string; activity:string; email:string; statePath:string };
type Listing = { id:string; name:string; sku:string | null; barcode:string | null; quantity:number | string; price:number | string };
type Product = { id:string; name:string; sku:string | null; barcode:string | null; quantity:number | string; salePrice:number | string };

async function apiFromState(target: string, statePath: string) {
  const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
  return request.newContext({ baseURL:target, storageState:state });
}

async function json<T = any>(response: { json():Promise<unknown> }): Promise<any> {
  try { return await response.json() as T; }
  catch { return {}; }
}

function recordHttp(add:AddResult, args:{ id:string; module:string; expected:string; responseStatus:number; ok:boolean; actual?:string; url:string }) {
  add({ id:args.id, module:args.module, status:args.ok?'PASS':'FAIL', expected:args.expected, actual:args.actual ?? `HTTP ${args.responseStatus}`, url:args.url });
}

async function createListing(api:APIRequestContext, target:string, add:AddResult, input:{name:string;sku:string;barcode:string;price:number;quantity:number;minOrderQty:number}) {
  const r = await api.post('/api/marketplace/listings', { data:{ ...input, category:'FullQA', activity:'GROCERY', unit:'piece' } });
  const body = await json<{listing?:Listing; duplicate?:boolean; error?:string}>(r);
  recordHttp(add, { id:`TIJRA-PUBLISH-${input.sku}`, module:'Tijra/Marketplace', expected:'HTTP 201 and persisted listing', responseStatus:r.status(), ok:r.status()===201 && Boolean(body.listing?.id), actual:`HTTP ${r.status()} listing=${body.listing?.id ?? 'none'} duplicate=${body.duplicate ?? false}`, url:new URL('/api/marketplace/listings', target).toString() });
  return body.listing ?? null;
}

async function runLifecycle(target:string, add:AddResult, accounts:Account[], stamp:string) {
  const supplier = accounts.find(a=>a.role==='SUPPLIER');
  const retailer = accounts.find(a=>a.role==='RETAILER' && a.activity==='GROCERY');
  if (!supplier || !retailer) {
    add({ id:'TIJRA-E2E', module:'Tijra/E2E', status:'BLOCKED', expected:'supplier and retailer sessions', actual:'Required accounts were not created', url:target });
    return;
  }

  const seller = await apiFromState(target, supplier.statePath);
  const buyer = await apiFromState(target, retailer.statePath);
  try {
    const seed = stamp.replace(/[^a-z0-9]/gi,'').slice(-14);
    const specs = [
      { name:`FullQA A ${seed}`, sku:`FQA-A-${seed}`, barcode:`729${seed.slice(-9).padStart(9,'0')}`, price:12.5, quantity:50, minOrderQty:1, orderQty:10 },
      { name:`FullQA B ${seed}`, sku:`FQA-B-${seed}`, barcode:`730${seed.slice(-9).padStart(9,'0')}`, price:7.25, quantity:40, minOrderQty:1, orderQty:5 },
      { name:`FullQA C ${seed}`, sku:`FQA-C-${seed}`, barcode:`731${seed.slice(-9).padStart(9,'0')}`, price:3.5, quantity:60, minOrderQty:1, orderQty:20 },
    ];
    const listings: Listing[] = [];
    for (const spec of specs) {
      const listing = await createListing(seller, target, add, spec);
      if (listing) listings.push(listing);
    }
    if (listings.length !== specs.length) {
      add({ id:'TIJRA-E2E', module:'Tijra/E2E', status:'BLOCKED', expected:'3 listings', actual:`Only ${listings.length}/3 listings created`, url:target });
      return;
    }

    const duplicate = await seller.post('/api/marketplace/listings', { data:{ name:specs[0].name, sku:specs[0].sku, barcode:specs[0].barcode, category:'FullQA', activity:'GROCERY', unit:'piece', price:specs[0].price, quantity:specs[0].quantity, minOrderQty:1 } });
    const duplicateBody = await json<{duplicate?:boolean}>(duplicate);
    recordHttp(add, { id:'TIJRA-PUBLISH-IDEMPOTENT', module:'Tijra/Marketplace', expected:'HTTP 200 duplicate:true', responseStatus:duplicate.status(), ok:duplicate.status()===200 && duplicateBody.duplicate===true, actual:`HTTP ${duplicate.status()} duplicate=${duplicateBody.duplicate}`, url:new URL('/api/marketplace/listings', target).toString() });

    const orderResponse = await buyer.post('/api/marketplace/orders', { data:{ items:listings.map((listing,i)=>({ listingId:listing.id, quantity:specs[i].orderQty })) } });
    const orderBody = await json<{order?:{id:string;status:string;expectedTotal:number|string}}>(orderResponse);
    const order = orderBody.order;
    const expectedTotal = specs.reduce((sum,s)=>sum+s.price*s.orderQty,0);
    recordHttp(add, { id:'TIJRA-ORDER-CREATE', module:'Tijra/Orders', expected:`HTTP 201 total ${expectedTotal}`, responseStatus:orderResponse.status(), ok:orderResponse.status()===201 && Boolean(order?.id) && Math.abs(Number(order?.expectedTotal)-expectedTotal)<0.001, actual:`HTTP ${orderResponse.status()} order=${order?.id ?? 'none'} total=${order?.expectedTotal ?? 'none'}`, url:new URL('/api/marketplace/orders', target).toString() });
    if (!order?.id) return;

    for (let i=0;i<listings.length;i++) {
      const lookup = await seller.get(`/api/marketplace/listings?barcode=${encodeURIComponent(specs[i].barcode)}`);
      const lookupBody = await json<{listing?:Listing}>(lookup);
      const expected = specs[i].quantity-specs[i].orderQty;
      add({ id:`TIJRA-RESERVATION-${i+1}`, module:'Tijra/Reservation', status:lookup.status()===200 && Number(lookupBody.listing?.quantity)===expected?'PASS':'FAIL', expected:`listing quantity ${expected}`, actual:`HTTP ${lookup.status()} quantity=${lookupBody.listing?.quantity ?? 'none'}`, url:new URL(`/api/marketplace/listings?barcode=${specs[i].barcode}`, target).toString() });
    }

    const accept = await seller.patch(`/api/marketplace/orders/${order.id}/status`, { data:{ action:'ACCEPT' } });
    const acceptBody = await json<{order?:{status:string}}>(accept);
    recordHttp(add, { id:'TIJRA-ORDER-ACCEPT', module:'Tijra/Orders', expected:'HTTP 200 status ACCEPTED', responseStatus:accept.status(), ok:accept.status()===200 && acceptBody.order?.status==='ACCEPTED', actual:`HTTP ${accept.status()} status=${acceptBody.order?.status ?? 'none'}`, url:new URL(`/api/marketplace/orders/${order.id}/status`, target).toString() });

    const premature = await buyer.patch(`/api/marketplace/orders/${order.id}/status`, { data:{ action:'RECEIVE' } });
    add({ id:'TIJRA-RECEIVE-BEFORE-PICK', module:'Tijra/Picking', status:premature.status()===409?'PASS':'FAIL', expected:'HTTP 409 until picking is complete', actual:`HTTP ${premature.status()}${premature.ok() ? ' — order was receivable before picking completed' : ''}`, url:new URL(`/api/marketplace/orders/${order.id}/status`, target).toString() });
    if (premature.ok()) {
      add({ id:'TIJRA-E2E-PICKING-GATE', module:'Tijra/E2E', status:'FAIL', expected:'Accept → Picking complete → Receive', actual:'Receive succeeded immediately after Accept; cannot prove mandatory picking gate on this order', url:target });
      return;
    }

    let scannedTotal = 0;
    const requiredTotal = specs.reduce((sum,s)=>sum+s.orderQty,0);
    let pickingOkay = true;
    for (let i=0;i<specs.length;i++) {
      for (let n=1;n<=specs[i].orderQty;n++) {
        const pick = await seller.post(`/api/marketplace/orders/${order.id}/pick`, { data:{ barcode:specs[i].barcode } });
        const pickBody = await json<{item?:{scanned:number;required:number}}>(pick);
        scannedTotal++;
        const ok = pick.status()===200 && pickBody.item?.scanned===n && pickBody.item?.required===specs[i].orderQty;
        if (!ok) pickingOkay = false;
        if (n===1 || n===specs[i].orderQty) add({ id:`TIJRA-PICK-${i+1}-${n}`, module:'Tijra/Picking', status:ok?'PASS':'FAIL', expected:`${n}/${specs[i].orderQty}`, actual:`HTTP ${pick.status()} scanned=${pickBody.item?.scanned ?? 'none'} required=${pickBody.item?.required ?? 'none'} total=${scannedTotal}/${requiredTotal}`, url:new URL(`/api/marketplace/orders/${order.id}/pick`, target).toString() });
      }
    }
    add({ id:'TIJRA-PICK-35-35', module:'Tijra/Picking', status:pickingOkay && scannedTotal===requiredTotal?'PASS':'FAIL', expected:`${requiredTotal}/${requiredTotal} scans`, actual:`${scannedTotal}/${requiredTotal} executed`, url:new URL(`/api/marketplace/orders/${order.id}/pick`, target).toString() });

    const extraPick = await seller.post(`/api/marketplace/orders/${order.id}/pick`, { data:{ barcode:specs[0].barcode } });
    recordHttp(add, { id:'TIJRA-PICK-EXTRA-SCAN', module:'Tijra/Picking', expected:'HTTP 409 ITEM_ALREADY_COMPLETE', responseStatus:extraPick.status(), ok:extraPick.status()===409, url:new URL(`/api/marketplace/orders/${order.id}/pick`, target).toString() });
    const wrongPick = await seller.post(`/api/marketplace/orders/${order.id}/pick`, { data:{ barcode:`UNKNOWN-${seed}` } });
    recordHttp(add, { id:'TIJRA-PICK-WRONG-BARCODE', module:'Tijra/Picking', expected:'HTTP 409 BARCODE_NOT_IN_ORDER', responseStatus:wrongPick.status(), ok:wrongPick.status()===409, url:new URL(`/api/marketplace/orders/${order.id}/pick`, target).toString() });

    const receive = await buyer.patch(`/api/marketplace/orders/${order.id}/status`, { data:{ action:'RECEIVE' } });
    const receiveBody = await json<{order?:{status:string}}>(receive);
    recordHttp(add, { id:'TIJRA-RECEIVE', module:'Tijra/Receiving', expected:'HTTP 200 status RECEIVED', responseStatus:receive.status(), ok:receive.status()===200 && receiveBody.order?.status==='RECEIVED', actual:`HTTP ${receive.status()} status=${receiveBody.order?.status ?? 'none'}`, url:new URL(`/api/marketplace/orders/${order.id}/status`, target).toString() });
    if (!receive.ok()) return;

    const receiveAgain = await buyer.patch(`/api/marketplace/orders/${order.id}/status`, { data:{ action:'RECEIVE' } });
    recordHttp(add, { id:'TIJRA-DOUBLE-RECEIVE', module:'Tijra/Receiving', expected:'HTTP 409', responseStatus:receiveAgain.status(), ok:receiveAgain.status()===409, url:new URL(`/api/marketplace/orders/${order.id}/status`, target).toString() });

    const productsResponse = await buyer.get('/api/products');
    const productsBody = await json<{products?:Product[]}>(productsResponse);
    const receivedProducts = specs.map(spec=>productsBody.products?.find((p:Product)=>p.barcode===spec.barcode)).filter(Boolean) as Product[];
    add({ id:'TIJRA-INVENTORY-AFTER-RECEIVE', module:'Tijra/Inventory', status:receivedProducts.length===3 && receivedProducts.every((p,i)=>Number(p.quantity)===specs[i].orderQty)?'PASS':'FAIL', expected:'received quantities 10/5/20', actual:receivedProducts.map(p=>`${p.sku}:${p.quantity}`).join(', ') || 'No matching products', url:new URL('/api/products', target).toString() });

    if (receivedProducts[0]) {
      const invoice = `FQA-${seed}`;
      const sale = await buyer.post('/api/sales', { data:{ invoiceNumber:invoice, paymentMethod:'CASH', items:[{ productId:receivedProducts[0].id, quantity:1, unitPrice:Number(receivedProducts[0].salePrice) }] } });
      const saleBody = await json<{sale?:{id:string}}>(sale);
      recordHttp(add, { id:'TIJRA-POS-SALE', module:'Tijra/POS', expected:'HTTP 201 sale persisted', responseStatus:sale.status(), ok:sale.status()===201 && Boolean(saleBody.sale?.id), actual:`HTTP ${sale.status()} sale=${saleBody.sale?.id ?? 'none'}`, url:new URL('/api/sales', target).toString() });

      const duplicateSale = await buyer.post('/api/sales', { data:{ invoiceNumber:invoice, paymentMethod:'CASH', items:[{ productId:receivedProducts[0].id, quantity:1, unitPrice:Number(receivedProducts[0].salePrice) }] } });
      const duplicateSaleBody = await json<{duplicate?:boolean}>(duplicateSale);
      add({ id:'TIJRA-POS-IDEMPOTENT', module:'Tijra/POS', status:duplicateSale.status()===200 && duplicateSaleBody.duplicate===true?'PASS':'FAIL', expected:'duplicate:true without second stock decrement', actual:`HTTP ${duplicateSale.status()} duplicate=${duplicateSaleBody.duplicate}`, url:new URL('/api/sales', target).toString() });

      const productsAfterSale = await buyer.get('/api/products');
      const afterBody = await json<{products?:Product[]}>(productsAfterSale);
      const after = afterBody.products?.find((p:Product)=>p.id===receivedProducts[0].id);
      add({ id:'TIJRA-STOCK-AFTER-POS', module:'Tijra/Inventory', status:Number(after?.quantity)===specs[0].orderQty-1?'PASS':'FAIL', expected:`quantity ${specs[0].orderQty-1}`, actual:`quantity=${after?.quantity ?? 'none'}`, url:new URL('/api/products', target).toString() });
    }

    add({ id:'TIJRA-E2E', module:'Tijra/E2E', status:pickingOkay && receive.ok()?'PASS':'FAIL', expected:'Publish → Order → Accept → Pick → Receive → POS', actual:'Lifecycle executed with persisted state checks', url:target });
  } finally {
    await seller.dispose();
    await buyer.dispose();
  }
}

export async function runTijraAuthProfile(target: string, add: AddResult) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const password = process.env.QA_PASSWORD || 'QaTest!2026Strong';
  const stateDir = path.resolve('artifacts/states');
  await fs.mkdir(stateDir, { recursive: true });
  const roles = [
    { role: 'SUPPLIER', activity: 'OTHER' },
    { role: 'RETAILER', activity: 'GROCERY' },
    { role: 'BOTH', activity: 'GROCERY' },
    { role: 'RETAILER', activity: 'CAFE' },
    { role: 'RETAILER', activity: 'RESTAURANT' },
    { role: 'RETAILER', activity: 'ELECTRONICS' }
  ] as const;

  let firstEmail = '';
  const accounts: Account[] = [];
  for (const [index, item] of roles.entries()) {
    const email = `fullqa.${item.role.toLowerCase()}.${item.activity.toLowerCase()}.${stamp}.${index}@example.test`;
    if (!firstEmail) firstEmail = email;
    const api = await request.newContext({ baseURL: target });
    try {
      const response = await api.post('/api/auth/register', { data:{ name:`FullQA ${item.role}`, email, password, phone:'0500000000', businessName:`FullQA ${item.role} ${item.activity} ${stamp}`, businessType:item.role, businessActivity:item.activity, city:'Jeddah' } });
      const body = await response.text();
      const id = `TIJRA-REGISTER-${item.role}-${item.activity}`;
      if (response.status() === 201) {
        const state = await api.storageState();
        const statePath = path.join(stateDir, `${item.role.toLowerCase()}-${item.activity.toLowerCase()}.json`);
        await fs.writeFile(statePath, JSON.stringify(state, null, 2));
        accounts.push({ role:item.role, activity:item.activity, email, statePath });
        add({ id, module:'Tijra/Auth', status:'PASS', expected:'HTTP 201 and authenticated session', actual:`HTTP 201; state=${statePath}; email=${email}`, url:new URL('/api/auth/register', target).toString() });
      } else add({ id, module:'Tijra/Auth', status:'FAIL', expected:'HTTP 201', actual:`HTTP ${response.status()} ${body}`, url:new URL('/api/auth/register', target).toString() });
    } catch (e) {
      add({ id:`TIJRA-REGISTER-${item.role}-${item.activity}`, module:'Tijra/Auth', status:'FAIL', actual:String(e), url:new URL('/api/auth/register', target).toString() });
    } finally { await api.dispose(); }
  }

  if (firstEmail) {
    const api = await request.newContext({ baseURL: target });
    try {
      const duplicate = await api.post('/api/auth/register', { data:{ name:'FullQA Duplicate', email:firstEmail, password, businessName:'FullQA Duplicate', businessType:'RETAILER', businessActivity:'GROCERY', city:'Jeddah' } });
      add({ id:'TIJRA-DUPLICATE-EMAIL', module:'Tijra/Auth', status:duplicate.status()===409?'PASS':'FAIL', expected:'HTTP 409', actual:`HTTP ${duplicate.status()}`, url:new URL('/api/auth/register', target).toString() });
      const wrong = await api.post('/api/auth/login', { data:{ email:firstEmail, password:'definitely-wrong-password' } });
      add({ id:'TIJRA-WRONG-PASSWORD', module:'Tijra/Auth', status:wrong.status()===401?'PASS':'FAIL', expected:'HTTP 401', actual:`HTTP ${wrong.status()}`, url:new URL('/api/auth/login', target).toString() });
    } finally { await api.dispose(); }
  }

  if (process.env.QA_SKIP_WRITES !== 'true') await runLifecycle(target, add, accounts, stamp);
  else add({ id:'TIJRA-E2E', module:'Tijra/E2E', status:'NOT_EXECUTED', expected:'Full write lifecycle', actual:'Skipped because QA_SKIP_WRITES=true', url:target });
  return accounts;
}
