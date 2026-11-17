# Orchestrated Execution Script for 5,000 Requests Scale (Tier 2 Benchmark)
param(
    [int]$Iterations = 5000,
    [int]$VUs = 150
)

$ErrorActionPreference = "Stop"

function Reset-Databases {
    Write-Host "`n>>> [State Reset] Resetting isolated PostgreSQL databases..." -ForegroundColor Cyan
    docker compose exec -T postgres-product psql -U postgres -d product_db -c "UPDATE products SET stock = 10000000 WHERE id = '1'; DELETE FROM product_operations;" | Out-Null
    docker compose exec -T postgres-payment psql -U postgres -d payment_db -c "UPDATE wallets SET balance = 100000000.00 WHERE user_id = '1'; UPDATE wallets SET balance = 0.00 WHERE user_id = '2'; DELETE FROM payment_transactions;" | Out-Null
    docker compose exec -T postgres-order psql -U postgres -d order_db -c "DELETE FROM order_items; DELETE FROM orders;" | Out-Null
    Write-Host ">>> Database reset complete: User 1 balance = 100M, Product 1 stock = 10M." -ForegroundColor Green
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   BENCHMARK STEP 2: 5,000 REQUESTS SCALE BENCHMARK        " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Total Iterations per scenario: $Iterations" -ForegroundColor Gray
Write-Host "Concurrent Virtual Users (VUs): $VUs" -ForegroundColor Gray
Write-Host "Target 1: Custom_Saga (5,000 Happy Path + 5,000 Compensation Path)" -ForegroundColor Gray
Write-Host "Target 2: DTM         (5,000 Happy Path + 5,000 Compensation Path)" -ForegroundColor Gray
Write-Host "Total Transactions to generate: 20,000" -ForegroundColor Gray
Write-Host "Prometheus Remote Write: http://prometheus:9090/api/v1/write" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

# ==========================================
# PHASE 1: Custom_Saga (10,000 total requests)
# ==========================================
Write-Host "`n----------------------------------------------------------" -ForegroundColor Magenta
Write-Host " [PHASE 1] RUNNING CUSTOM_SAGA BENCHMARK (5,000 x 2)" -ForegroundColor Magenta
Write-Host "----------------------------------------------------------" -ForegroundColor Magenta

# 1.1 Custom_Saga Happy Path
Reset-Databases
Write-Host "`n>>> [1/4] Starting Custom_Saga Happy Path ($Iterations requests)..." -ForegroundColor Green
docker compose run --rm `
    -e K6_PROMETHEUS_RW_SERVER_URL="http://prometheus:9090/api/v1/write" `
    -e K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM="true" `
    -e ORCHESTRATOR="custom" `
    -e BASE_URL="http://order-service:3002" `
    -e ITERATIONS="$Iterations" `
    -e VUS="$VUs" `
    k6 run -o experimental-prometheus-rw "/scripts/success_test.js"

# 1.2 Custom_Saga Compensation Path
Reset-Databases
Write-Host "`n>>> [2/4] Starting Custom_Saga Compensation Path ($Iterations requests)..." -ForegroundColor Yellow
docker compose run --rm `
    -e K6_PROMETHEUS_RW_SERVER_URL="http://prometheus:9090/api/v1/write" `
    -e K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM="true" `
    -e ORCHESTRATOR="custom" `
    -e BASE_URL="http://order-service:3002" `
    -e ITERATIONS="$Iterations" `
    -e VUS="$VUs" `
    k6 run -o experimental-prometheus-rw "/scripts/compensation_test.js"

# Cooldown between orchestrators
Write-Host "`n>>> [Cooldown] Sleeping 20 seconds for connection pools and CPU to settle..." -ForegroundColor Cyan
Start-Sleep -Seconds 20

# ==========================================
# PHASE 2: DTM (10,000 total requests)
# ==========================================
Write-Host "`n----------------------------------------------------------" -ForegroundColor Magenta
Write-Host " [PHASE 2] RUNNING DTM BENCHMARK (5,000 x 2)" -ForegroundColor Magenta
Write-Host "----------------------------------------------------------" -ForegroundColor Magenta

# 2.1 DTM Happy Path
Reset-Databases
Write-Host "`n>>> [3/4] Starting DTM Happy Path ($Iterations requests)..." -ForegroundColor Green
docker compose run --rm `
    -e K6_PROMETHEUS_RW_SERVER_URL="http://prometheus:9090/api/v1/write" `
    -e K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM="true" `
    -e ORCHESTRATOR="dtm" `
    -e BASE_URL="http://order-service:3002" `
    -e ITERATIONS="$Iterations" `
    -e VUS="$VUs" `
    k6 run -o experimental-prometheus-rw "/scripts/success_test.js"

# 2.2 DTM Compensation Path
Reset-Databases
Write-Host "`n>>> [4/4] Starting DTM Compensation Path ($Iterations requests)..." -ForegroundColor Yellow
docker compose run --rm `
    -e K6_PROMETHEUS_RW_SERVER_URL="http://prometheus:9090/api/v1/write" `
    -e K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM="true" `
    -e ORCHESTRATOR="dtm" `
    -e BASE_URL="http://order-service:3002" `
    -e ITERATIONS="$Iterations" `
    -e VUS="$VUs" `
    k6 run -o experimental-prometheus-rw "/scripts/compensation_test.js"

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "   5,000-Tier Benchmark Completed! (20,000 Total Requests) " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
