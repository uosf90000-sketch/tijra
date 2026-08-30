import fs from 'node:fs/promises';
import path from 'node:path';
import { request } from 'playwright';
import type { QAResult } from '../types.js';

export async function runTijraAuthProfile(target: string, add: (r: Omit<QAResult, 'timestamp'>) => void) {
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
  for (const [index, item] of roles.entries()) {
    const email = `fullqa.${item.role.toLowerCase()}.${item.activity.toLowerCase()}.${stamp}.${index}@example.test`;
    if (!firstEmail) firstEmail = email;
    const api = await request.newContext({ baseURL: target });
    try {
      const response = await api.post('/api/auth/register', {
        data: {
          name: `FullQA ${item.role}`,
          email,
          password,
          phone: '0500000000',
          businessName: `FullQA ${item.role} ${item.activity} ${stamp}`,
          businessType: item.role,
          businessActivity: item.activity,
          city: 'Jeddah'
        }
      });
      const body = await response.text();
      const id = `TIJRA-REGISTER-${item.role}-${item.activity}`;
      if (response.status() === 201) {
        const state = await api.storageState();
        const statePath = path.join(stateDir, `${item.role.toLowerCase()}-${item.activity.toLowerCase()}.json`);
        await fs.writeFile(statePath, JSON.stringify(state, null, 2));
        add({ id, module:'Tijra/Auth', status:'PASS', expected:'HTTP 201 and authenticated session', actual:`HTTP 201; state=${statePath}; email=${email}`, url:new URL('/api/auth/register', target).toString() });
      } else {
        add({ id, module:'Tijra/Auth', status:'FAIL', expected:'HTTP 201', actual:`HTTP ${response.status()} ${body}`, url:new URL('/api/auth/register', target).toString() });
      }
    } catch (e) {
      add({ id:`TIJRA-REGISTER-${item.role}-${item.activity}`, module:'Tijra/Auth', status:'FAIL', actual:String(e), url:new URL('/api/auth/register', target).toString() });
    } finally {
      await api.dispose();
    }
  }

  if (firstEmail) {
    const api = await request.newContext({ baseURL: target });
    try {
      const duplicate = await api.post('/api/auth/register', { data: {
        name:'FullQA Duplicate', email:firstEmail, password, businessName:'FullQA Duplicate', businessType:'RETAILER', businessActivity:'GROCERY', city:'Jeddah'
      }});
      add({ id:'TIJRA-DUPLICATE-EMAIL', module:'Tijra/Auth', status:duplicate.status()===409?'PASS':'FAIL', expected:'HTTP 409', actual:`HTTP ${duplicate.status()}`, url:new URL('/api/auth/register', target).toString() });

      const wrong = await api.post('/api/auth/login', { data:{ email:firstEmail, password:'definitely-wrong-password' } });
      add({ id:'TIJRA-WRONG-PASSWORD', module:'Tijra/Auth', status:wrong.status()===401?'PASS':'FAIL', expected:'HTTP 401', actual:`HTTP ${wrong.status()}`, url:new URL('/api/auth/login', target).toString() });
    } finally {
      await api.dispose();
    }
  }
}
