import http from 'k6/http';
import { check, sleep } from 'k6';

const base = __ENV.TARGET_URL;
if (!base) throw new Error('TARGET_URL is required');
const path = __ENV.LOAD_PATH || '/api/health';

export const options = {
  stages: [
    { duration:'1m', target:30 },
    { duration:'2m', target:50 },
    { duration:'2m', target:100 },
    { duration:'2m', target:200 },
    { duration:'2m', target:500 },
    { duration:'1m', target:0 }
  ],
  thresholds: {
    http_req_failed:['rate<0.02'],
    http_req_duration:['p(95)<1500','p(99)<3000']
  }
};

export default function () {
  const r = http.get(`${base}${path}`);
  check(r, { 'status < 500': x => x.status < 500 });
  sleep(0.2);
}
