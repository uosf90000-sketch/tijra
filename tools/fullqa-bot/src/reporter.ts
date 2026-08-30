import fs from 'node:fs/promises';
import path from 'node:path';
import type { QAResult, DiscoveredPage } from './types.js';

export async function writeReport(target: string, build: unknown, pages: DiscoveredPage[], results: QAResult[]) {
  const dir = path.resolve('artifacts');
  await fs.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(':', '-');
  const summary = results.reduce<Record<string, number>>((a, r) => {
    a[r.status] = (a[r.status] ?? 0) + 1;
    return a;
  }, {});
  const payload = { target, build, generatedAt: new Date().toISOString(), summary, discoveredPages: pages, results };
  const jsonPath = path.join(dir, `fullqa-${stamp}.json`);
  await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2));
  const rows = results.map(r => `<tr><td>${r.id}</td><td>${r.module}</td><td>${r.status}</td><td>${escapeHtml(r.actual ?? '')}</td><td>${escapeHtml(r.url ?? '')}</td></tr>`).join('');
  const html = `<!doctype html><meta charset="utf-8"><title>FullQA Report</title><style>body{font-family:system-ui;margin:32px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px}th{text-align:left}</style><h1>FullQA Report</h1><p><b>Target:</b> ${escapeHtml(target)}</p><p><b>Summary:</b> ${escapeHtml(JSON.stringify(summary))}</p><table><thead><tr><th>ID</th><th>Module</th><th>Status</th><th>Actual</th><th>URL</th></tr></thead><tbody>${rows}</tbody></table>`;
  const htmlPath = path.join(dir, `fullqa-${stamp}.html`);
  await fs.writeFile(htmlPath, html);
  return { jsonPath, htmlPath, summary };
}

function escapeHtml(v: string) { return v.replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c] ?? c)); }
