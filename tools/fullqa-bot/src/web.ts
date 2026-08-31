import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { buildFullQaPrompt } from './prompt.js';

type Job = {
  id: string;
  target: string;
  profile: string;
  status: 'queued' | 'running' | 'passed' | 'failed';
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number | null;
  log: string[];
};

const port = Number(process.env.PORT || 3000);
const jobs = new Map<string, Job>();
const maxLogLines = 1500;

function send(res: http.ServerResponse, status: number, body: unknown, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : String(body));
}

async function readJson(req: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

function normalizeUrls(raw: unknown) {
  const source = Array.isArray(raw) ? raw : String(raw || '').split(/\r?\n|,/);
  const urls: string[] = [];
  for (const value of source) {
    const text = String(value).trim();
    if (!text) continue;
    try {
      const url = new URL(text);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      urls.push(url.toString().replace(/\/$/, ''));
    } catch {}
  }
  return [...new Set(urls)];
}

function startJob(target: string, profile: string) {
  const id = randomUUID();
  const job: Job = { id, target, profile, status: 'queued', log: [] };
  jobs.set(id, job);

  const child = spawn(process.execPath, ['--import', 'tsx', 'src/cli.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TARGET_URL: target,
      QA_PROFILE: profile,
      QA_HEADLESS: 'true',
      QA_ALLOW_WRITES: process.env.QA_ALLOW_WRITES || 'true',
    },
  });

  job.status = 'running';
  job.startedAt = new Date().toISOString();
  const append = (chunk: Buffer) => {
    const lines = chunk.toString('utf8').split(/\r?\n/).filter(Boolean);
    job.log.push(...lines);
    if (job.log.length > maxLogLines) job.log.splice(0, job.log.length - maxLogLines);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  child.on('error', (error) => {
    job.log.push(String(error));
    job.status = 'failed';
    job.finishedAt = new Date().toISOString();
  });
  child.on('close', (code) => {
    job.exitCode = code;
    job.status = code === 0 ? 'passed' : 'failed';
    job.finishedAt = new Date().toISOString();
  });
  return job;
}

const html = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FullQA Bot</title><style>
:root{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color-scheme:dark}body{margin:0;background:#07111f;color:#eaf2ff}.wrap{max-width:960px;margin:auto;padding:28px}.hero{padding:24px;border:1px solid #223553;border-radius:22px;background:#0b1729}.hero h1{margin:0 0 8px;font-size:32px}.muted{color:#9db0cc}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px}.full{grid-column:1/-1}label{display:block;font-weight:700;margin-bottom:7px}input,textarea,select{box-sizing:border-box;width:100%;padding:13px;border-radius:12px;border:1px solid #2b4165;background:#081322;color:#fff}textarea{min-height:120px;resize:vertical}button{padding:12px 17px;border:0;border-radius:12px;font-weight:800;cursor:pointer}.primary{background:#eaf2ff;color:#07111f}.secondary{background:#173253;color:#fff}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.panel{margin-top:18px;padding:18px;border-radius:18px;background:#0b1729;border:1px solid #223553}.job{padding:12px;border-bottom:1px solid #223553}.job:last-child{border-bottom:0}pre{white-space:pre-wrap;word-break:break-word;max-height:460px;overflow:auto;background:#050b13;padding:14px;border-radius:12px}.badge{display:inline-block;padding:4px 8px;border-radius:999px;background:#173253}.ok{background:#163d2f}.bad{background:#4a2027}@media(max-width:700px){.grid{grid-template-columns:1fr}.full{grid-column:auto}.wrap{padding:16px}.hero h1{font-size:27px}}
</style></head><body><div class="wrap"><section class="hero"><h1>FullQA Bot</h1><div class="muted">أضف رابط تطبيق واحد أو عدة تطبيقات. ولّد برومبت اختبار شامل أو شغّل الاختبار الوظيفي مباشرة.</div>
<div class="grid"><div><label>اسم التطبيق/المشروع</label><input id="name" placeholder="مثال: Tijra"></div><div><label>Profile</label><select id="profile"><option value="generic">عام</option><option value="tijra">Tijra</option></select></div><div class="full"><label>روابط التطبيقات — رابط بكل سطر</label><textarea id="urls" placeholder="https://app-one.example.com\nhttps://app-two.example.com"></textarea></div><div class="full"><label>ملاحظات أو ميزات خاصة</label><textarea id="notes" placeholder="مثال: يوجد مورد وتاجر، باركود، كاميرا، دفع..."></textarea></div></div>
<div class="actions"><button class="primary" onclick="generatePrompt()">توليد برومبت شامل</button><button class="secondary" onclick="runQa()">تشغيل QA على الروابط</button></div></section>
<section id="promptPanel" class="panel" hidden><h2>برومبت الاختبار</h2><button class="secondary" onclick="copyPrompt()">نسخ البرومبت</button><pre id="prompt"></pre></section>
<section class="panel"><h2>عمليات الاختبار</h2><div id="jobs" class="muted">لا توجد عمليات بعد.</div></section></div>
<script>
const el=id=>document.getElementById(id);function payload(){return {appName:el('name').value,urls:el('urls').value,notes:el('notes').value,profile:el('profile').value}}
async function generatePrompt(){const r=await fetch('/api/prompt',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload())});const d=await r.json();el('prompt').textContent=d.prompt||d.error;el('promptPanel').hidden=false}
async function copyPrompt(){await navigator.clipboard.writeText(el('prompt').textContent)}
async function runQa(){const r=await fetch('/api/run',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload())});const d=await r.json();if(d.error)alert(d.error);refreshJobs()}
async function refreshJobs(){const r=await fetch('/api/jobs');const d=await r.json();const rows=d.jobs||[];el('jobs').innerHTML=rows.length?rows.map(j=>'<div class="job"><b>'+escapeHtml(j.target)+'</b> <span class="badge '+(j.status==='passed'?'ok':j.status==='failed'?'bad':'')+'">'+j.status+'</span><div class="muted">'+j.profile+' · '+(j.startedAt||'')+'</div><details><summary>السجل</summary><pre>'+escapeHtml((j.log||[]).slice(-250).join('\n'))+'</pre></details></div>').join(''):'لا توجد عمليات بعد.'}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}setInterval(refreshJobs,3000);refreshJobs();
</script></body></html>`;

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/') return send(res, 200, html, 'text/html; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, service: 'fullqa-bot', jobs: jobs.size });
    if (req.method === 'GET' && url.pathname === '/api/jobs') {
      const list = [...jobs.values()].sort((a,b)=>(b.startedAt||'').localeCompare(a.startedAt||''));
      return send(res, 200, { jobs: list });
    }
    if (req.method === 'POST' && url.pathname === '/api/prompt') {
      const body = await readJson(req);
      const urls = normalizeUrls(body.urls);
      if (!urls.length) return send(res, 400, { error: 'أدخل رابطًا صحيحًا واحدًا على الأقل.' });
      return send(res, 200, { prompt: buildFullQaPrompt({ appName: String(body.appName || ''), urls, notes: String(body.notes || '') }) });
    }
    if (req.method === 'POST' && url.pathname === '/api/run') {
      const body = await readJson(req);
      const urls = normalizeUrls(body.urls);
      if (!urls.length) return send(res, 400, { error: 'أدخل رابطًا صحيحًا واحدًا على الأقل.' });
      const profile = String(body.profile || 'generic').replace(/[^a-z0-9_-]/gi, '') || 'generic';
      const created = urls.map(target => startJob(target, profile));
      return send(res, 202, { jobs: created.map(({id,target,status}) => ({ id, target, status })) });
    }
    return send(res, 404, { error: 'NOT_FOUND' });
  } catch (error) {
    return send(res, 500, { error: String(error) });
  }
}).listen(port, '0.0.0.0', () => console.log(`FullQA dashboard listening on ${port}`));
