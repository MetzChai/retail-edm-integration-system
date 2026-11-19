<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\Sale;
use App\Models\Shipment;
use Illuminate\Support\Facades\DB;

class DataVirtualizationService
{
    /**
     * Provide a virtualized, federated product stock & fulfillment view across all retail channels
     * without duplicating or materializing the data into a secondary cache.
     */
    public function getFederatedInventoryView(?int $limit = 25): array
    {
        $products = Product::with(['category', 'inventory'])
            ->where('status', 'active')
            ->orderBy('id')
            ->limit($limit)
            ->get();

        $rows = $products->map(function (Product $p) {
            $physicalStock = (int) ($p->inventory?->quantity ?? 0);

            // Virtualized calculation of committed online orders (processing / confirmed / pending)
            $committedOnline = (int) DB::table('sale_items')
                ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
                ->where('sale_items.product_id', $p->id)
                ->where('sales.source', 'online')
                ->whereIn('sales.status', ['pending', 'confirmed', 'processing'])
                ->sum('sale_items.quantity');

            // Units currently in logistics transit
            $inTransitUnits = (int) DB::table('sale_items')
                ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
                ->join('shipments', 'shipments.sale_id', '=', 'sales.id')
                ->where('sale_items.product_id', $p->id)
                ->whereIn('shipments.status', ['shipped', 'in_transit', 'out_for_delivery'])
                ->sum('sale_items.quantity');

            // Virtualized Net Available to Promise (ATP)
            $availableToPromise = max(0, $physicalStock);

            return [
                'product_id' => $p->id,
                'sku' => $p->sku,
                'name' => $p->name,
                'category' => $p->category?->name ?? 'General',
                'warehouse_physical_stock' => $physicalStock,
                'committed_online_orders' => $committedOnline,
                'logistics_in_transit' => $inTransitUnits,
                'available_to_promise' => $availableToPromise,
                'min_threshold' => (int) ($p->inventory?->min_stock ?? 5),
                'channel_allocation' => [
                    'pos_walk_in' => $availableToPromise,
                    'online_storefront' => $availableToPromise,
                ],
                'virtualized_at' => now()->toIso8601String(),
            ];
        });

        $totalWarehouse = (int) $products->sum(fn ($p) => $p->inventory?->quantity ?? 0);
        $totalCommitted = (int) $rows->sum('committed_online_orders');
        $totalAvailable = max(0, $totalWarehouse - $totalCommitted);

        return [
            'success' => true,
            'method' => 'Data Virtualization (Federated Multi-Source View)',
            'description' => 'Dynamically queries live ERP tables across Warehouse, POS ledger, Storefront, and 3PL Logistics without data movement or duplicate ETL tables.',
            'timestamp' => now()->toIso8601String(),
            'total_catalog_virtualized' => Product::where('status', 'active')->count(),
            'items' => $rows,
            'federated_inventory' => $rows,
            'summary' => [
                'total_products' => $products->count(),
                'total_warehouse_stock' => $totalWarehouse,
                'total_pos_reserved' => $totalWarehouse,
                'total_online_available' => $totalAvailable,
            ],
        ];
    }

    /**
     * Virtualized Customer 360 view aggregating POS sales, Online Storefront orders,
     * and 3PL Logistics delivery status on demand.
     */
    public function getCustomer360View(int $customerId): array
    {
        $customer = Customer::findOrFail($customerId);

        $sales = Sale::with(['items.product', 'shipment', 'payments'])
            ->where('customer_id', $customerId)
            ->latest('id')
            ->get();

        $posSales = $sales->where('source', 'pos');
        $onlineSales = $sales->where('source', 'online');

        $activeShipments = Shipment::whereIn('sale_id', $onlineSales->pluck('id'))
            ->whereNotIn('status', ['delivered', 'returned', 'failed_delivery'])
            ->get();

        return [
            'customer' => [
                'id' => $customer->id,
                'name' => $customer->name,
                'email' => $customer->email,
                'phone' => $customer->phone,
                'address' => $customer->address,
                'city' => $customer->city,
            ],
            'federated_summary' => [
                'total_lifetime_orders' => $sales->count(),
                'total_lifetime_spend' => round((float) $sales->sum('total'), 2),
                'pos_transactions_count' => $posSales->count(),
                'pos_spend' => round((float) $posSales->sum('total'), 2),
                'online_orders_count' => $onlineSales->count(),
                'online_spend' => round((float) $onlineSales->sum('total'), 2),
                'active_logistics_deliveries' => $activeShipments->count(),
            ],
            'recent_orders' => $sales->take(10)->map(fn (Sale $s) => [
                'transaction_no' => $s->transaction_no,
                'source' => $s->source,
                'status' => $s->status,
                'total' => (float) $s->total,
                'created_at' => $s->created_at?->toDateTimeString(),
                'shipment' => $s->shipment ? [
                    'tracking_number' => $s->shipment->tracking_number,
                    'provider' => $s->shipment->logistics_provider,
                    'status' => $s->shipment->status,
                    'estimated_delivery' => $s->shipment->estimated_delivery_at?->toDateTimeString(),
                ] : null,
            ]),
        ];
    }
}
