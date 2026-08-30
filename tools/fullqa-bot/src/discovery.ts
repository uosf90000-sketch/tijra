import type { BrowserContext, Page } from 'playwright';
import type { DiscoveredPage } from './types.js';

export async function discoverApp(context: BrowserContext, baseUrl: string, maxPages = 80): Promise<DiscoveredPage[]> {
  const origin = new URL(baseUrl).origin;
  const queue = [baseUrl];
  const seen = new Set<string>();
  const out: DiscoveredPage[] = [];
  while (queue.length && seen.size < maxPages) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(400);
      const title = await page.title();
      const forms = await page.locator('form').count();
      const buttons = (await page.getByRole('button').allTextContents()).map(s => s.trim()).filter(Boolean).slice(0, 50);
      const hrefs = await page.locator('a[href]').evaluateAll((els) => els.map(a => (a as HTMLAnchorElement).href));
      const links = hrefs.filter(h => h.startsWith(origin));
      out.push({ url: page.url(), title, forms, buttons, links: [...new Set(links)].slice(0, 100) });
      for (const href of links) {
        const u = new URL(href); u.hash = '';
        const normalized = u.toString();
        if (!seen.has(normalized) && !queue.includes(normalized)) queue.push(normalized);
      }
    } catch {
      out.push({ url, title: '', forms: 0, buttons: [], links: [] });
    } finally {
      await page.close();
    }
  }
  return out;
}

export async function findRegistrationPage(page: Page, baseUrl: string) {
  const candidates = ['/register','/signup','/sign-up','/auth/register','/auth/signup'];
  for (const p of candidates) {
    try {
      const r = await page.goto(new URL(p, baseUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 12000 });
      if (r && r.status() < 400 && await page.locator('input[type=email], input[name*=email i]').count()) return page.url();
    } catch {}
  }
  return null;
}
