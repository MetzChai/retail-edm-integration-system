<?php

use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DataSourceController;
use App\Http\Controllers\Api\DataQualityController;
use App\Http\Controllers\Api\GovernanceController;
use App\Http\Controllers\Api\IntegrationController;
use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\SaleController;
use App\Http\Controllers\Api\ShipmentController;
use App\Http\Controllers\Api\StorefrontController;
use App\Http\Middleware\EnsureAccountActive;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes (prefix: /api)
|--------------------------------------------------------------------------
|
| Auth: Sanctum bearer tokens. RBAC: `role:` and `permission:` middleware
| aliases registered in bootstrap/app.php.
|
*/

// ---------------------------------------------------------------- Public
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:30,1');
// Public self-registration: Staff or Manager request in `pending` status.
Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:10,1');

// Public Storefront & Guest Checkout: Customers can browse and order without an account.
Route::get('/storefront/products', [StorefrontController::class, 'products']);
Route::get('/storefront/categories', [StorefrontController::class, 'categories']);
Route::post('/storefront/checkout', [StorefrontController::class, 'checkout']);
Route::post('/guest-checkout', [StorefrontController::class, 'checkout']);
Route::get('/track/{trackingNumber}', [ShipmentController::class, 'track']);
Route::get('/shipments/track/{trackingNumber}', [ShipmentController::class, 'track']);

Route::middleware(['auth:sanctum', EnsureAccountActive::class])->group(function () {
    Route::get('/user', [AuthController::class, 'user']);
    Route::post('/logout', [AuthController::class, 'logout']);

    // ---------------------------------------------------- Notifications
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::post('/notifications/{notification}/read', [NotificationController::class, 'markAsRead']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllAsRead']);
    Route::delete('/notifications/{notification}', [NotificationController::class, 'destroy']);

    // ------------------------------------------------------- Dashboard
    Route::get('/dashboard', DashboardController::class);

    // ------------------------------------------------------- Categories
    Route::middleware('permission:categories.view')->group(function () {
        Route::get('/categories', [CategoryController::class, 'index']);
        Route::get('/categories/{category}', [CategoryController::class, 'show']);
    });
    Route::post('/categories', [CategoryController::class, 'store'])->middleware('permission:categories.manage');
    Route::put('/categories/{category}', [CategoryController::class, 'update'])->middleware('permission:categories.manage');
    Route::delete('/categories/{category}', [CategoryController::class, 'destroy'])->middleware('permission:categories.manage');

    // --------------------------------------------------------- Products
    Route::middleware('permission:products.view')->group(function () {
        Route::get('/products', [ProductController::class, 'index']);
        Route::get('/products/{product}', [ProductController::class, 'show']);
    });
    Route::post('/products', [ProductController::class, 'store'])->middleware('permission:products.manage');
    Route::put('/products/{product}', [ProductController::class, 'update'])->middleware('permission:products.manage');
    Route::delete('/products/{product}', [ProductController::class, 'destroy'])->middleware('permission:products.manage');

    // ------------------------------------------------------- Customers
    Route::middleware('permission:customers.view')->group(function () {
        Route::get('/customers', [CustomerController::class, 'index']);
        Route::get('/customers/segments', [CustomerController::class, 'segments']);
        Route::get('/customers-segments/summary', [CustomerController::class, 'segments']);
        Route::get('/customers-duplicates/check', [CustomerController::class, 'duplicates']);
        Route::get('/customers/{customer}', [CustomerController::class, 'show']);
        Route::get('/customers/{customer}/purchases', [CustomerController::class, 'purchases']);
        Route::get('/customers/{customer}/offers', [CustomerController::class, 'offers']);
    });
    Route::post('/customers', [CustomerController::class, 'store'])->middleware('permission:customers.manage');
    Route::put('/customers/{customer}', [CustomerController::class, 'update'])->middleware('permission:customers.manage');
    Route::delete('/customers/{customer}', [CustomerController::class, 'destroy'])->middleware('permission:customers.manage');
    Route::post('/customers/{customer}/merge', [CustomerController::class, 'merge'])->middleware('permission:customers.manage');

    // ------------------------------------------------------- Inventory
    Route::get('/inventory', [InventoryController::class, 'index'])->middleware('permission:inventory.view');
    Route::get('/inventory/history', [InventoryController::class, 'history'])->middleware('permission:inventory.view');
    Route::get('/inventory/movements', [InventoryController::class, 'history'])->middleware('permission:inventory.view');
    Route::get('/inventory/low-stock', [InventoryController::class, 'lowStock'])->middleware('permission:inventory.view');
    Route::post('/inventory/stock-in', [InventoryController::class, 'stockIn'])->middleware('permission:inventory.manage');
    Route::post('/inventory/stock-out', [InventoryController::class, 'stockOut'])->middleware('permission:inventory.manage');
    Route::post('/inventory/adjust', [InventoryController::class, 'adjust'])->middleware('permission:inventory.manage');

    // ------------------------------------------------------------ Sales
    Route::middleware('permission:sales.view')->group(function () {
        Route::get('/sales', [SaleController::class, 'index']);
        Route::get('/sales/{sale}', [SaleController::class, 'show']);
        Route::get('/sales/{sale}/receipt', [SaleController::class, 'receipt']);
    });
    Route::post('/sales', [SaleController::class, 'store'])->middleware('permission:sales.create');
    Route::patch('/sales/{sale}/status', [SaleController::class, 'updateStatus'])->middleware('permission:sales.create');
    Route::put('/sales/{sale}/status', [SaleController::class, 'updateStatus'])->middleware('permission:sales.create');
    Route::post('/sales/{sale}/status', [SaleController::class, 'updateStatus'])->middleware('permission:sales.create');
    Route::patch('/orders/{sale}/status', [SaleController::class, 'updateStatus'])->middleware('permission:sales.create');
    Route::put('/orders/{sale}/status', [SaleController::class, 'updateStatus'])->middleware('permission:sales.create');

    // ---------------------------------------------------- Logistics & Shipments
    Route::middleware('permission:sales.view')->group(function () {
        Route::get('/shipments', [ShipmentController::class, 'index']);
        Route::get('/shipments/{shipment}', [ShipmentController::class, 'show']);
    });
    Route::post('/shipments', [ShipmentController::class, 'store'])->middleware('permission:sales.create');
    Route::patch('/shipments/{shipment}', [ShipmentController::class, 'update'])->middleware('permission:sales.create');
    Route::put('/shipments/{shipment}', [ShipmentController::class, 'update'])->middleware('permission:sales.create');
    Route::post('/shipments/{shipment}/advance', [ShipmentController::class, 'advanceStatus'])->middleware('permission:sales.create');

    // --------------------------------------------------------- Payments
    Route::get('/payments', [PaymentController::class, 'index'])->middleware('permission:sales.view');
    Route::get('/payments/{payment}', [PaymentController::class, 'show'])->middleware('permission:sales.view');
    Route::post('/payments', [PaymentController::class, 'store'])->middleware('permission:sales.create');

    // ------------------------------------------------------ Data sources
    Route::middleware('permission:integration.view')->group(function () {
        Route::get('/data-sources', [DataSourceController::class, 'index']);
        Route::get('/data-sources/{dataSource}', [DataSourceController::class, 'show']);
    });
    Route::post('/data-sources', [DataSourceController::class, 'store'])->middleware('permission:integration.manage');
    Route::put('/data-sources/{dataSource}', [DataSourceController::class, 'update'])->middleware('permission:integration.manage');
    Route::delete('/data-sources/{dataSource}', [DataSourceController::class, 'destroy'])->middleware('permission:integration.manage');

    // ------------------------------------------------------ Integration
    Route::middleware('permission:integration.view')->group(function () {
        Route::get('/integration/logs', [IntegrationController::class, 'logs']);
        Route::get('/integration/failed/{log}', [IntegrationController::class, 'failedRecords']);
        Route::get('/integration/cdc-stream', [IntegrationController::class, 'cdcStream']);
        Route::get('/integration/virtualized-view', [IntegrationController::class, 'virtualizedView']);
        Route::get('/integration/customer-360/{customer}', [IntegrationController::class, 'customer360']);
        Route::post('/integration/online-order', [IntegrationController::class, 'onlineOrder'])->middleware('permission:sales.create');
    });
    Route::post('/integration/sync', [IntegrationController::class, 'sync'])->middleware('permission:integration.manage');
    Route::post('/integration/sync-all', [IntegrationController::class, 'syncAll'])->middleware('permission:integration.manage');
    Route::post('/integration/retry/{log}', [IntegrationController::class, 'retry'])->middleware('permission:integration.manage');

    // ----------------------------------------------------- Data quality
    Route::get('/data-quality/stats', [DataQualityController::class, 'stats'])->middleware('permission:integration.view');
    Route::post('/data-quality/run', [DataQualityController::class, 'run'])->middleware('permission:integration.manage');

    // ------------------------------------------------------- Governance & User Management (Admin Only)
    Route::middleware(['role:admin', 'permission:governance.manage'])->group(function () {
        Route::get('/governance/users', [GovernanceController::class, 'users']);
        Route::post('/governance/users', [GovernanceController::class, 'storeUser']);
        Route::put('/governance/users/{user}', [GovernanceController::class, 'updateUser']);
        Route::delete('/governance/users/{user}', [GovernanceController::class, 'destroyUser']);
        Route::get('/governance/roles', [GovernanceController::class, 'roles']);
        Route::get('/governance/activity', [GovernanceController::class, 'activity']);

        // User Management & Approval workflow
        Route::get('/users', [GovernanceController::class, 'users']);
        Route::get('/users/pending', [GovernanceController::class, 'pendingUsers']);
        Route::post('/users/{user}/approve', [GovernanceController::class, 'approve']);
        Route::post('/users/{user}/reject', [GovernanceController::class, 'reject']);
        Route::post('/users/{user}/activate', [GovernanceController::class, 'activate']);
        Route::post('/users/{user}/deactivate', [GovernanceController::class, 'deactivate']);
        Route::post('/users/{user}/toggle-active', [GovernanceController::class, 'toggleActive']);
        Route::post('/users/{user}/role', [GovernanceController::class, 'changeRole']);
        Route::put('/users/{user}/role', [GovernanceController::class, 'changeRole']);
        Route::post('/users/{user}/change-role', [GovernanceController::class, 'changeRole']);

        Route::get('/roles', [GovernanceController::class, 'roles']);
        Route::put('/roles/{role}/permissions', [GovernanceController::class, 'updateRolePermissions']);
        Route::post('/roles/{role}/permissions', [GovernanceController::class, 'updateRolePermissions']);
        Route::put('/governance/roles/{role}/permissions', [GovernanceController::class, 'updateRolePermissions']);
        Route::get('/permissions', [GovernanceController::class, 'permissions']);
    });

    // -------------------------------------------------------- Audit logs
    Route::get('/audit-logs', [AuditLogController::class, 'index'])->middleware('permission:governance.manage');
    Route::get('/audit-logs/meta', [AuditLogController::class, 'actions'])->middleware('permission:governance.manage');

    // ---------------------------------------------------------- Reports
    Route::middleware('permission:reports.view')->group(function () {
        Route::get('/reports/sales', [ReportController::class, 'sales']);
        Route::get('/reports/sales/{period}', [ReportController::class, 'sales'])->where('period', 'daily|weekly|monthly');
        Route::get('/reports/best-sellers', [ReportController::class, 'bestSellers']);
        Route::get('/reports/inventory', [ReportController::class, 'inventory']);
        Route::get('/reports/low-stock', [ReportController::class, 'lowStock']);
        Route::get('/reports/customers', [ReportController::class, 'customers']);
        Route::get('/reports/customers/{customer}/history', [ReportController::class, 'customerHistory']);
        Route::get('/reports/category-sales', [ReportController::class, 'categorySales']);
        Route::get('/reports/integration', [ReportController::class, 'integration']);
        Route::get('/reports/integration-performance', [ReportController::class, 'integrationPerformance']);
        Route::get('/reports/data-quality', [ReportController::class, 'dataQualityAssessment']);
        Route::get('/reports/export/{type}', [ReportController::class, 'exportCsv']);
    });
});
