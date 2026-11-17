# Quick Benchmark Runner for Option 2 (Optimized Concurrency)
param(
    [int]$VUsCustom = 200,
    [int]$VUsDtm = 100,
    [string]$Duration = "20s"
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   Starting Fast & Optimized Distributed Saga Benchmark   " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Custom Saga Concurrency: $VUsCustom VUs, Duration: $Duration" -ForegroundColor Gray
Write-Host "DTM Concurrency:         $VUsDtm VUs, Duration: $Duration" -ForegroundColor Gray
Write-Host "Prometheus Remote Write: http://prometheus:9090/api/v1/write" -ForegroundColor Gray
Write-Host "----------------------------------------------------------" -ForegroundColor Gray

# 1. Custom Saga - Happy Path
Write-Host "`n[1/4] Running Custom Saga - Happy Path..." -ForegroundColor Green
docker compose run --rm -e ORCHESTRATOR=custom k6 run --vus $VUsCustom --duration $Duration -o experimental-prometheus-rw /scripts/success_test.js

# 2. Custom Saga - Compensation Path
Write-Host "`n[2/4] Running Custom Saga - Compensation Path..." -ForegroundColor Yellow
docker compose run --rm -e ORCHESTRATOR=custom k6 run --vus $VUsCustom --duration $Duration -o experimental-prometheus-rw /scripts/compensation_test.js

# 3. DTM - Happy Path
Write-Host "`n[3/4] Running DTM - Happy Path..." -ForegroundColor Green
docker compose run --rm -e ORCHESTRATOR=dtm k6 run --vus $VUsDtm --duration $Duration -o experimental-prometheus-rw /scripts/success_test.js

# 4. DTM - Compensation Path
Write-Host "`n[4/4] Running DTM - Compensation Path..." -ForegroundColor Yellow
docker compose run --rm -e ORCHESTRATOR=dtm k6 run --vus $VUsDtm --duration $Duration -o experimental-prometheus-rw /scripts/compensation_test.js

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "   All Benchmarks Completed! Fetching Prometheus Stats...   " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
