import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom Prometheus Metrics
const successfulTransactions = new Counter('saga_successful_transactions_total');
const failedTransactions = new Counter('saga_failed_transactions_total');
const transactionSuccessRate = new Rate('saga_transaction_success_rate');
const transactionLatency = new Trend('saga_transaction_duration_ms', true);

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
    symmetrical_success_benchmark: {
      executor: 'shared-iterations',
      vus: VUS,
      iterations: ITERATIONS,
      maxDuration: '30m',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'], // Max 5% HTTP transport errors
    http_req_duration: ['p(95)<60000'], // Calibrated to 60s max threshold
    saga_transaction_success_rate: ['rate>0.95'],
  },
  ext: {
    loadimpact: {
      name: `Happy Path Benchmark - ${ORCHESTRATOR.toUpperCase()} (${ITERATIONS} requests)`,
    },
  },
};

export default function () {
  const payload = JSON.stringify({
    userId: '1', // Rich user with reset balance (100,000,000)
    items: [
      {
        productId: '1', // Product 1 with reset stock (10,000,000)
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
      scenario: 'happy_path',
    },
    timeout: '60s', // Calibrated 60-second timeout ceiling
  };

  const startTime = Date.now();
  const res = http.post(ENDPOINT, payload, params);
  const duration = Date.now() - startTime;

  transactionLatency.add(duration, { orchestrator: ORCHESTRATOR });

  const isHttpOk = res.status === 200;
  let isBusinessSuccess = false;

  try {
    const body = res.json();
    isBusinessSuccess = body && (body.success === true || body.status === 'SUCCESS');
  } catch (e) {
    isBusinessSuccess = false;
  }

  const passed = check(res, {
    'HTTP status is 200': () => isHttpOk,
    'Transaction marked as SUCCESS': () => isBusinessSuccess,
  });

  if (passed && isBusinessSuccess) {
    successfulTransactions.add(1, { orchestrator: ORCHESTRATOR });
    transactionSuccessRate.add(1);
  } else {
    failedTransactions.add(1, { orchestrator: ORCHESTRATOR });
    transactionSuccessRate.add(0);
  }

  sleep(0.05);
}
