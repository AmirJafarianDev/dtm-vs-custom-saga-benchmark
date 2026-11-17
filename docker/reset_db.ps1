# Helper script to reset all 3 isolated databases to pristine initial state
Write-Host "Resetting isolated databases..." -ForegroundColor Cyan

docker compose exec -T postgres-product psql -U postgres -d product_db -c "
  UPDATE products SET stock = 10000000 WHERE id = '1';
  UPDATE products SET stock = 10000000 WHERE id = '2';
  UPDATE products SET stock = 10000000 WHERE id = '3';
  DELETE FROM product_operations;
"

docker compose exec -T postgres-payment psql -U postgres -d payment_db -c "
  UPDATE wallets SET balance = 100000000.00 WHERE user_id = '1';
  UPDATE wallets SET balance = 0.00 WHERE user_id = '2';
  UPDATE wallets SET balance = 5000.00 WHERE user_id = '3';
  DELETE FROM payment_transactions;
"

docker compose exec -T postgres-order psql -U postgres -d order_db -c "
  DELETE FROM order_items;
  DELETE FROM orders;
"

Write-Host "Databases successfully reset to initial benchmark state!" -ForegroundColor Green
