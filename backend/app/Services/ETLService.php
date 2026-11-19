<?php

namespace App\Services;

use App\Models\Category;
use App\Models\CdcEvent;
use App\Models\Customer;
use App\Models\DataSource;
use App\Models\IntegrationLog;
use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Shipment;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Extract - Transform - Load service.
 *
 * Pulls records from a configured source (POS, Inventory, CRM, Storefront, Logistics),
 * validates + deduplicates them, loads them into the ERP tables inside a
 * transaction, and writes a detailed IntegrationLog entry either way.
 */
class ETLService
{
    public function __construct(private AuditService $audit)
    {
    }

    /**
     * Run a full sync for a data source.
     *
     * @return array{log: IntegrationLog, summary: array<string, mixed>}
     */
    public function sync(DataSource $source, ?int $userId = null): array
    {
        $log = IntegrationLog::create([
            'data_source_id' => $source->id,
            'source' => $source->type,
            'operation' => 'sync',
            'status' => 'running',
            'started_at' => now(),
            'user_id' => $userId,
        ]);

        $source->update(['status' => 'syncing']);

        $summary = [
            'extracted' => 0,
            'transformed' => 0,
            'inserted' => 0,
            'updated' => 0,
            'duplicates' => 0,
            'invalid' => 0,
            'errors' => [],
        ];

        try {
            $raw = $this->extract($source);
            $summary['extracted'] = count($raw);

            [$valid, $invalid] = $this->transform($raw, $source->type);
            $summary['transformed'] = count($valid);
            $summary['invalid'] = count($invalid);

            $load = $this->load($valid, $source->type);
            $summary = array_merge($summary, $load);

            $failed = count($invalid);
            $status = $failed === 0 ? 'success' : ($load['inserted'] + $load['updated'] > 0 ? 'partial' : 'failed');

            $log->update([
                'status' => $status,
                'records_processed' => $load['inserted'] + $load['updated'],
                'records_failed' => $failed,
                'errors' => $failed ? json_encode($invalid, JSON_UNESCAPED_UNICODE) : null,
                'finished_at' => now(),
            ]);

            $source->update([
                'status' => $status === 'failed' ? 'error' : 'active',
                'last_sync_at' => now(),
                'last_sync_records' => $load['inserted'] + $load['updated'],
            ]);

            $this->audit->log('sync', 'DataSource', $source->id, [
                'type' => $source->type,
                'summary' => $summary,
            ]);
        } catch (\Throwable $e) {
            $log->update([
                'status' => 'failed',
                'errors' => $e->getMessage(),
                'finished_at' => now(),
            ]);
            $source->update(['status' => 'error']);

            $summary['errors'][] = $e->getMessage();

            $this->audit->log('sync_failed', 'DataSource', $source->id, [
                'type' => $source->type,
                'error' => $e->getMessage(),
            ]);
        }

        return ['log' => $log->fresh(), 'summary' => $summary];
    }

    /**
     * EXTRACT: pull raw records from the source.
     *
     * @return array<int, array<string, mixed>>
     */
    protected function extract(DataSource $source): array
    {
        return match ($source->type) {
            'POS' => $this->extractPos(),
            'Inventory' => $this->extractInventory(),
            'CRM' => $this->extractCrm(),
            'OnlineStorefront' => $this->extractOnlineStorefront(),
            'Logistics' => $this->extractLogistics(),
            default => [],
        };
    }

    /**
     * POS: new sales transactions from the till.
     */
    protected function extractPos(): array
    {
        $rows = [];
        $count = random_int(3, 5);

        for ($i = 0; $i < $count; $i++) {
            $product = Product::inRandomOrder()->first();
            if (!$product) {
                continue;
            }

            $rows[] = [
                'external_id' => 'POS-' . now()->format('Ymd') . '-' . Str::upper(Str::random(4)),
                'sku' => $product->sku,
                'quantity' => random_int(1, 3),
                'unit_price' => (string) $product->price,
                'payment_method' => ['cash', 'card', 'ewallet'][random_int(0, 2)],
                'sold_at' => now()->subMinutes(random_int(5, 120))->toDateTimeString(),
                'customer_email' => Customer::whereNull('merged_into_id')->inRandomOrder()->value('email'),
            ];
        }

        return $rows;
    }

    /**
     * Inventory: stock level snapshots from the warehouse.
     */
    protected function extractInventory(): array
    {
        return Product::with('inventory')->get()->map(function (Product $p) {
            return [
                'external_id' => 'INV-' . $p->sku,
                'sku' => $p->sku,
                'quantity' => max(0, ($p->inventory->quantity ?? 10) + random_int(-1, 3)),
                'min_stock' => $p->inventory->min_stock ?? 5,
                'snapshot_at' => now()->toDateTimeString(),
            ];
        })->all();
    }

    /**
     * CRM: customer master data.
     */
    protected function extractCrm(): array
    {
        $rows = [];

        for ($i = 1; $i <= 3; $i++) {
            $rows[] = [
                'external_id' => 'CRM-' . now()->format('Ymd') . '-' . $i,
                'name' => 'CRM Contact ' . Str::studly(Str::random(5)),
                'email' => 'crm.' . Str::lower(Str::random(7)) . '@retail.test',
                'phone' => '0917' . random_int(1000000, 9999999),
                'city' => ['Manila', 'Cebu', 'Davao', 'Makati', 'Quezon City'][random_int(0, 4)],
            ];
        }

        // Include one duplicate to exercise dedup rules
        $existing = Customer::whereNotNull('email')->inRandomOrder()->first();
        if ($existing) {
            $rows[] = [
                'external_id' => 'CRM-DUP-' . $existing->id,
                'name' => $existing->name,
                'email' => $existing->email,
                'phone' => $existing->phone,
                'city' => $existing->city,
            ];
        }

        return $rows;
    }

    /**
     * OnlineStorefront: new web orders.
     */
    protected function extractOnlineStorefront(): array
    {
        $rows = [];

        for ($i = 1; $i <= random_int(2, 4); $i++) {
            $product = Product::inRandomOrder()->first();
            if (!$product) {
                continue;
            }

            $rows[] = [
                'external_id' => 'WEB-' . now()->format('Ymd') . '-' . Str::upper(Str::random(4)),
                'sku' => $product->sku,
                'quantity' => random_int(1, 2),
                'unit_price' => (string) $product->price,
                'payment_method' => ['card', 'ewallet', 'cash'][random_int(0, 2)],
                'ordered_at' => now()->subMinutes(random_int(10, 300))->toDateTimeString(),
                'customer_email' => Customer::whereNull('merged_into_id')->inRandomOrder()->value('email'),
            ];
        }

        return $rows;
    }

    /**
     * Logistics: Pull carrier tracking updates and dispatches for online orders.
     */
    protected function extractLogistics(): array
    {
        $rows = [];

        // 1. Find existing online sales that need shipment updates
        $sales = Sale::where('source', 'online')
            ->with(['shipment', 'customer'])
            ->latest('id')
            ->limit(10)
            ->get();

        $carriers = ['LBC Express', 'J&T Express', 'Ninja Van', '2GO'];

        foreach ($sales as $sale) {
            $shipment = $sale->shipment;

            if (!$shipment) {
                // New shipment creation
                $carrier = $carriers[array_rand($carriers)];
                $rows[] = [
                    'external_id' => 'LOG-' . $sale->transaction_no,
                    'sale_id' => $sale->id,
                    'order_reference' => $sale->transaction_no,
                    'tracking_number' => Shipment::generateTrackingNumber($carrier),
                    'logistics_provider' => $carrier,
                    'status' => 'ready_for_shipment',
                    'recipient_name' => $sale->customer?->name ?? 'Online Shopper',
                    'recipient_phone' => $sale->customer?->phone ?? '09170000000',
                    'shipping_address' => $sale->customer?->address ?? ($sale->customer?->city ?? 'Metro Manila Delivery Hub'),
                    'estimated_delivery_at' => now()->addDays(3)->toDateTimeString(),
                ];
            } elseif ($shipment->status !== Shipment::STATUS_DELIVERED && $shipment->status !== Shipment::STATUS_RETURNED) {
                // Advance status
                $nextStatus = match ($shipment->status) {
                    'pending' => 'ready_for_shipment',
                    'ready_for_shipment' => 'shipped',
                    'shipped' => 'in_transit',
                    'in_transit' => 'out_for_delivery',
                    'out_for_delivery' => 'delivered',
                    default => 'in_transit',
                };

                $rows[] = [
                    'external_id' => 'LOG-UPD-' . $shipment->tracking_number,
                    'sale_id' => $sale->id,
                    'order_reference' => $sale->transaction_no,
                    'tracking_number' => $shipment->tracking_number,
                    'logistics_provider' => $shipment->logistics_provider,
                    'status' => $nextStatus,
                    'recipient_name' => $shipment->recipient_name,
                    'recipient_phone' => $shipment->recipient_phone,
                    'shipping_address' => $shipment->shipping_address,
                    'delivered_at' => $nextStatus === 'delivered' ? now()->toDateTimeString() : null,
                ];
            }
        }

        // If no sales needed updates, generate at least 1 simulated carrier test update
        if (empty($rows)) {
            $anySale = Sale::where('source', 'online')->first();
            if ($anySale) {
                $carrier = 'LBC Express';
                $rows[] = [
                    'external_id' => 'LOG-SIM-' . now()->format('YmdHis'),
                    'sale_id' => $anySale->id,
                    'order_reference' => $anySale->transaction_no,
                    'tracking_number' => Shipment::generateTrackingNumber($carrier),
                    'logistics_provider' => $carrier,
                    'status' => 'in_transit',
                    'recipient_name' => $anySale->customer?->name ?? 'Simulated Recipient',
                    'shipping_address' => 'Central Hub, NCR',
                ];
            }
        }

        return $rows;
    }

    /**
     * TRANSFORM: validate + normalise + deduplicate raw records.
     */
    protected function transform(array $rows, string $type): array
    {
        $valid = [];
        $invalid = [];
        $seen = [];

        foreach ($rows as $index => $row) {
            $errors = [];

            if ($type === 'POS' || $type === 'OnlineStorefront') {
                if (empty($row['sku'])) {
                    $errors[] = 'sku is required';
                }
                if (!isset($row['quantity']) || (int) $row['quantity'] <= 0) {
                    $errors[] = 'quantity must be > 0';
                }
                if (!isset($row['unit_price']) || !is_numeric($row['unit_price'])) {
                    $errors[] = 'unit_price must be numeric';
                }
                if (empty($row['external_id'])) {
                    $errors[] = 'external_id is required';
                }
            } elseif ($type === 'Inventory') {
                if (empty($row['sku'])) {
                    $errors[] = 'sku is required';
                }
                if (!isset($row['quantity']) || !is_numeric($row['quantity'])) {
                    $errors[] = 'quantity must be numeric';
                }
            } elseif ($type === 'CRM') {
                if (empty($row['name'])) {
                    $errors[] = 'name is required';
                }
                if (empty($row['email']) && empty($row['phone'])) {
                    $errors[] = 'email or phone is required';
                }
                if (!empty($row['email']) && !filter_var($row['email'], FILTER_VALIDATE_EMAIL)) {
                    $errors[] = 'invalid email format';
                }
            } elseif ($type === 'Logistics') {
                if (empty($row['tracking_number'])) {
                    $errors[] = 'tracking_number is required';
                }
                if (empty($row['sale_id'])) {
                    $errors[] = 'sale_id is required';
                }
                if (empty($row['status'])) {
                    $errors[] = 'status is required';
                }
            }

            // Intra-batch dedup on external id
            $dedupKey = $row['external_id'] ?? ($row['tracking_number'] ?? md5(json_encode($row)));
            if (isset($seen[$dedupKey])) {
                $errors[] = 'duplicate record in batch';
            }
            $seen[$dedupKey] = true;

            if ($errors) {
                $invalid[] = ['index' => $index, 'record' => $row, 'errors' => $errors];
                continue;
            }

            $row = $this->normalise($row, $type);
            $valid[] = $row;
        }

        return [$valid, $invalid];
    }

    protected function normalise(array $row, string $type): array
    {
        if (isset($row['quantity'])) {
            $row['quantity'] = (int) $row['quantity'];
        }
        if (isset($row['unit_price'])) {
            $row['unit_price'] = round((float) $row['unit_price'], 2);
        }
        if (!empty($row['email'])) {
            $row['email'] = strtolower(trim((string) $row['email']));
        }
        if (!empty($row['sku'])) {
            $row['sku'] = strtoupper(trim((string) $row['sku']));
        }
        if (!empty($row['tracking_number'])) {
            $row['tracking_number'] = strtoupper(trim((string) $row['tracking_number']));
        }

        return $row;
    }

    /**
     * LOAD: write transformed records inside a transaction with dedup checks.
     */
    protected function load(array $rows, string $type): array
    {
        $stats = ['inserted' => 0, 'updated' => 0, 'duplicates' => 0, 'errors' => []];

        DB::transaction(function () use ($rows, $type, &$stats) {
            foreach ($rows as $row) {
                try {
                    match ($type) {
                        'CRM' => $this->loadCustomer($row, $stats),
                        'Inventory' => $this->loadInventory($row, $stats),
                        'POS', 'OnlineStorefront' => $this->loadSale($row, $type, $stats),
                        'Logistics' => $this->loadLogistics($row, $stats),
                        default => null,
                    };
                } catch (\Throwable $e) {
                    $stats['errors'][] = $e->getMessage();
                }
            }
        });

        return $stats;
    }

    protected function loadCustomer(array $row, array &$stats): void
    {
        $existing = null;

        if (!empty($row['email'])) {
            $existing = Customer::where('email', $row['email'])->first();
        }
        if (!$existing && !empty($row['phone'])) {
            $existing = Customer::where('phone', $row['phone'])->first();
        }

        if ($existing) {
            $stats['duplicates']++;
            return;
        }

        $customer = Customer::create([
            'name' => $row['name'],
            'email' => $row['email'] ?? null,
            'phone' => $row['phone'] ?? null,
            'city' => $row['city'] ?? null,
            'notes' => 'Synced from CRM Hub',
        ]);

        CdcEvent::capture('customer', $customer->id, 'INSERT', null, [
            'name' => $customer->name,
            'email' => $customer->email,
        ]);

        $stats['inserted']++;
    }

    protected function loadInventory(array $row, array &$stats): void
    {
        $product = Product::where('sku', $row['sku'])->first();

        if (!$product) {
            $stats['errors'][] = "Unknown SKU {$row['sku']}";
            return;
        }

        $inventory = Inventory::firstOrNew(['product_id' => $product->id]);
        $oldQty = $inventory->quantity ?? 0;

        if ($inventory->exists) {
            if ($inventory->quantity !== $row['quantity']) {
                $inventory->update([
                    'quantity' => $row['quantity'],
                    'min_stock' => $row['min_stock'] ?? $inventory->min_stock,
                ]);

                InventoryTransaction::create([
                    'product_id' => $product->id,
                    'type' => InventoryTransaction::TYPE_ADJUSTMENT,
                    'quantity' => $row['quantity'],
                    'reference' => 'ETL-SYNC',
                    'notes' => "Synchronized warehouse stock level from {$oldQty} to {$row['quantity']}",
                    'created_at' => now(),
                ]);

                CdcEvent::capture('inventory', $product->id, 'UPDATE', ['quantity' => $oldQty], ['quantity' => $row['quantity']]);

                $stats['updated']++;
            } else {
                $stats['duplicates']++;
            }
        } else {
            Inventory::create([
                'product_id' => $product->id,
                'quantity' => $row['quantity'],
                'min_stock' => $row['min_stock'] ?? 5,
            ]);

            InventoryTransaction::create([
                'product_id' => $product->id,
                'type' => InventoryTransaction::TYPE_STOCK_IN,
                'quantity' => $row['quantity'],
                'reference' => 'ETL-INIT',
                'notes' => 'Initial inventory load via ETL',
                'created_at' => now(),
            ]);

            CdcEvent::capture('inventory', $product->id, 'INSERT', null, ['quantity' => $row['quantity']]);

            $stats['inserted']++;
        }
    }

    protected function loadSale(array $row, string $type, array &$stats): void
    {
        if (Sale::where('transaction_no', $row['external_id'])->exists()) {
            $stats['duplicates']++;
            return;
        }

        $product = Product::where('sku', $row['sku'])->first();
        if (!$product) {
            $stats['errors'][] = "Unknown SKU {$row['sku']}";
            return;
        }

        $qty = (int) $row['quantity'];
        $price = (float) $row['unit_price'];
        $customer = !empty($row['customer_email'])
            ? Customer::where('email', $row['customer_email'])->first()
            : null;

        $sale = Sale::create([
            'transaction_no' => $row['external_id'],
            'customer_id' => $customer?->id,
            'total' => round($qty * $price, 2),
            'payment_method' => $row['payment_method'] ?? 'cash',
            'status' => 'completed',
            'source' => $type === 'POS' ? 'pos' : 'online',
        ]);

        SaleItem::create([
            'sale_id' => $sale->id,
            'product_id' => $product->id,
            'quantity' => $qty,
            'price' => $price,
            'subtotal' => round($qty * $price, 2),
        ]);

        // Deduct inventory and record an InventoryTransaction movement row!
        $inventory = Inventory::firstOrNew(['product_id' => $product->id]);
        $oldQty = (int) ($inventory->quantity ?? 0);
        $newQty = max(0, $oldQty - $qty);
        $inventory->quantity = $newQty;
        $inventory->save();

        InventoryTransaction::create([
            'product_id' => $product->id,
            'type' => InventoryTransaction::TYPE_STOCK_OUT,
            'quantity' => $qty,
            'reference' => $sale->transaction_no,
            'notes' => "Sale via {$type} ingestion #{$sale->transaction_no}",
            'created_at' => now(),
        ]);

        CdcEvent::capture('sale', $sale->id, 'INSERT', null, [
            'transaction_no' => $sale->transaction_no,
            'total' => $sale->total,
            'source' => $sale->source,
        ]);

        $stats['inserted']++;
    }

    protected function loadLogistics(array $row, array &$stats): void
    {
        $shipment = Shipment::where('tracking_number', $row['tracking_number'])
            ->orWhere('sale_id', $row['sale_id'])
            ->first();

        if ($shipment) {
            $oldStatus = $shipment->status;
            $newStatus = $row['status'];

            $shipment->update([
                'tracking_number' => $row['tracking_number'],
                'logistics_provider' => $row['logistics_provider'] ?? $shipment->logistics_provider,
                'status' => $newStatus,
                'delivered_at' => $newStatus === 'delivered' ? ($shipment->delivered_at ?? now()) : $shipment->delivered_at,
            ]);

            // Sync order status with shipment status
            if ($shipment->sale) {
                if ($newStatus === 'delivered') {
                    $shipment->sale->update(['status' => 'completed']);
                } elseif ($newStatus === 'shipped' || $newStatus === 'in_transit' || $newStatus === 'out_for_delivery') {
                    $shipment->sale->update(['status' => 'shipped']);
                }
            }

            CdcEvent::capture('shipment', $shipment->id, 'UPDATE', ['status' => $oldStatus], ['status' => $newStatus, 'tracking' => $shipment->tracking_number]);

            $stats['updated']++;
        } else {
            $newShipment = Shipment::create([
                'sale_id' => $row['sale_id'],
                'tracking_number' => $row['tracking_number'],
                'logistics_provider' => $row['logistics_provider'] ?? 'LBC Express',
                'status' => $row['status'] ?? 'ready_for_shipment',
                'recipient_name' => $row['recipient_name'] ?? null,
                'recipient_phone' => $row['recipient_phone'] ?? null,
                'shipping_address' => $row['shipping_address'] ?? null,
                'estimated_delivery_at' => $row['estimated_delivery_at'] ?? now()->addDays(3),
            ]);

            CdcEvent::capture('shipment', $newShipment->id, 'INSERT', null, [
                'tracking_number' => $newShipment->tracking_number,
                'provider' => $newShipment->logistics_provider,
                'status' => $newShipment->status,
            ]);

            $stats['inserted']++;
        }
    }
}
