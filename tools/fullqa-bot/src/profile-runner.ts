import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import type { QAResult, QAStatus } from './types.js';

type Step =
  | { type:'goto'; path:string }
  | { type:'fill'; selector:string; value:string }
  | { type:'click'; selector:string }
  | { type:'select'; selector:string; value:string }
  | { type:'wait'; ms:number }
  | { type:'expectText'; selector:string; text:string }
  | { type:'expectUrl'; contains:string }
  | { type:'screenshot'; name:string };

type Workflow = { id:string; module?:string; steps:Step[] };
type Profile = { name:string; workflows:Workflow[] };

function expand(input: string, vars: Record<string,string>) {
  return input.replace(/\$\{([A-Z0-9_]+)\}/g, (_, key) => vars[key] ?? `\${${key}}`);
}

export async function runDeclarativeProfile(target: string, profileFile: string, add: (r: Omit<QAResult,'timestamp'>) => void) {
  const raw = await fs.readFile(profileFile, 'utf8');
  const profile = JSON.parse(raw) as Profile;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  const vars: Record<string,string> = {
    RUN_ID: runId,
    EMAIL: `fullqa.${runId}@example.test`,
    PASSWORD: process.env.QA_PASSWORD || 'QaTest!2026Strong',
    TARGET_URL: target
  };
  const browser = await chromium.launch({ headless: process.env.QA_HEADLESS !== 'false' });
  const context = await browser.newContext({ ignoreHTTPSErrors:true });

  for (const workflow of profile.workflows ?? []) {
    const page = await context.newPage();
    let status: QAStatus = 'PASS';
    let actual = 'Completed';
    try {
      for (const step of workflow.steps) {
        if (step.type === 'goto') await page.goto(new URL(expand(step.path, vars), target).toString(), { waitUntil:'domcontentloaded', timeout:30000 });
        else if (step.type === 'fill') await page.locator(expand(step.selector, vars)).fill(expand(step.value, vars));
        else if (step.type === 'click') await page.locator(expand(step.selector, vars)).click();
        else if (step.type === 'select') await page.locator(expand(step.selector, vars)).selectOption(expand(step.value, vars));
        else if (step.type === 'wait') await page.waitForTimeout(step.ms);
        else if (step.type === 'expectText') {
          const text = await page.locator(expand(step.selector, vars)).innerText();
          if (!text.includes(expand(step.text, vars))) throw new Error(`Expected text ${step.text}, got ${text}`);
        } else if (step.type === 'expectUrl') {
          if (!page.url().includes(expand(step.contains, vars))) throw new Error(`Expected URL containing ${step.contains}, got ${page.url()}`);
        } else if (step.type === 'screenshot') {
          const dir = path.resolve('artifacts/screenshots');
          await fs.mkdir(dir, { recursive:true });
          await page.screenshot({ path:path.join(dir, `${workflow.id}-${expand(step.name, vars)}.png`), fullPage:true });
        }
      }
    } catch (e) {
      status = 'FAIL';
      actual = String(e);
      const dir = path.resolve('artifacts/screenshots');
      await fs.mkdir(dir, { recursive:true });
      await page.screenshot({ path:path.join(dir, `${workflow.id}-failure.png`), fullPage:true }).catch(()=>{});
    }
    add({ id:workflow.id, module:workflow.module || profile.name, status, actual, url:page.url() || target });
    await page.close();
  }

  await context.close();
  await browser.close();
}
