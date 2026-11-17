-- Product Database Schema and Seed Data
CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price NUMERIC(12, 2) NOT NULL,
    stock INT NOT NULL CHECK (stock >= 0),
    version INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_operations (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    product_id VARCHAR(64) NOT NULL,
    quantity INT NOT NULL,
    operation_type VARCHAR(32) NOT NULL, -- DEDUCT or COMPENSATE
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_order_product_op UNIQUE(order_id, product_id, operation_type)
);

-- Seed initial products
INSERT INTO products (id, name, price, stock)
VALUES 
    ('1', 'MacBook Pro M3', 1000.00, 10000000),
    ('2', 'Logitech MX Master', 50.00, 10000000),
    ('3', 'Dell UltraSharp 4K', 500.00, 10000000)
ON CONFLICT (id) DO UPDATE 
SET stock = EXCLUDED.stock, price = EXCLUDED.price;
