# Distributed Transaction Benchmarking: DTM vs. Custom Saga Orchestration in Microservices

[![NestJS](https://img.shields.io/badge/NestJS-v10.3-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![Prometheus](https://img.shields.io/badge/Prometheus-Monitoring-E6522C?logo=prometheus&logoColor=white)](https://prometheus.io/)
[![Grafana](https://img.shields.io/badge/Grafana-Visualized-F46800?logo=grafana&logoColor=white)](https://grafana.com/)
[![K6](https://img.shields.io/badge/k6-Load%20Testing-7D64FF?logo=k6&logoColor=white)](https://k6.io/)
[![OpenAPI](https://img.shields.io/badge/Swagger-OpenAPI%203.0-85EA2D?logo=swagger&logoColor=black)](https://swagger.io/)

A production-grade microservices testbed designed for empirical evaluation and benchmarking of distributed transaction orchestration patterns under high concurrency. This project directly benchmarks **Method A: DTM (Distributed Transaction Manager - `yedf/dtm`)** against **Method B: Custom In-Process Saga Orchestrator (Anser-Saga style in NestJS)** across 2,000, 5,000, and 10,000 concurrent transaction loads (up to 40,000 distributed transactions per benchmark suite).

---

## Table of Contents
1. [Architectural Overview](#architectural-overview)
2. [Microservices & Port Mappings](#microservices--port-mappings)
3. [Interactive Swagger API Documentation](#interactive-swagger-api-documentation)
4. [Pre-Seeded Test Data & Isolated Databases](#pre-seeded-test-data--isolated-databases)
5. [Quick Start Guide](#quick-start-guide)
6. [Observability & Monitoring (Grafana + Prometheus)](#observability--monitoring-grafana--prometheus)
7. [Running Load Benchmarks (K6)](#running-load-benchmarks-k6)
8. [Empirical Benchmark Results (Tiers 1, 2 & 3)](#empirical-benchmark-results-tiers-1-2--3)
9. [Academic Findings & Architectural Insights](#academic-findings--architectural-insights)
10. [Repository Structure](#repository-structure)

---

## Architectural Overview

The architecture implements the **Saga Pattern** across three physically isolated NestJS microservices, each backed by its own dedicated PostgreSQL database container:

```mermaid
flowchart TD
    Client["Client / K6 Load Generator"]
    
    subgraph Core_Services ["Microservices Ecosystem (NestJS)"]
        OrderSvc["Order Service (Port 3002)<br/><code>/orders/checkout/*</code>"]
        ProductSvc["Product Service (Port 3001)<br/><code>/products/*</code>"]
        PaymentSvc["Payment Service (Port 3003)<br/><code>/payments/*</code>"]
    end

    subgraph Orchestration_Engines ["Orchestration Strategies"]
        DTM["DTM Server (Port 36789)<br/><b>Method A: External Coordinator</b>"]
        CustomSaga["Custom Saga Orchestrator<br/><b>Method B: In-Process Engine</b>"]
    end

    subgraph Databases ["Physically Isolated PostgreSQL Databases"]
        ProdDB[("Product DB<br/>Port 5442 (internal 5432)")]
        OrderDB[("Order DB<br/>Port 5443 (internal 5432)")]
        PayDB[("Payment DB<br/>Port 5444 (internal 5432)")]
    end

    subgraph Observability ["Telemetry & Metrics"]
        Prom["Prometheus (Port 9090)<br/>Histogram: transaction_duration_seconds"]
        Graf["Grafana Dashboard (Port 3000)<br/>P95 & Throughput Analytics"]
    end

    Client -->|POST /orders/checkout/dtm| OrderSvc
    Client -->|POST /orders/checkout/custom| OrderSvc
    
    OrderSvc -. Method A: Multi-Hop .-> DTM
    DTM -->|1. Deduct Stock| ProductSvc
    DTM -->|2. Deduct Balance| PaymentSvc
    DTM -. Rollback .->|Compensate Stock| ProductSvc

    OrderSvc -. Method B: In-Process .-> CustomSaga
    CustomSaga -->|1. Deduct Stock| ProductSvc
    CustomSaga -->|2. Deduct Balance| PaymentSvc
    CustomSaga -. Rollback (LIFO) .->|Compensate Stock| ProductSvc

    ProductSvc --- ProdDB
    OrderSvc --- OrderDB
    PaymentSvc --- PayDB

    OrderSvc -->|Histogram Metrics| Prom
    Client -->|K6 Remote Write| Prom
    Prom --> Graf
```

### Orchestration Comparison

| Feature | Method A: DTM Server (`yedf/dtm`) | Method B: Custom Saga Orchestrator |
|---|---|---|
| **Coordination Model** | External distributed coordinator (Go binary) | In-process asynchronous engine (TypeScript / NestJS) |
| **Network Hops** | Client $\to$ Order $\to$ DTM $\to$ Services $\to$ DTM $\to$ Order | Client $\to$ Order $\to$ Services (direct HTTP pool) |
| **State Persistence** | Coordinator database / in-memory table | Ephemeral execution context + Order state table |
| **Rollback Strategy** | Asynchronous coordinator branch rollback | Synchronous reverse LIFO compensation step execution |
| **P95 Latency (10k Load)** | **25.40 seconds** | **9.73 seconds (2.6x faster)** |
| **Compensation Reliability** | 64.6% (coordinator lock/timeout degradation) | **100% Guaranteed Consistency** |

---

## Microservices & Port Mappings

All services run inside a dedicated Docker bridge network (`saga-network`). Host ports are mapped to avoid standard conflicts (e.g. host 5432/5433).

| Component | Role | Internal Port | Host Port | Database / Dependency |
|---|---|:---:|:---:|---|
| **Product Service** | Manages catalog items and atomic inventory stock | `3001` | `3001` | `postgres-product:5432` (`product_db`) |
| **Order Service** | Saga transaction coordinator and order lifecycle | `3002` | `3002` | `postgres-order:5432` (`order_db`) |
| **Payment Service** | Manages wallets, atomic balance deductions & refunds | `3003` | `3003` | `postgres-payment:5432` (`payment_db`) |
| **DTM Server** | Open-source coordinator (`yedf/dtm`) | `36789` / `36790` | `36789` / `36790` | In-memory coordinator engine |
| **PostgreSQL (Product)** | Isolated storage for Product Service | `5432` | `5442` | Database: `product_db` (User: `postgres`, Pass: `postgres`) |
| **PostgreSQL (Order)** | Isolated storage for Order Service | `5432` | `5443` | Database: `order_db` (User: `postgres`, Pass: `postgres`) |
| **PostgreSQL (Payment)** | Isolated storage for Payment Service | `5432` | `5444` | Database: `payment_db` (User: `postgres`, Pass: `postgres`) |
| **Prometheus** | Metrics scraper & K6 remote write receiver | `9090` | `9090` | Scrapes `/metrics` every 5s |
| **Grafana** | Pre-provisioned real-time visualization dashboard | `3000` | `3000` | Pre-configured dashboard & anonymous admin |

---

## Interactive Swagger API Documentation

Each microservice exposes a fully functional OpenAPI 3.0 / Swagger UI interface under the `/api/docs` route:

| Service | Swagger UI URL | Key Endpoints Documented |
|---|---|---|
| **Product Service** | [http://localhost:3001/api/docs](http://localhost:3001/api/docs) | `GET /products/:id`<br/>`POST /products/deduct`<br/>`POST /products/compensate` |
| **Order Service** | [http://localhost:3002/api/docs](http://localhost:3002/api/docs) | `POST /orders/checkout/dtm` *(Method A)*<br/>`POST /orders/checkout/custom` *(Method B)*<br/>`POST /orders/checkout` *(Dynamic)*<br/>`GET /orders/:id`<br/>`POST /orders/:id/confirm`<br/>`POST /orders/:id/fail` |
| **Payment Service** | [http://localhost:3003/api/docs](http://localhost:3003/api/docs) | `GET /payments/wallet/:userId`<br/>`POST /payments/deduct`<br/>`POST /payments/compensate` |

Each endpoint includes predefined request body examples for **User 1 (Happy Path)** and **User 2 (Compensation Path)** so you can execute smoke tests directly from your browser.

---

## Pre-Seeded Test Data & Isolated Databases

Initial SQL scripts (`01-init.sql`) automatically seed all three databases on startup:

### 1. Product Database (`product_db` on port `5442`)
- **Product ID `1`:** MacBook Pro M3 (Price: `$1,000.00`, Stock: `10,000,000`)
- **Product ID `2`:** Logitech MX Master (Price: `$50.00`, Stock: `10,000,000`)
- **Product ID `3`:** Dell UltraSharp 4K (Price: `$500.00`, Stock: `10,000,000`)

### 2. Payment Database (`payment_db` on port `5444`)
- **User ID `1` (Happy Path):** Initial Balance: **`$100,000,000.00`** *(Will never run out of funds during 10,000 load runs)*
- **User ID `2` (Compensation Path):** Initial Balance: **`$0.00`** *(Always triggers payment rejection and forces immediate Saga compensation)*
- **User ID `3`:** Initial Balance: **`$5,000.00`**

### 3. Order Database (`order_db` on port `5443`)
Stores orders (`PENDING`, `SUCCESS`, `FAILED`) and order line items.

---

## Quick Start Guide

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) & Docker Compose v2+
- [K6](https://k6.io/docs/get-started/installation/) (for running load benchmarks)
- [Node.js 20+](https://nodejs.org/) (optional, only for local development outside Docker)

### 1. Clone & Launch the Entire Stack
```bash
git clone https://github.com/AmirJafarianDev/dtm-vs-custom-saga-benchmark.git
cd dtm-vs-custom-saga-benchmark

# Build and start all 9 containers
docker compose up -d --build
```

### 2. Verify Container Health
```bash
docker compose ps
```
All 9 containers (`product-service`, `order-service`, `payment-service`, `postgres-product`, `postgres-order`, `postgres-payment`, `dtm-server`, `prometheus`, `grafana`) should report `Up`.

### 3. Quick Smoke Tests via cURL

#### Method A: External DTM Checkout
```bash
# Happy Path (User 1 -> SUCCESS)
curl -X POST http://localhost:3002/orders/checkout/dtm \
  -H "Content-Type: application/json" \
  -d '{"userId": "1", "items": [{"productId": "1", "quantity": 1}]}'

# Compensation Path (User 2 -> Insufficient Balance -> Rollback Stock)
curl -X POST http://localhost:3002/orders/checkout/dtm \
  -H "Content-Type: application/json" \
  -d '{"userId": "2", "items": [{"productId": "1", "quantity": 1}]}'
```

#### Method B: Custom Saga Checkout
```bash
# Happy Path (User 1 -> SUCCESS)
curl -X POST http://localhost:3002/orders/checkout/custom \
  -H "Content-Type: application/json" \
  -d '{"userId": "1", "items": [{"productId": "1", "quantity": 1}]}'

# Compensation Path (User 2 -> Insufficient Balance -> Reverse LIFO Compensation)
curl -X POST http://localhost:3002/orders/checkout/custom \
  -H "Content-Type: application/json" \
  -d '{"userId": "2", "items": [{"productId": "1", "quantity": 1}]}'
```

---

## Observability & Monitoring (Grafana + Prometheus)

### Prometheus (`http://localhost:9090`)
The `order-service` emits a high-resolution Prometheus Histogram:
- **Metric Name:** `transaction_duration_seconds`
- **Labels:**
  - `orchestrator_type`: `DTM` | `Custom_Saga`
  - `status`: `SUCCESS` | `COMPENSATED`
- **Buckets:** `[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 15, 20, 30, 45, 60]` *(Calibrated to eliminate latency ceiling caps under extreme stress)*

### Grafana Dashboard (`http://localhost:3000`)
- **Login Credentials:** `admin` / `admin` (Anonymous admin access is enabled by default)
- **Dashboard URL:** [http://localhost:3000/d/saga-benchmark-dashboard](http://localhost:3000/d/saga-benchmark-dashboard)
- **Key Visualizations:**
  1. **P95 Latency Comparison:** `histogram_quantile(0.95, sum(rate(transaction_duration_seconds_bucket[1m])) by (le, orchestrator_type))`
  2. **Throughput (TPS):** `sum(rate(transaction_duration_seconds_count[1m])) by (orchestrator_type, status)`
  3. **Average Duration:** `sum(rate(transaction_duration_seconds_sum[1m])) by (orchestrator_type) / sum(rate(transaction_duration_seconds_count[1m])) by (orchestrator_type)`
  4. **Outcome Distribution:** Ratio of successful orders vs. compensated rollbacks.

---

## Running Load Benchmarks (K6)

The repository provides automated, symmetrical benchmark scripts that automatically reset the database state and enforce cooldown periods between runs.

### Automated PowerShell Scripts

```powershell
# Tier 1: 2,000 requests per scenario (8,000 total distributed transactions)
.\k6\run_benchmark.ps1 -Orchestrator custom -Scenario both -Iterations 2000 -VUs 100
.\k6\run_benchmark.ps1 -Orchestrator dtm -Scenario both -Iterations 2000 -VUs 100

# Tier 2: 5,000 requests per scenario (20,000 total distributed transactions)
.\k6\run_5000_tier_benchmark.ps1

# Tier 3: 10,000 requests per scenario (40,000 total distributed transactions - Peak Concurrency)
.\k6\run_10000_tier_benchmark.ps1
```

### Direct K6 CLI Execution

```bash
# Export Prometheus Remote Write Endpoint
export K6_PROMETHEUS_RW_SERVER_URL="http://localhost:9090/api/v1/write"
export K6_PROMETHEUS_RW_TREND_AS_NATIVE_HISTOGRAM="true"

# Happy Path Benchmark (Custom Saga)
ORCHESTRATOR=custom k6 run -o experimental-prometheus-rw k6/success_test.js

# Compensation Path Benchmark (Custom Saga)
ORCHESTRATOR=custom k6 run -o experimental-prometheus-rw k6/compensation_test.js

# Happy Path Benchmark (DTM)
ORCHESTRATOR=dtm k6 run -o experimental-prometheus-rw k6/success_test.js

# Compensation Path Benchmark (DTM)
ORCHESTRATOR=dtm k6 run -o experimental-prometheus-rw k6/compensation_test.js
```

---

## Empirical Benchmark Results (Tiers 1, 2 & 3)

The following metrics represent empirical Prometheus timeseries data collected across all three test tiers:

### Tier 1: 2,000 Requests per Scenario (100 VUs)
| Orchestrator | Scenario | Requests | Consistency Rate | P95 Latency | Average Latency |
|---|---|:---:|:---:|:---:|:---:|
| **Custom Saga** | Happy Path | 2,000 | **100%** | **4.91 s** | **2.66 s** |
| **Custom Saga** | Compensation Path | 2,000 | **100%** | **4.16 s** | **2.71 s** |
| **DTM** | Happy Path | 2,000 | **100%** | **14.35 s** | **7.39 s** |
| **DTM** | Compensation Path | 2,000 | **85.3%** | **15.31 s** | **8.22 s** |

### Tier 2: 5,000 Requests per Scenario (150 VUs)
| Orchestrator | Scenario | Requests | Consistency Rate | P95 Latency | Average Latency |
|---|---|:---:|:---:|:---:|:---:|
| **Custom Saga** | Happy Path | 5,000 | **100%** | **9.12 s** | **4.20 s** |
| **Custom Saga** | Compensation Path | 5,000 | **100%** | **8.75 s** | **4.15 s** |
| **DTM** | Happy Path | 5,000 | **100%** | **27.49 s** | **13.05 s** |
| **DTM** | Compensation Path | 5,000 | **59.1%** | **26.60 s** | **15.90 s** |

### Tier 3: 10,000 Requests per Scenario (200 VUs - Peak Concurrency)
| Orchestrator | Scenario | Requests | Consistency Rate | P95 Latency | Average Latency |
|---|---|:---:|:---:|:---:|:---:|
| **Custom Saga** | Happy Path | 10,000 | **100%** | **9.96 s** | **5.40 s** |
| **Custom Saga** | Compensation Path | 10,000 | **100%** | **9.56 s** | **5.38 s** |
| **DTM** | Happy Path | 10,000 | **100%** | **26.97 s** | **12.92 s** |
| **DTM** | Compensation Path | 10,000 | **64.6%** | **18.62 s** | **12.02 s** |

---

## Academic Findings & Architectural Insights

1. **In-Process vs. External Coordinator Overhead:**
   - At Tier 1 (2k), Custom Saga is **2.9x faster** than DTM at P95.
   - At Tier 2 (5k), Custom Saga is **3.0x faster** than DTM at P95 (**9.12s vs. 27.49s**).
   - At Tier 3 (10k), Custom Saga stabilizes at **9.73s** aggregated P95 vs. DTM **25.40s** (**2.6x faster**). Average duration is **5.39s vs. 12.63s** (**2.34x faster**).
2. **Coordinator Bottleneck & Multi-Hop Amplification:**
   - DTM introduces extra network serialization hops (Order $\to$ DTM $\to$ Microservices $\to$ DTM $\to$ Order) and persists sub-transaction branches. Under 200 concurrent users, DTM's internal state machine saturates connection pools and HTTP listeners, leading to high latency variance.
   - Custom Saga executes purely within the NestJS asynchronous event loop and connection pool, avoiding coordinator network hops while guaranteeing transactional rollback.
3. **Rollback Consistency Under Extreme Concurrency:**
   - Custom Saga maintained **100% consistency and rollback completion** across all 40,000 transactions.
   - DTM experienced degraded rollback completion (64.6% at 10k load) due to coordinator timeout thresholds and concurrent lock queueing on compensation branches.

---

## Repository Structure

```
.
├── docker/
│   ├── postgres-order/init/01-init.sql      # Order schema & tables
│   ├── postgres-payment/init/01-init.sql    # Wallet schema & test seed users
│   └── postgres-product/init/01-init.sql    # Product catalog schema & test stocks
├── k6/
│   ├── compensation_test.js                 # K6 Compensation Path test scenario
│   ├── success_test.js                      # K6 Happy Path test scenario
│   ├── run_benchmark.ps1                    # Symmetrical load execution script
│   ├── run_5000_tier_benchmark.ps1          # Tier 2 (5,000 iterations) benchmark
│   └── run_10000_tier_benchmark.ps1         # Tier 3 (10,000 iterations) benchmark
├── monitoring/
│   ├── grafana/
│   │   ├── dashboards/saga-benchmark.json   # Pre-configured Grafana benchmark dashboard
│   │   └── provisioning/                    # Auto-provisioning for datasources & dashboards
│   └── prometheus/prometheus.yml            # Scrape targets & remote write config
├── services/
│   ├── order-service/                       # Saga coordinator & Order lifecycle service
│   │   ├── src/saga/custom-saga.orchestrator.ts # In-process Custom Saga Engine
│   │   └── src/saga/dtm.client.ts           # DTM HTTP client & polling manager
│   ├── payment-service/                     # Wallet & payment deduction service
│   ├── product-service/                     # Catalog & inventory management service
│   └── shared/                              # Shared TypeScript types & interfaces
├── docker-compose.yml                       # Unified multi-container orchestration
└── README.md                                # Comprehensive documentation & benchmark guide
```

---

## License

This project is licensed under the MIT License. Academic citations and contributions are welcome.
