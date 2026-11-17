#!/bin/bash
# Shell helper to run K6 benchmarks with Prometheus Remote Write & DB Reset

ORCHESTRATOR=${1:-custom}
SCENARIO=${2:-both}
ITERATIONS=${3:-2000}
VUS=${4:-100}

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_WRITE_URL="http://localhost:9090/api/v1/write"

HAS_LOCAL_K6=false
if command -v k6 &> /dev/null; then
    HAS_LOCAL_K6=true
fi

reset_databases() {
    echo -e "\n>>> [State Reset] Resetting isolated databases to initial state..."
    docker compose exec -T postgres-product psql -U postgres -d product_db -c "UPDATE products SET stock = 10000000 WHERE id = '1'; DELETE FROM product_operations;" > /dev/null
    docker compose exec -T postgres-payment psql -U postgres -d payment_db -c "UPDATE wallets SET balance = 100000000.00 WHERE user_id = '1'; UPDATE wallets SET balance = 0.00 WHERE user_id = '2'; DELETE FROM payment_transactions;" > /dev/null
    docker compose exec -T postgres-order psql -U postgres -d order_db -c "DELETE FROM order_items; DELETE FROM orders;" > /dev/null
    echo ">>> Database state reset complete."
}

echo "=========================================================="
echo " Running Symmetrical K6 Benchmark for Orchestrator: $ORCHESTRATOR"
echo " Fixed Iterations: $ITERATIONS requests (VUs: $VUS)"
echo " Execution Mode: $( [ "$HAS_LOCAL_K6" = true ] && echo 'Local k6 CLI' || echo 'Docker (grafana/k6)' )"
echo " Prometheus Remote Write: $REMOTE_WRITE_URL"
echo "=========================================================="

run_script() {
    SCRIPT_NAME=$1
    reset_databases

    if [ "$HAS_LOCAL_K6" = true ]; then
        export K6_PROMETHEUS_RW_SERVER_URL="$REMOTE_WRITE_URL"
        export K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM="true"
        export ORCHESTRATOR="$ORCHESTRATOR"
        export BASE_URL="http://localhost:3002"
        export ITERATIONS="$ITERATIONS"
        export VUS="$VUS"
        k6 run -o experimental-prometheus-rw "k6/$SCRIPT_NAME"
    else
        docker compose run --rm \
            -e K6_PROMETHEUS_RW_SERVER_URL="http://prometheus:9090/api/v1/write" \
            -e K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM="true" \
            -e ORCHESTRATOR="$ORCHESTRATOR" \
            -e BASE_URL="http://order-service:3002" \
            -e ITERATIONS="$ITERATIONS" \
            -e VUS="$VUS" \
            k6 run -o experimental-prometheus-rw "/scripts/$SCRIPT_NAME"
    fi
}

if [ "$SCENARIO" = "success" ] || [ "$SCENARIO" = "both" ]; then
    echo -e "\n>>> Starting Symmetrical Happy Path Benchmark (success_test.js, $ITERATIONS requests)..."
    run_script "success_test.js"
fi

if [ "$SCENARIO" = "compensation" ] || [ "$SCENARIO" = "both" ]; then
    echo -e "\n>>> Starting Symmetrical Compensation Path Benchmark (compensation_test.js, $ITERATIONS requests)..."
    run_script "compensation_test.js"
fi

echo -e "\nBenchmark completed! Check Grafana dashboard at http://localhost:3000"
