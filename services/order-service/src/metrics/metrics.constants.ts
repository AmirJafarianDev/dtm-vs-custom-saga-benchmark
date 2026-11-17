import { makeHistogramProvider } from '@willsoto/nestjs-prometheus';

export const TRANSACTION_DURATION_METRIC = 'transaction_duration_seconds';

export const transactionDurationHistogramProvider = makeHistogramProvider({
  name: TRANSACTION_DURATION_METRIC,
  help: 'Duration of distributed transactions in seconds partitioned by orchestrator type and outcome status',
  labelNames: ['orchestrator_type', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 15, 20, 30, 45, 60],
});
