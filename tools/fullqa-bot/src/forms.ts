import type { Page } from 'playwright';

const fieldValue = (name: string, type: string, run: string) => {
  const n = name.toLowerCase();
  if (type === 'email' || n.includes('email')) return `fullqa.${run}@example.test`;
  if (type === 'password' || n.includes('password')) return 'QaTest!2026Strong';
  if (n.includes('phone') || n.includes('mobile')) return '0500000000';
  if (n.includes('barcode')) return `${Date.now()}`.slice(-13).padStart(13, '6');
  if (n.includes('sku')) return `QA-${run}`;
  if (n.includes('price') || n.includes('amount')) return '12.50';
  if (n.includes('quantity') || n.includes('qty') || n.includes('stock')) return '10';
  return `FullQA ${run}`;
};

export async function fillVisibleForm(page: Page, formIndex = 0) {
  const run = Date.now().toString(36);
  const form = page.locator('form').nth(formIndex);
  const inputs = form.locator('input:visible');
  for (let i = 0; i < await inputs.count(); i++) {
    const el = inputs.nth(i);
    if (await el.isDisabled()) continue;
    const type = (await el.getAttribute('type')) ?? 'text';
    if (['hidden','submit','button','checkbox','radio','file'].includes(type)) continue;
    const name = (await el.getAttribute('name')) ?? (await el.getAttribute('id')) ?? '';
    await el.fill(fieldValue(name, type, run));
  }
  const selects = form.locator('select:visible');
  for (let i = 0; i < await selects.count(); i++) {
    const s = selects.nth(i);
    if (await s.isDisabled()) continue;
    const opts = await s.locator('option').evaluateAll(os => os.map(o => ({value:(o as HTMLOptionElement).value, disabled:(o as HTMLOptionElement).disabled})).filter(x => x.value && !x.disabled));
    if (opts[0]) await s.selectOption(opts[0].value);
  }
  return { form, run };
}
