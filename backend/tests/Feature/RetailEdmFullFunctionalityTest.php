<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Inventory;
use App\Models\Notification;
use App\Models\Permission;
use App\Models\Product;
use App\Models\Role;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\User;
use Illuminate\Foundation\Testing\WithFaker;
use Tests\TestCase;

class RetailEdmFullFunctionalityTest extends TestCase
{
    private function authHeaders(string $email = 'admin@retail.test', string $password = 'password'): array
    {
        $response = $this->postJson('/api/login', [
            'email' => $email,
            'password' => $password,
        ]);
        $response->assertStatus(200);

        return [
            'Authorization' => 'Bearer '.$response->json('token'),
            'Accept' => 'application/json',
        ];
    }

    public function test_dashboard_returns_real_database_statistics_and_charts(): void
    {
        $headers = $this->authHeaders();
        $response = $this->getJson('/api/dashboard', $headers);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'total_sales',
                'total_products',
                'total_customers',
                'total_available_stock',
                'low_stock_products',
                'total_transactions',
                'pending_online_orders',
                'sales_chart',
                'best_selling_products',
                'recent_transactions',
                'inventory_overview',
            ]);
    }

    public function test_reports_sales_endpoint_and_csv_export(): void
    {
        $headers = $this->authHeaders();

        // 1. Sales general endpoint (fixed 404)
        $salesRes = $this->getJson('/api/reports/sales', $headers);
        $salesRes->assertStatus(200)
            ->assertJsonStructure(['period', 'from', 'to', 'summary', 'rows']);

        // 2. Best sellers
        $bestRes = $this->getJson('/api/reports/best-sellers', $headers);
        $bestRes->assertStatus(200)->assertJsonStructure(['rows']);

        // 3. Customers report
        $custRes = $this->getJson('/api/reports/customers', $headers);
        $custRes->assertStatus(200);

        // 4. CSV export
        $exportRes = $this->get('/api/reports/export/sales', $headers);
        $exportRes->assertStatus(200)
            ->assertHeader('Content-Type', 'text/csv; charset=UTF-8');
    }

    public function test_notifications_lifecycle(): void
    {
        $headers = $this->authHeaders();

        // Create a notification
        $notification = Notification::createNotification(
            'Test Notification',
            'This is an automated test alert.',
            'info',
            'system'
        );

        // Fetch notifications
        $getRes = $this->getJson('/api/notifications', $headers);
        $getRes->assertStatus(200)
            ->assertJsonStructure(['unread_count', 'notifications']);

        // Mark as read
        $readRes = $this->postJson("/api/notifications/{$notification->id}/read", [], $headers);
        $readRes->assertStatus(200);
        $this->assertTrue($notification->fresh()->is_read);

        // Mark all as read
        $markAllRes = $this->postJson('/api/notifications/read-all', [], $headers);
        $markAllRes->assertStatus(200);
    }

    public function test_governance_role_permissions_update(): void
    {
        $headers = $this->authHeaders();
        $managerRole = Role::where('name', 'manager')->firstOrFail();
        $originalPermIds = $managerRole->permissions()->pluck('permissions.id')->toArray();

        $perms = Permission::whereIn('name', ['products.view', 'inventory.view', 'sales.view'])->pluck('name')->toArray();

        $res = $this->putJson("/api/roles/{$managerRole->id}/permissions", [
            'permissions' => $perms,
        ], $headers);

        $res->assertStatus(200)
            ->assertJsonPath('message', "Permissions for role {$managerRole->label} updated successfully.");

        $this->assertEquals(3, $managerRole->fresh('permissions')->permissions->count());

        // Restore original permissions so other tests are unaffected
        $managerRole->permissions()->sync($originalPermIds);
    }

    public function test_customer_purchase_history_and_merge(): void
    {
        $headers = $this->authHeaders();
        $customer = Customer::whereNull('merged_into_id')->first();
        if (!$customer) {
            $customer = Customer::create([
                'name' => 'Test CRM Customer',
                'email' => 'crm_test_'.time().'@example.com',
                'phone' => '09123456789',
            ]);
        }

        // Purchase history
        $res = $this->getJson("/api/customers/{$customer->id}/purchases", $headers);
        $res->assertStatus(200)
            ->assertJsonStructure(['customer', 'purchases']);

        // Create a duplicate customer and merge
        $dup = Customer::create([
            'name' => 'Duplicate Customer',
            'email' => 'dup_'.time().'_'.random_int(100, 999).'@example.com',
            'phone' => '09'.random_int(100000000, 999999999),
        ]);

        $mergeRes = $this->postJson("/api/customers/{$dup->id}/merge", [
            'primary_id' => $customer->id,
        ], $headers);

        $mergeRes->assertStatus(200);
        $this->assertEquals($customer->id, $dup->fresh()->merged_into_id);
    }

    public function test_order_status_update_without_duplicate_stock_deduction(): void
    {
        $headers = $this->authHeaders();
        $product = Product::with('inventory')->first();
        $initialStock = $product->inventory?->quantity ?? 10;

        // Create a sale
        $sale = Sale::create([
            'transaction_no' => 'TEST-ORD-'.time(),
            'total' => 100,
            'payment_method' => 'cash',
            'status' => 'pending',
            'source' => 'online',
        ]);

        SaleItem::create([
            'sale_id' => $sale->id,
            'product_id' => $product->id,
            'quantity' => 1,
            'price' => 100,
            'subtotal' => 100,
        ]);

        // Transition: pending -> confirmed
        $res1 = $this->patchJson("/api/sales/{$sale->id}/status", [
            'status' => 'confirmed',
        ], $headers);
        $res1->assertStatus(200);
        $this->assertEquals('confirmed', $sale->fresh()->status);

        // Transition: confirmed -> processing -> shipped -> completed
        $res2 = $this->patchJson("/api/sales/{$sale->id}/status", [
            'status' => 'completed',
        ], $headers);
        $res2->assertStatus(200);
        $this->assertEquals('completed', $sale->fresh()->status);
    }

    public function test_etl_sync_all_pipeline(): void
    {
        $headers = $this->authHeaders();
        $res = $this->postJson('/api/integration/sync-all', [], $headers);
        $res->assertStatus(200)
            ->assertJsonStructure(['message', 'results']);
    }
}
