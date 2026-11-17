# Script to generate live benchmark traffic
$bodyRich = '{"userId":"1","items":[{"productId":"1","quantity":1}]}'
$bodyPoor = '{"userId":"2","items":[{"productId":"1","quantity":1}]}'

Write-Host "Seeding live transactions to populate Grafana..." -ForegroundColor Cyan

1..10 | ForEach-Object {
    Invoke-RestMethod -Uri "http://localhost:3002/orders/checkout/custom" -Method Post -ContentType "application/json" -Body $bodyRich | Out-Null
    Invoke-RestMethod -Uri "http://localhost:3002/orders/checkout/custom" -Method Post -ContentType "application/json" -Body $bodyPoor | Out-Null
    Invoke-RestMethod -Uri "http://localhost:3002/orders/checkout/dtm" -Method Post -ContentType "application/json" -Body $bodyRich | Out-Null
    Invoke-RestMethod -Uri "http://localhost:3002/orders/checkout/dtm" -Method Post -ContentType "application/json" -Body $bodyPoor | Out-Null
}

Write-Host "Successfully generated 40 transactions across Custom Saga and DTM!" -ForegroundColor Green
