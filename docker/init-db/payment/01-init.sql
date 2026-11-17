-- Payment Database Schema and Seed Data
CREATE TABLE IF NOT EXISTS wallets (
    user_id VARCHAR(64) PRIMARY KEY,
    balance NUMERIC(14, 2) NOT NULL CHECK (balance >= 0),
    version INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_transactions (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    amount NUMERIC(14, 2) NOT NULL,
    type VARCHAR(32) NOT NULL, -- DEDUCT or COMPENSATE
    status VARCHAR(32) NOT NULL, -- SUCCESS or FAILED
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_payment_order_op UNIQUE(order_id, type)
);

-- Seed initial wallets
-- User 1: Rich user with ample balance for Happy Path benchmark (100,000,000)
-- User 2: Zero balance user for Compensation Path benchmark (0)
-- User 3: Normal user (5,000)
INSERT INTO wallets (user_id, balance)
VALUES 
    ('1', 100000000.00),
    ('2', 0.00),
    ('3', 5000.00)
ON CONFLICT (user_id) DO UPDATE 
SET balance = EXCLUDED.balance;
