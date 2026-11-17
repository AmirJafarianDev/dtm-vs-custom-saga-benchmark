import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom Prometheus Metrics
const compensatedTransactions = new Counter('saga_compensated_transactions_total');
const compensationSuccessRate = new Rate('saga_compensation_success_rate');
const compensationLatency = new Trend('saga_compensation_duration_ms', true);

// Configure benchmark target via environment variables
// ORCHESTRATOR can be 'custom' (Method B) or 'dtm' (Method A)
const ORCHESTRATOR = __ENV.ORCHESTRATOR || 'custom';
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3002';
const ENDPOINT = `${BASE_URL}/orders/checkout/${ORCHESTRATOR}`;

const VUS = __ENV.VUS ? parseInt(__ENV.VUS) : 200;
const ITERATIONS = __ENV.ITERATIONS ? parseInt(__ENV.ITERATIONS) : 10000;

export const options = {
  scenarios: {
    // Symmetrical benchmark scenario enforcing exact iteration counts
    symmetrical_compensation_benchmark: {
      executor: 'shared-iterations',
      vus: VUS,
      iterations: ITERATIONS,
      maxDuration: '30m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'], // Max 5% transport errors
    http_req_duration: ['p(95)<60000'], // Calibrated to 60s max threshold
    saga_compensation_success_rate: ['rate>0.95'],
  },
  ext: {
    loadimpact: {
      name: `Compensation Benchmark - ${ORCHESTRATOR.toUpperCase()} (${ITERATIONS} requests)`,
    },
  },
};

export default function () {
  const payload = JSON.stringify({
    userId: '2', // Zero balance user - guaranteed payment deduction failure
    items: [
      {
        productId: '1', // Product 1
        quantity: 1,
      },
    ],
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
    tags: {
      orchestrator_type: ORCHESTRATOR === 'dtm' ? 'DTM' : 'Custom_Saga',
      scenario: 'compensation_path',
    },
    timeout: '60s', // Calibrated 60-second timeout ceiling
  };

  const startTime = Date.now();
  const res = http.post(ENDPOINT, payload, params);
  const duration = Date.now() - startTime;

  compensationLatency.add(duration, { orchestrator: ORCHESTRATOR });

  const isHttpOk = res.status === 200;
  let isProperlyCompensated = false;

  try {
    const body = res.json();
    isProperlyCompensated = body && (body.status === 'FAILED' || body.success === false);
  } catch (e) {
    isProperlyCompensated = false;
  }

  const passed = check(res, {
    'HTTP status is 200 (handled)': () => isHttpOk,
    'Transaction properly marked as FAILED': () => isProperlyCompensated,
  });

  if (passed && isProperlyCompensated) {
    compensatedTransactions.add(1, { orchestrator: ORCHESTRATOR });
    compensationSuccessRate.add(1);
  } else {
    compensationSuccessRate.add(0);
  }

  sleep(0.05);
}
