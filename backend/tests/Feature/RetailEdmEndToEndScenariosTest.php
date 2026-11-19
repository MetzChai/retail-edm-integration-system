<?php

namespace Tests\Feature;

use App\Models\CdcEvent;
use App\Models\Customer;
use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\Product;
use App\Models\Sale;
use App\Models\Shipment;
use App\Models\User;
use Tests\TestCase;

class RetailEdmEndToEndScenariosTest extends TestCase
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

    public function test_scenario_1_pos_sale_updates_inventory_receipt_and_cdc(): void
    {
        $headers = $this->authHeaders();

        // 1. Pick an active product with stock
        $product = Product::with('inventory')->where('status', 'active')->firstOrFail();
        $initialStock = $product->inventory->quantity;

        // Ensure stock is sufficient
        if ($initialStock < 5) {
            $product->inventory->update(['quantity' => 20]);
            $initialStock = 20;
        }

        $customer = Customer::first() ?? Customer::create(['name' => 'POS Test Customer', 'email' => 'postest@example.com']);

        // 2. Execute POS sale with discount
        $saleRes = $this->postJson('/api/sales', [
            'customer_id' => $customer->id,
            'payment_method' => 'cash',
            'source' => 'pos',
            'discount' => 15.00,
            'notes' => 'E2E POS Test Sale',
            'items' => [
                [
                    'product_id' => $product->id,
                    'quantity' => 2,
                ],
            ],
        ], $headers);

        $saleRes->assertStatus(201);
        $saleId = $saleRes->json('sale.id');
        $this->assertNotNull($saleId);

        // 3. Verify stock deduction
        $product->refresh();
        $this->assertEquals($initialStock - 2, $product->inventory->quantity);

        // 4. Verify inventory transaction recorded
        $hasTx = InventoryTransaction::where('product_id', $product->id)
            ->where('reference', $saleRes->json('sale.transaction_no'))
            ->exists();
        $this->assertTrue($hasTx);

        // 5. Verify receipt endpoint calculates subtotal and discount
        $receiptRes = $this->getJson("/api/sales/{$saleId}/receipt", $headers);
        $receiptRes->assertStatus(200)
            ->assertJsonStructure([
                'transaction_no', 'total', 'discount', 'subtotal', 'items',
            ]);
        $this->assertEquals(15.00, (float) $receiptRes->json('discount'));

        // 6. Verify CDC event captured on inventory mutation
        $hasCdc = CdcEvent::where('entity', 'inventory')
            ->where('entity_id', $product->id)
            ->where('operation', 'UPDATE')
            ->exists();
        $this->assertTrue($hasCdc);
    }

    public function test_scenario_2_online_storefront_order_deducts_stock_and_creates_shipment(): void
    {
        $product = Product::with('inventory')->where('status', 'active')->firstOrFail();
        if ($product->inventory->quantity < 5) {
            $product->inventory->update(['quantity' => 25]);
        }
        $initialStock = $product->inventory->quantity;

        // Guest checkout from storefront
        $res = $this->postJson('/api/storefront/checkout', [
            'name' => 'E-Commerce Guest Buyer',
            'email' => 'guest.shopper@retail.test',
            'contact_number' => '0918-987-6543',
            'delivery_address' => 'Unit 12B, Ayala Tower, Makati City',
            'payment_method' => 'card',
            'items' => [
                [
                    'product_id' => $product->id,
                    'quantity' => 1,
                ],
            ],
        ]);

        $res->assertStatus(201)
            ->assertJsonStructure([
                'order_number',
                'tracking_number',
                'logistics_provider',
                'sale' => ['id', 'transaction_no', 'status', 'source'],
            ]);

        $this->assertNotNull($res->json('tracking_number'));
        $this->assertEquals('LBC Express', $res->json('logistics_provider'));

        // Verify stock deducted
        $product->refresh();
        $this->assertEquals($initialStock - 1, $product->inventory->quantity);

        // Verify shipment record in database
        $saleId = $res->json('sale.id');
        $shipment = Shipment::where('sale_id', $saleId)->first();
        $this->assertNotNull($shipment);
        $this->assertEquals($res->json('tracking_number'), $shipment->tracking_number);
    }

    public function test_scenario_3_stock_synchronization_prevents_overselling(): void
    {
        $product = Product::with('inventory')->where('status', 'active')->firstOrFail();
        $currentStock = $product->inventory->quantity;

        // Try to buy currentStock + 50
        $res = $this->postJson('/api/storefront/checkout', [
            'name' => 'Oversell Attempt',
            'email' => 'oversell@retail.test',
            'contact_number' => '0917-000-1111',
            'delivery_address' => 'Quezon City',
            'payment_method' => 'card',
            'items' => [
                [
                    'product_id' => $product->id,
                    'quantity' => $currentStock + 50,
                ],
            ],
        ]);

        $res->assertStatus(422);
        $this->assertStringContainsString('Insufficient stock', $res->json('message'));

        // Verify stock unchanged
        $product->refresh();
        $this->assertEquals($currentStock, $product->inventory->quantity);
    }

    public function test_scenario_4_crm_customer_segmentation_and_personalized_offers(): void
    {
        $headers = $this->authHeaders();

        // 1. Fetch customer segments
        $segRes = $this->getJson('/api/customers/segments', $headers);
        $segRes->assertStatus(200)
            ->assertJsonStructure([
                'success',
                'segments',
                'total_customers',
            ]);

        // 2. Fetch customer offers
        $customer = Customer::firstOrFail();
        $offerRes = $this->getJson("/api/customers/{$customer->id}/offers", $headers);
        $offerRes->assertStatus(200)
            ->assertJsonStructure([
                'success',
                'customer' => ['id', 'name', 'segment_tier'],
                'offers',
                'summary' => ['preferred_categories', 'average_order_value', 'total_orders'],
            ]);

        $this->assertIsArray($offerRes->json('offers'));
        $this->assertNotEmpty($offerRes->json('offers'));
    }

    public function test_scenario_5_logistics_tracking_and_carrier_status_advance(): void
    {
        $headers = $this->authHeaders();

        // 1. Create a shipment
        $sale = Sale::firstOrFail();
        $shipment = Shipment::create([
            'sale_id' => $sale->id,
            'tracking_number' => Shipment::generateTrackingNumber('LBC Express'),
            'logistics_provider' => 'LBC Express',
            'status' => Shipment::STATUS_PENDING,
            'recipient_name' => 'Maria Clara',
            'recipient_phone' => '0917-123-4567',
            'shipping_address' => 'Intramuros, Manila',
        ]);

        // 2. Advance status via simulation endpoint
        $advRes = $this->postJson("/api/shipments/{$shipment->id}/advance", [], $headers);
        $advRes->assertStatus(200);
        $this->assertEquals(Shipment::STATUS_READY_FOR_SHIPMENT, $advRes->json('shipment.status'));

        // 3. Track endpoint public access
        $trackRes = $this->getJson("/api/shipments/track/{$shipment->tracking_number}");
        $trackRes->assertStatus(200)
            ->assertJsonStructure([
                'success',
                'shipment' => ['tracking_number', 'status', 'carrier', 'recipient_name'],
                'history',
            ]);
    }

    public function test_scenario_6_data_integration_five_sources_and_virtualization(): void
    {
        $headers = $this->authHeaders();

        // 1. Sync all sources
        $syncRes = $this->postJson('/api/integration/sync-all', [], $headers);
        $syncRes->assertStatus(200);
        $results = $syncRes->json('results');
        $this->assertIsArray($results);
        $this->assertCount(5, $results);

        // Verify Logistics source was synced
        $hasLogistics = collect($results)->contains(fn ($r) => str_contains($r['source'], 'Logistics'));
        $this->assertTrue($hasLogistics);

        // 2. Test Data Virtualization federated view
        $virtRes = $this->getJson('/api/integration/virtualized-view', $headers);
        $virtRes->assertStatus(200)
            ->assertJsonStructure([
                'success',
                'method',
                'federated_inventory',
                'summary' => ['total_products', 'total_warehouse_stock', 'total_pos_reserved', 'total_online_available'],
            ]);

        // 3. Test CDC stream endpoint
        $cdcRes = $this->getJson('/api/integration/cdc-stream', $headers);
        $cdcRes->assertStatus(200)
            ->assertJsonStructure([
                'success',
                'count',
                'data',
            ]);
    }

    public function test_scenario_7_data_quality_five_dimensions_evaluation(): void
    {
        $headers = $this->authHeaders();

        $runRes = $this->postJson('/api/data-quality/run', [], $headers);
        $runRes->assertStatus(200)
            ->assertJsonStructure([
                'message',
                'results' => [
                    'overall_score',
                    'grade',
                    'dimensions' => ['completeness', 'accuracy', 'consistency', 'uniqueness', 'validity'],
                    'checks',
                    'history',
                ],
            ]);

        $checks = $runRes->json('results.checks');
        $this->assertNotEmpty($checks);

        // Assert recommended correction is present in findings
        $firstCheck = $checks[0];
        $this->assertArrayHasKey('details', $firstCheck);
        $this->assertArrayHasKey('recommended_correction', $firstCheck['details']);
    }

    public function test_scenario_8_rbac_staff_and_manager_boundaries(): void
    {
        // 1. Staff user login and boundary checks
        $staffUser = User::whereHas('role', fn ($q) => $q->where('name', 'staff'))->first();
        if ($staffUser) {
            \Laravel\Sanctum\Sanctum::actingAs($staffUser);

            // Staff CANNOT access user management
            $this->getJson('/api/users')->assertStatus(403);

            // Staff CAN access products for POS
            $this->getJson('/api/products')->assertStatus(200);
        }

        // 2. Admin CAN access user management
        $adminUser = User::where('email', 'admin@retail.test')->firstOrFail();
        \Laravel\Sanctum\Sanctum::actingAs($adminUser);
        $this->getJson('/api/users')->assertStatus(200);
    }

    public function test_scenario_9_sales_analytics_and_channel_filtering(): void
    {
        $headers = $this->authHeaders();

        // 1. Combined sales report
        $allRes = $this->getJson('/api/reports/sales?period=daily&source=all', $headers);
        $allRes->assertStatus(200)
            ->assertJsonStructure([
                'period',
                'source',
                'summary' => ['orders', 'revenue', 'pos_orders', 'pos_revenue', 'online_orders', 'online_revenue'],
                'rows',
            ]);

        // 2. POS sales only
        $posRes = $this->getJson('/api/reports/sales?period=daily&source=pos', $headers);
        $posRes->assertStatus(200);
        $this->assertEquals('pos', $posRes->json('source'));

        // 3. Online sales only
        $onlineRes = $this->getJson('/api/reports/sales?period=daily&source=online', $headers);
        $onlineRes->assertStatus(200);
        $this->assertEquals('online', $onlineRes->json('source'));
    }
}
