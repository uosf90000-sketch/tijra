import { test, expect } from '@playwright/test';

const target = process.env.TARGET_URL ?? 'http://localhost:3000';

test('target loads without server error', async ({ page }) => {
  const response = await page.goto(target, { waitUntil: 'domcontentloaded' });
  expect(response?.status() ?? 599).toBeLessThan(500);
});

test('health endpoint', async ({ request }) => {
  const r = await request.get(new URL('/api/health', target).toString());
  expect(r.status()).toBeLessThan(500);
});
