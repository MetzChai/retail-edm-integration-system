# Retail EDM Integration System — Backend (Laravel 12)

REST API backend for the Retail EDM (Enterprise Data Management) Integration System:
master data (products/categories/customers), inventory, sales, ETL integrations,
data quality, governance/RBAC, audit logs and reporting.

## Requirements

- PHP 8.2+ (XAMPP PHP works: `C:\xampp\php\php.exe`)
- Composer 2.9
- MySQL 8 (XAMPP, port 3306)

## Setup

```powershell
cd "C:\Retail & E-Commerce\backend"

# 1. Install dependencies (if vendor/ missing)
composer install

# 2. Configure environment (already done in this workspace)
#    .env highlights:
#      APP_URL=http://localhost:8000
#      DB_CONNECTION=mysql
#      DB_HOST=127.0.0.1
#      DB_PORT=3306
#      DB_DATABASE=retail_edm
#      DB_USERNAME=root
#      DB_PASSWORD=
php artisan key:generate   # only if APP_KEY is empty

# 3. Create the database (MySQL client from XAMPP)
C:\xampp\mysql\bin\mysql.exe -u root -e "CREATE DATABASE IF NOT EXISTS retail_edm CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 4. Migrate + seed
php artisan migrate:fresh --seed

# 5. Run the API server
php artisan serve --host=127.0.0.1 --port=8000
```

API base URL: **`http://localhost:8000/api`**
CORS allows `http://localhost:3000` (see `config/cors.php`, `FRONTEND_URL`).

## Seeded accounts

| Role    | Email                 | Password | Permissions |
|---------|-----------------------|----------|-------------|
| admin   | admin@retail.test     | password | all 14 permissions |
| manager | manager@retail.test   | password | products, categories, customers, inventory, sales, integration (view), reports |
| staff   | staff@retail.test     | password | view products/categories/customers/inventory, create sales, view reports |

## Auth

```http
POST /api/login
{"email":"admin@retail.test","password":"password"}

→ {"token":"1|...","token_type":"Bearer","user":{id,name,email,role,status,is_active,permissions[]}}
```

Send `Authorization: Bearer <token>` on every protected request.
All API errors (401/403/404/422) render as JSON.

RBAC middleware aliases: `role:admin,manager` and `permission:products.manage` (registered in `bootstrap/app.php`).
An extra `EnsureAccountActive` guard runs after `auth:sanctum` on every protected route, so pending/deactivated
tokens always receive the same 403 messages as login.

### Registration + approval workflow

`users.status` enum: `pending | active | inactive | rejected` (legacy `is_active` stays in sync automatically).

| Method/Path | Auth | Request | Success | Errors |
|---|---|---|---|---|
| `POST /register` | public, `throttle:10,1` | `{name, email, password (min 8), password_confirmation}` — **role/permissions input ignored** | **201** `{message:"Registration submitted. Your account requires administrator approval.", user:{id,name,email,role:"staff",status:"pending"}}` (no token) | 422 validation (duplicate email, weak/mismatched password), 429 throttle |
| `POST /login` | public, `throttle:30,1` | `{email, password}` | **200** `{token, token_type, user:{...,status:"active"}}` | **403** pending → `{"message":"Account pending approval. Please contact an administrator."}`; **403** inactive/rejected → `{"message":"Account is deactivated. Please contact an administrator."}`; 422 bad credentials |
| `GET /user` | Sanctum | — | **200** `{user:{...,status}}` | 401 |
| `GET /users/pending` | `governance.manage` | `?search=&per_page=` | **200** paginated pending registrations | 401/403 |
| `POST /users/{id}/approve` | `governance.manage` | — | **200** `{message, user:{status:"active"}}` (sets active + staff role, audits) | 422 if not pending; 401/403 |
| `POST /users/{id}/reject` | `governance.manage` | — | **200** `{message:"Registration rejected.", user:{status:"rejected"}}` (audits) | 422 if not pending |
| `POST /users/{id}/activate` | `governance.manage` | — | **200** `{message:"Account activated.", user:{status:"active"}}` | 422 if pending |
| `POST /users/{id}/deactivate` | `governance.manage` | — | **200** `{message:"Account deactivated.", user:{status:"inactive"}}` (audits; existing tokens blocked with 403) | 422 if deactivating yourself |
| `POST /users/{id}/toggle-active` | `governance.manage` | — | **200** flips active/inactive | 422 if pending |

Notes: registration always creates `staff` + `pending` regardless of any `role`/`is_active` fields in the body;
pending/rejected users never receive a token; deactivated users keep their token but every protected route
returns 403 with the deactivated message until re-activated.

## Endpoints (all under `/api`, bearer auth unless noted)

### Auth
- `POST /login` (public), `POST /register` (public, pending approval — see workflow above), `GET /user`, `POST /logout`
- `GET /users/pending`, `POST /users/{id}/approve|reject|activate|deactivate|toggle-active` (admin)

### Catalog
- `GET|POST /categories`, `GET|PUT|DELETE /categories/{id}`
- `GET|POST /products` (`?search=&category_id=&status=&low_stock=&per_page=`), `GET|PUT|DELETE /products/{id}`
  - unique `sku` + `barcode` enforced (422), `initial_stock`/`min_stock` accepted on create

### Customers
- `GET|POST /customers` (`?search=&active_only=`), `GET|PUT|DELETE /customers/{id}`
- `GET /customers-duplicates/check?email=&phone=` → `{is_duplicate, duplicates[]}`
- `POST /customers/{id}/merge` `{primary_id}` → moves sales, flags `merged_into_id`
- Duplicate create/update returns **409** with matching records (add `"force":true` to bypass non-exact matches)

### Inventory
- `GET /inventory` (`?search=&low_stock=&out_of_stock=`)
- `POST /inventory/stock-in` `{product_id, quantity, reference?, notes?}`
- `POST /inventory/stock-out` `{product_id, quantity, ...}` → 422 on insufficient stock
- `POST /inventory/adjust` `{product_id, quantity}` (quantity = new absolute count)
- `GET /inventory/history` (`?product_id=&type=&from=&to=`)
- `GET /inventory/low-stock`

### Sales & payments
- `GET /sales` (`?search=&status=&source=&payment_method=&customer_id=&from=&to=`)
- `POST /sales` `{customer_id?, payment_method, source?, notes?, items:[{product_id, quantity}]}`
  - **transactional**: stock deducted with `lockForUpdate`, insufficient stock rolls back (422)
  - response contains receipt payload (`transaction_no`, items, payments, totals)
- `GET /sales/{id}` → receipt
- `GET|POST /payments`, `GET /payments/{id}` — no card data accepted (`card_number`/`cvv`/`pan` prohibited)

### Dashboard
- `GET /dashboard?days=30` → totals (today/period revenue & orders, customers, products, low/out of stock), daily chart series, best sellers, recent sales, inventory summary (units + stock value), sync status (sources + recent logs)

### Integration / ETL
- `GET|POST /data-sources`, `GET|PUT|DELETE /data-sources/{id}` (types: `POS`, `Inventory`, `CRM`, `OnlineStorefront`)
- `POST /integration/sync` `{type}` or `{data_source_id}` → runs `ETLService` (Extract→Transform→Load with validation + dedup) and writes `integration_logs`
- `GET /integration/logs` (`?source=&status=&data_source_id=&from=&to=`)
- `POST /integration/online-order` `{sku, quantity, customer_email?, payment_method?, external_id?}`
  - idempotent on `external_id`, oversell prevented (409 + available stock)

### Data quality
- `POST /data-quality/run` — runs completeness/accuracy/consistency/uniqueness/validity checks over products, customers, inventory, sales, data_sources → `data_quality_logs`
- `GET /data-quality/stats` → overall score + grade (A–F), per-dimension scores, per-entity checks, history

### Governance & audit
- `GET|POST /governance/users`, `PUT|DELETE /governance/users/{id}`
- `GET /governance/roles` (roles + permissions + user counts)
- `GET /governance/activity`
- `GET /audit-logs` (`?action=&entity=&user_id=&from=&to=&search=`), `GET /audit-logs/meta`

### Reports
- `GET /reports/sales/{daily|weekly|monthly}?from=&to=` → buckets with orders/revenue/AOV
- `GET /reports/best-sellers?from=&to=&limit=`
- `GET /reports/inventory`, `GET /reports/low-stock`
- `GET /reports/customers/{id}/history`
- `GET /reports/category-sales?from=&to=` (revenue share %)
- `GET /reports/integration-performance` (runs, success rate, avg duration, records)
- `GET /reports/data-quality` (overall grade, by entity/dimension)

## Architecture notes

- **Models**: `app/Models/*` — relationships, fillables, casts, search scopes.
- **Services** (`app/Services/`):
  - `ETLService` — simulated per-source extraction, validation/dedup transform, transactional load, full run logged to `integration_logs`.
  - `DataQualityService` — 5-dimension checks, persisted to `data_quality_logs`.
  - `AuditService` — `log()/model()/login()/logout()` helpers writing `audit_logs` (user, action, entity, details, IP).
  - `StockService` — shared stock movement logic (in/out/adjust) with oversell guard; used by sales + ETL.
- **Middleware**: `role:` / `permission:` (`app/Http/Middleware/`), Sanctum bearer tokens, `shouldRenderJsonWhen` for JSON errors (`bootstrap/app.php`).
- **Seeders**: `DatabaseSeeder` → roles/permissions, users, categories (10), products (21 + inventory), customers (15), ~130 sales with payment records across 60 days, 4 data sources, sample integration + data-quality logs.

## Verification performed

- `php artisan migrate:fresh --seed` → OK (MySQL `retail_edm`)
- `php artisan route:list` → all routes registered
- HTTP smoke tests (42 checks) against `php artisan serve`: login/RBAC/dashboard/CRUD/sales/oversell/ETL/DQ/reports/audit all passing.
- CORS preflight from `http://localhost:3000` → 204 with correct headers.
