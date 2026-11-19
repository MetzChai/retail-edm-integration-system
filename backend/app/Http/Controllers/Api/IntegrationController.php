<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CdcEvent;
use App\Models\Customer;
use App\Models\DataSource;
use App\Models\IntegrationLog;
use App\Models\Notification;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Shipment;
use App\Services\AuditService;
use App\Services\CdcService;
use App\Services\DataVirtualizationService;
use App\Services\ETLService;
use App\Services\StockService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class IntegrationController extends Controller
{
    public function __construct(
        private ETLService $etl,
        private StockService $stock,
        private AuditService $audit,
    ) {
    }

    /**
     * Trigger an ETL run for one source (by id or type).
     */
    public function sync(Request $request): JsonResponse
    {
        $data = $request->validate([
            'data_source_id' => ['nullable', 'exists:data_sources,id'],
            'type' => ['nullable', 'in:POS,Inventory,CRM,OnlineStorefront,Logistics'],
        ]);

        $source = null;
        if (!empty($data['data_source_id'])) {
            $source = DataSource::find($data['data_source_id']);
        } elseif (!empty($data['type'])) {
            $source = DataSource::where('type', $data['type'])->first();
        }

        if (!$source) {
            return response()->json(['message' => 'No matching data source found.'], 422);
        }

        $result = $this->etl->sync($source, $request->user()?->id);

        Notification::createNotification(
            'ETL Sync Completed',
            "Data source '{$source->name}' ({$source->type}) synchronized successfully.",
            $result['log']->status === 'failed' ? 'warning' : 'success',
            'sync',
            null,
            '/integration'
        );

        return response()->json([
            'message' => 'Sync completed.',
            'log' => $result['log'],
            'summary' => $result['summary'],
        ], 200);
    }

    /**
     * Trigger synchronization for ALL 5 enterprise data sources at once.
     */
    public function syncAll(Request $request): JsonResponse
    {
        $types = ['POS', 'Inventory', 'CRM', 'OnlineStorefront', 'Logistics'];
        $results = [];

        foreach ($types as $type) {
            $source = DataSource::firstOrCreate(
                ['type' => $type],
                [
                    'name' => match ($type) {
                        'POS' => 'Main Till POS System',
                        'Inventory' => 'Central Warehouse Inventory',
                        'CRM' => 'Customer CRM Hub',
                        'OnlineStorefront' => 'E-Commerce Online Storefront',
                        'Logistics' => 'National Express Logistics Network',
                    },
                    'status' => 'active',
                ]
            );

            $res = $this->etl->sync($source, $request->user()?->id);
            $results[] = [
                'source' => $source->name,
                'type' => $type,
                'status' => $res['log']->status,
                'records_processed' => $res['log']->records_processed,
                'records_failed' => $res['log']->records_failed,
                'summary' => $res['summary'],
            ];
        }

        Notification::createNotification(
            'All Data Sources Synchronized',
            'Full ETL pipeline completed across POS, Inventory, CRM, Storefront, and Logistics.',
            'success',
            'sync',
            null,
            '/integration'
        );

        return response()->json([
            'message' => 'All 5 enterprise retail data sources synchronized successfully.',
            'results' => $results,
        ]);
    }

    /**
     * View failed records for a specific integration log.
     */
    public function failedRecords(IntegrationLog $log): JsonResponse
    {
        $errors = $log->errors;
        $decoded = null;
        if ($errors) {
            $decoded = json_decode($errors, true) ?? $errors;
        }

        return response()->json([
            'log_id' => $log->id,
            'source' => $log->source,
            'status' => $log->status,
            'records_failed' => $log->records_failed,
            'errors' => $decoded,
        ]);
    }

    /**
     * Retry a failed synchronization log.
     */
    public function retry(Request $request, IntegrationLog $log): JsonResponse
    {
        $source = $log->dataSource ?? DataSource::where('type', $log->source)->first();
        if (!$source) {
            return response()->json(['message' => 'Associated data source not found.'], 404);
        }

        $result = $this->etl->sync($source, $request->user()?->id);

        Notification::createNotification(
            'ETL Retry Completed',
            "Retried synchronization for '{$source->name}'. Status: {$result['log']->status}.",
            $result['log']->status === 'failed' ? 'warning' : 'success',
            'sync',
            null,
            '/integration'
        );

        return response()->json([
            'message' => 'Synchronization retry completed.',
            'log' => $result['log'],
            'summary' => $result['summary'],
        ]);
    }

    public function logs(Request $request): JsonResponse
    {
        $logs = IntegrationLog::with(['dataSource', 'user'])
            ->when($request->query('source'), fn ($q, $s) => $q->where('source', $s))
            ->when($request->query('data_source_id'), fn ($q, $id) => $q->where('data_source_id', $id))
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->when($request->query('from'), fn ($q, $f) => $q->where('started_at', '>=', $f))
            ->when($request->query('to'), fn ($q, $t) => $q->where('started_at', '<=', $t.' 23:59:59'))
            ->latest('id')
            ->paginate($request->integer('per_page', 20));

        return response()->json($logs);
    }

    /**
     * Change Data Capture (CDC) live event stream endpoint.
     */
    public function cdcStream(Request $request, CdcService $cdc): JsonResponse
    {
        $stream = $cdc->getStream(
            $request->integer('limit', 50),
            $request->query('entity')
        );

        return response()->json($stream);
    }

    /**
     * Data Virtualization: Federated real-time multi-channel inventory view
     * without duplicating data into a secondary storage.
     */
    public function virtualizedView(Request $request, DataVirtualizationService $virtualization): JsonResponse
    {
        $data = $virtualization->getFederatedInventoryView($request->integer('limit', 25));

        return response()->json($data);
    }

    /**
     * Data Virtualization: Customer 360 federated view across POS, Online, and Logistics.
     */
    public function customer360(int $customer, DataVirtualizationService $virtualization): JsonResponse
    {
        $data = $virtualization->getCustomer360View($customer);

        return response()->json($data);
    }

    /**
     * Simulate an external online order arriving from the storefront.
     * Validates product, transactional stock deduction, logs integration result,
     * captures CDC event, and creates corresponding Logistics shipment.
     */
    public function onlineOrder(Request $request): JsonResponse
    {
        $data = $request->validate([
            'sku' => ['required', 'string', 'exists:products,sku'],
            'quantity' => ['required', 'integer', 'min:1'],
            'customer_email' => ['nullable', 'email'],
            'payment_method' => ['nullable', 'in:cash,card,ewallet,bank_transfer,credit'],
            'external_id' => ['nullable', 'string', 'max:100'],
        ]);

        $product = Product::with('inventory')->where('sku', $data['sku'])->firstOrFail();
        $qty = (int) $data['quantity'];

        if ($product->status !== 'active') {
            return response()->json(['message' => 'Product is not available.'], 422);
        }

        $externalId = $data['external_id'] ?? 'WEB-' . now()->format('YmdHis') . '-' . Str::upper(Str::random(4));

        if (Sale::where('transaction_no', $externalId)->exists()) {
            return response()->json([
                'message' => 'Order already processed (idempotent duplicate prevented).',
                'transaction_no' => $externalId,
            ], 409);
        }

        $dataSource = DataSource::where('type', 'OnlineStorefront')->first();

        try {
            $sale = $this->stock->transaction(function () use ($data, $product, $qty, $externalId, $request) {
                // Ensure customer exists or pick active customer
                $customer = !empty($data['customer_email'])
                    ? Customer::where('email', $data['customer_email'])->first()
                    : Customer::whereNull('merged_into_id')->inRandomOrder()->first();

                if (!$customer && !empty($data['customer_email'])) {
                    $customer = Customer::create([
                        'name' => 'Online Customer ' . Str::studly(Str::random(4)),
                        'email' => $data['customer_email'],
                        'phone' => '0917' . random_int(1000000, 9999999),
                        'city' => 'Manila',
                    ]);
                }

                $price = (float) $product->price;
                $total = round($price * $qty, 2);

                $sale = Sale::create([
                    'transaction_no' => $externalId,
                    'customer_id' => $customer?->id,
                    'user_id' => $request->user()?->id,
                    'total' => $total,
                    'discount' => 0,
                    'payment_method' => $data['payment_method'] ?? 'card',
                    'status' => 'confirmed',
                    'source' => 'online',
                    'notes' => 'Simulated external storefront order via REST API integration',
                ]);

                SaleItem::create([
                    'sale_id' => $sale->id,
                    'product_id' => $product->id,
                    'quantity' => $qty,
                    'price' => $price,
                    'subtotal' => $total,
                ]);

                // Deduct inventory atomically (throws RuntimeException if stock < qty)
                $this->stock->move($product, [
                    'type' => 'stock_out',
                    'quantity' => $qty,
                    'reference' => $externalId,
                    'notes' => "External order fulfillment #{$externalId}",
                    'user_id' => $request->user()?->id,
                ]);

                // Create Logistics shipment automatically for fulfillment
                $tracking = Shipment::generateTrackingNumber('LBC');
                Shipment::create([
                    'sale_id' => $sale->id,
                    'tracking_number' => $tracking,
                    'logistics_provider' => 'LBC Express',
                    'status' => Shipment::STATUS_READY,
                    'recipient_name' => $customer?->name ?? 'Guest Buyer',
                    'recipient_phone' => $customer?->phone ?? '09170000000',
                    'shipping_address' => $customer?->address ?? ($customer?->city ?? 'Central Delivery Hub'),
                    'estimated_delivery_at' => now()->addDays(3),
                    'notes' => 'Auto-dispatched via Storefront Integration',
                ]);

                return $sale;
            });

            // Write real IntegrationLog entry
            $log = IntegrationLog::create([
                'data_source_id' => $dataSource?->id,
                'source' => 'OnlineStorefront',
                'operation' => 'simulated_incoming_order',
                'status' => 'success',
                'records_processed' => 1,
                'records_failed' => 0,
                'started_at' => now(),
                'finished_at' => now(),
                'user_id' => $request->user()?->id,
            ]);

            if ($dataSource) {
                $dataSource->update([
                    'last_sync_at' => now(),
                    'last_sync_records' => 1,
                ]);
            }

            CdcEvent::capture('sale', $sale->id, 'INSERT', null, [
                'transaction_no' => $sale->transaction_no,
                'total' => $sale->total,
                'sku' => $product->sku,
                'quantity' => $qty,
                'source' => 'online',
            ]);

            Notification::createNotification(
                'Incoming Online Order Ingested',
                "Order #{$sale->transaction_no} accepted ({$qty}x {$product->name}) and dispatched to Logistics.",
                'success',
                'order',
                null,
                '/storefront'
            );

        } catch (\RuntimeException $e) {
            // Write failed IntegrationLog entry
            IntegrationLog::create([
                'data_source_id' => $dataSource?->id,
                'source' => 'OnlineStorefront',
                'operation' => 'simulated_incoming_order',
                'status' => 'failed',
                'records_processed' => 0,
                'records_failed' => 1,
                'errors' => $e->getMessage(),
                'started_at' => now(),
                'finished_at' => now(),
                'user_id' => $request->user()?->id,
            ]);

            return response()->json([
                'message' => $e->getMessage(),
                'oversold' => true,
                'available_stock' => $product->fresh('inventory')?->inventory?->quantity ?? 0,
            ], 409);
        }

        $this->audit->log('online_order', 'Sale', $sale->id, [
            'sku' => $product->sku,
            'quantity' => $qty,
            'total' => $sale->total,
        ]);

        return response()->json([
            'message' => 'Online storefront order successfully integrated, stock deducted, and shipment dispatched.',
            'sale' => [
                'id' => $sale->id,
                'transaction_no' => $sale->transaction_no,
                'total' => (float) $sale->total,
                'source' => $sale->source,
                'status' => $sale->status,
                'tracking_number' => $sale->shipment?->tracking_number,
            ],
            'inventory' => $product->fresh('inventory')?->inventory,
            'integration_log' => $log ?? null,
        ], 201);
    }
}
