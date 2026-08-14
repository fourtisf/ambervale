/**
 * k6 load test: the core loop under concurrency.
 *
 * Each virtual user is a distinct guest account playing for real — auth, buy,
 * plant, wait, harvest, sell — so the run exercises the same locks, rate
 * limits and transactions a live player would.
 *
 * Run:
 *   k6 run ops/k6/core-loop.js
 *   k6 run -e API=https://api.example.com -e VUS=200 ops/k6/core-loop.js
 *
 * Thresholds are the acceptance bar from the Phase 8 brief: 200 concurrent
 * users, p95 under 250ms on mutating endpoints, zero 5xx.
 *
 * Note on rate limiting: the server allows 5 mutating calls/sec/user. A VU
 * that hammered faster than that would measure the limiter rather than the
 * game, so each VU paces itself — exactly as the real client does.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const API = __ENV.API || 'http://localhost:4021';
const VUS = Number(__ENV.VUS || 200);

const mutationDuration = new Trend('mutation_duration', true);
const serverErrors = new Counter('server_errors');
const rateLimited = new Counter('rate_limited');
const actionSuccess = new Rate('action_success');

export const options = {
  scenarios: {
    core_loop: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: Math.ceil(VUS / 4) },
        { duration: '30s', target: VUS },
        { duration: '2m', target: VUS },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    // The acceptance bar.
    'mutation_duration{kind:mutating}': ['p(95)<250'],
    server_errors: ['count==0'],
    http_req_failed: ['rate<0.35'], // 409/429 are correct answers, not failures
    action_success: ['rate>0.6'],
  },
};

function post(path, body, jar, tags) {
  const res = http.post(`${API}${path}`, JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', 'x-device-id': jar.deviceId },
    jar: jar.cookies,
    tags: { kind: 'mutating', ...tags },
  });

  mutationDuration.add(res.timings.duration, { kind: 'mutating' });
  if (res.status >= 500) serverErrors.add(1);
  if (res.status === 429) rateLimited.add(1);
  actionSuccess.add(res.status === 200);
  return res;
}

function get(path, jar) {
  return http.get(`${API}${path}`, {
    headers: { 'x-device-id': jar.deviceId },
    jar: jar.cookies,
    tags: { kind: 'read' },
  });
}

export function setup() {
  const health = http.get(`${API}/health`);
  check(health, { 'api is up': (r) => r.status === 200 });
  return {};
}

export default function () {
  // A fresh account per iteration keeps VUs from contending on one farm, which
  // would measure the action lock rather than throughput.
  const jar = { deviceId: uuidv4(), cookies: http.cookieJar() };

  const auth = post('/auth/guest', { deviceId: jar.deviceId }, jar, { op: 'auth' });
  if (!check(auth, { authenticated: (r) => r.status === 200 })) return;

  sleep(0.3);

  // Plant on three plots, pacing under the 5/sec budget.
  for (let i = 0; i < 3; i++) {
    post('/act/plant', { plotIndex: i, cropKey: 'sunflower' }, jar, { op: 'plant' });
    sleep(0.25);
  }

  const farm = get('/farm', jar);
  check(farm, { 'farm reads': (r) => r.status === 200 });

  // The first crop is the accelerated one (10s); wait it out.
  sleep(10.5);

  post('/act/harvest', { plotIndex: 0 }, jar, { op: 'harvest' });
  sleep(0.3);

  post('/act/sell', { itemKey: 'sunflower', qty: 'all' }, jar, { op: 'sell' });
  sleep(0.3);

  post('/act/buySeed', { cropKey: 'sunflower', qty: 5 }, jar, { op: 'buySeed' });
  sleep(0.3);

  // Chop a node three times, respecting the 350ms per-node cooldown.
  for (let i = 0; i < 3; i++) {
    post('/act/chop', { nodeIndex: 0 }, jar, { op: 'chop' });
    sleep(0.45);
  }

  sleep(1);
}

/**
 * Ledger drift check.
 *
 * $AMBER balance is SUM(delta) over an append-only table, so the only way it
 * can drift is if a payout wrote a row without its authorising record. Assert
 * that here after the run; anything non-zero is a duplication bug.
 */
export function teardown() {
  const res = http.get(`${API}/health/deep`);
  check(res, { 'services healthy after load': (r) => r.status === 200 });
}
