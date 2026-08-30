import http from 'k6/http';
import { check } from 'k6';

const base = __ENV.TARGET_URL;
if (!base) throw new Error('TARGET_URL is required');
const path = __ENV.LOAD_PATH || '/api/health';

export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.LOAD_RATE || 100),
      timeUnit: '1m',
      duration: __ENV.LOAD_DURATION || '30s',
      preAllocatedVUs: 10,
      maxVUs: 100
    }
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000']
  }
};

export default function () {
  const r = http.get(`${base}${path}`);
  check(r, { 'status < 500': x => x.status < 500 });
}
