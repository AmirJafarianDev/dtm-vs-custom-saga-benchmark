# PowerShell helper to run K6 benchmarks with Prometheus Remote Write & DB Reset
param (
    [Parameter(Mandatory=$false)]
    [ValidateSet("custom", "dtm")]
    [string]$Orchestrator = "custom",

    [Parameter(Mandatory=$false)]
    [ValidateSet("success", "compensation", "both")]
    [string]$Scenario = "both",

    [Parameter(Mandatory=$false)]
    [int]$Iterations = 5000,

    [Parameter(Mandatory=$false)]
    [int]$VUs = 150
)

$hasLocalK6 = (Get-Command k6 -ErrorAction SilentlyContinue) -ne $null
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir

$remoteWriteUrl = "http://localhost:9090/api/v1/write"

function Reset-Databases {
    Write-Host "`n>>> [State Reset] Resetting isolated databases to initial state..." -ForegroundColor Cyan
    docker compose exec -T postgres-product psql -U postgres -d product_db -c "UPDATE products SET stock = 10000000 WHERE id = '1'; DELETE FROM product_operations;" | Out-Null
    docker compose exec -T postgres-payment psql -U postgres -d payment_db -c "UPDATE wallets SET balance = 100000000.00 WHERE user_id = '1'; UPDATE wallets SET balance = 0.00 WHERE user_id = '2'; DELETE FROM payment_transactions;" | Out-Null
    docker compose exec -T postgres-order psql -U postgres -d order_db -c "DELETE FROM order_items; DELETE FROM orders;" | Out-Null
    Write-Host ">>> Database state reset complete: User 1 balance = 100M, Product 1 stock = 10M, Tables cleared." -ForegroundColor Green
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Running Symmetrical K6 Benchmark for Orchestrator: $Orchestrator" -ForegroundColor Yellow
Write-Host " Fixed Iterations: $Iterations requests (VUs: $VUs)" -ForegroundColor Yellow
Write-Host " Execution Mode: $(if ($hasLocalK6) { 'Local k6 CLI' } else { 'Docker (grafana/k6)' })" -ForegroundColor Yellow
Write-Host " Prometheus Remote Write: $remoteWriteUrl" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

function Run-K6Script([string]$scriptName) {
    # Reset DB state right before test to ensure identical conditions
    Reset-Databases

    if ($hasLocalK6) {
        $env:K6_PROMETHEUS_RW_SERVER_URL = $remoteWriteUrl
        $env:K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM = "true"
        $env:ORCHESTRATOR = $Orchestrator
        $env:BASE_URL = "http://localhost:3002"
        $env:ITERATIONS = $Iterations
        $env:VUS = $VUs
        k6 run -o experimental-prometheus-rw "k6/$scriptName"
    } else {
        # Run via official Docker image
        docker compose run --rm `
            -e K6_PROMETHEUS_RW_SERVER_URL="http://prometheus:9090/api/v1/write" `
            -e K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM="true" `
            -e ORCHESTRATOR="$Orchestrator" `
            -e BASE_URL="http://order-service:3002" `
            -e ITERATIONS="$Iterations" `
            -e VUS="$VUs" `
            k6 run -o experimental-prometheus-rw "/scripts/$scriptName"
    }
}

if ($Scenario -eq "success" -or $Scenario -eq "both") {
    Write-Host "`n>>> Starting Symmetrical Happy Path Benchmark (success_test.js, $Iterations requests)..." -ForegroundColor Green
    Run-K6Script "success_test.js"
}

if ($Scenario -eq "compensation" -or $Scenario -eq "both") {
    Write-Host "`n>>> Starting Symmetrical Compensation Path Benchmark (compensation_test.js, $Iterations requests)..." -ForegroundColor Red
    Run-K6Script "compensation_test.js"
}

Write-Host "`nBenchmark completed! Check Grafana dashboard at http://localhost:3000" -ForegroundColor Cyan
