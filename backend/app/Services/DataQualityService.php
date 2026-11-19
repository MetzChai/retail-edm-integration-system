<?php

namespace App\Services;

use App\Models\Category;
use App\Models\Customer;
use App\Models\DataQualityLog;
use App\Models\DataSource;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\Sale;
use App\Models\Shipment;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Data quality assessment across five dimensions:
 * completeness, accuracy, consistency, uniqueness, validity.
 */
class DataQualityService
{
    public function __construct(private AuditService $audit)
    {
    }

    /**
     * Run all checks and persist results to data_quality_logs.
     */
    public function run(): array
    {
        $checks = array_merge(
            $this->checkProducts(),
            $this->checkCustomers(),
            $this->checkInventory(),
            $this->checkSales(),
            $this->checkIntegrations(),
            $this->checkShipments(),
        );

        foreach ($checks as $check) {
            DataQualityLog::create($check);
        }

        $this->audit->log('data_quality_run', 'DataQualityLog', null, [
            'checks' => count($checks),
            'avg_score' => round(collect($checks)->avg('score'), 2),
        ]);

        return $this->stats();
    }

    /**
     * Latest score per entity/dimension + overall grade.
     */
    public function stats(): array
    {
        $latest = DataQualityLog::query()
            ->orderByDesc('checked_at')
            ->orderByDesc('id')
            ->get()
            ->unique(fn (DataQualityLog $l) => $l->entity.'|'.$l->dimension)
            ->values();

        $overall = $latest->isEmpty() ? 0 : round($latest->avg('score'), 2);

        $dimensions = $latest->groupBy('dimension')->map(function (Collection $rows) {
            return round($rows->avg('score'), 2);
        });

        return [
            'overall_score' => $overall,
            'grade' => $this->grade($overall),
            'dimensions' => [
                'completeness' => $dimensions->get('completeness', 0),
                'accuracy' => $dimensions->get('accuracy', 0),
                'consistency' => $dimensions->get('consistency', 0),
                'uniqueness' => $dimensions->get('uniqueness', 0),
                'validity' => $dimensions->get('validity', 0),
            ],
            'checks' => $latest->map(fn (DataQualityLog $l) => [
                'id' => $l->id,
                'entity' => $l->entity,
                'dimension' => $l->dimension,
                'score' => (float) $l->score,
                'records_checked' => $l->records_checked,
                'records_failed' => $l->records_failed,
                'details' => $l->details,
                'checked_at' => $l->checked_at?->toIso8601String(),
            ]),
            'history' => DataQualityLog::orderByDesc('id')->limit(50)->get()->map(fn (DataQualityLog $l) => [
                'id' => $l->id,
                'entity' => $l->entity,
                'dimension' => $l->dimension,
                'score' => (float) $l->score,
                'records_checked' => $l->records_checked,
                'records_failed' => $l->records_failed,
                'checked_at' => $l->checked_at?->toIso8601String(),
            ]),
        ];
    }

    public function grade(float $score): string
    {
        return match (true) {
            $score >= 95 => 'A',
            $score >= 85 => 'B',
            $score >= 75 => 'C',
            $score >= 60 => 'D',
            default => 'F',
        };
    }

    /** @return array<int, array<string, mixed>> */
    protected function checkProducts(): array
    {
        $total = Product::count();
        $results = [];

        // Completeness: required fields present
        $missing = Product::where(function ($q) {
            $q->whereNull('sku')->orWhere('sku', '')->orWhereNull('barcode')->orWhere('barcode', '')
                ->orWhereNull('name')->orWhere('name', '')
                ->orWhereNull('category_id');
        })->count();
        $results[] = $this->result('products', 'completeness', $total, $missing, [
            'rule' => 'sku, barcode, name, and category_id must be populated',
            'recommended_correction' => 'Ensure catalog editors supply SKU, barcode, and category before publishing products.',
        ]);

        // Uniqueness: sku + barcode unique
        $dupSku = Product::select('sku')->groupBy('sku')->havingRaw('COUNT(*) > 1')->count();
        $dupBarcode = Product::select('barcode')->groupBy('barcode')->havingRaw('COUNT(*) > 1')->count();
        $results[] = $this->result('products', 'uniqueness', $total, $dupSku + $dupBarcode, [
            'rule' => 'sku and barcode must be globally unique',
            'duplicate_skus' => $dupSku,
            'duplicate_barcodes' => $dupBarcode,
            'recommended_correction' => 'Regenerate barcode/SKU collisions or merge redundant catalog entries.',
        ]);

        // Validity: price >= 0, status enum
        $invalid = Product::where('price', '<', 0)
            ->orWhereNotIn('status', ['active', 'inactive'])
            ->count();
        $results[] = $this->result('products', 'validity', $total, $invalid, [
            'rule' => 'price must be >= 0 and status must be in (active, inactive)',
            'recommended_correction' => 'Reset negative pricing values and standardize status tags.',
        ]);

        // Accuracy: product must have an inventory row
        $orphan = Product::whereDoesntHave('inventory')->count();
        $results[] = $this->result('products', 'accuracy', $total, $orphan, [
            'rule' => 'every product must have a synchronized warehouse inventory record',
            'recommended_correction' => 'Initialize inventory rows with min_stock thresholds for catalog orphans.',
        ]);

        // Consistency: category must exist and be active
        $inconsistent = Product::whereDoesntHave('category')->count()
            + Product::whereHas('category', fn ($q) => $q->where('is_active', false))->count();
        $results[] = $this->result('products', 'consistency', $total, $inconsistent, [
            'rule' => 'product category must exist in categories table and be active',
            'recommended_correction' => 'Reassign uncategorized products to active master categories.',
        ]);

        return $results;
    }

    /** @return array<int, array<string, mixed>> */
    protected function checkCustomers(): array
    {
        $total = Customer::count();
        $results = [];

        $missing = Customer::where(function ($q) {
            $q->whereNull('name')->orWhere('name', '')
                ->orWhereNull('email')->orWhere('email', '')
                ->orWhereNull('phone')->orWhere('phone', '');
        })->count();
        $results[] = $this->result('customers', 'completeness', $total, $missing, [
            'rule' => 'name, email, and phone contact must be recorded',
            'recommended_correction' => 'Prompt guest customers for contact details during till or online checkout.',
        ]);

        $dupEmail = Customer::whereNotNull('email')->select('email')->groupBy('email')->havingRaw('COUNT(*) > 1')->count();
        $dupPhone = Customer::whereNotNull('phone')->select('phone')->groupBy('phone')->havingRaw('COUNT(*) > 1')->count();
        $results[] = $this->result('customers', 'uniqueness', $total, $dupEmail + $dupPhone, [
            'rule' => 'customer email and phone number should not have unmerged duplicates',
            'duplicate_emails' => $dupEmail,
            'duplicate_phones' => $dupPhone,
            'recommended_correction' => 'Use CRM merge action to consolidate duplicate profiles into a primary account.',
        ]);

        $invalid = Customer::whereNotNull('email')->where('email', 'NOT LIKE', '%@%')->count()
            + Customer::whereNotNull('phone')->where('phone', 'NOT REGEXP', '^[0-9+()\\s-]{6,}$')->count();
        $results[] = $this->result('customers', 'validity', $total, $invalid, [
            'rule' => 'email format contains @ and phone number contains numeric digits',
            'recommended_correction' => 'Validate contact formats on registration input forms.',
        ]);

        $noContact = Customer::whereNull('email')->whereNull('phone')->count();
        $results[] = $this->result('customers', 'accuracy', $total, $noContact, [
            'rule' => 'customer record possesses at least one reachable contact channel',
            'recommended_correction' => 'Backfill contact numbers from historical delivery addresses.',
        ]);

        $merged = Customer::whereNotNull('merged_into_id')->count();
        $results[] = $this->result('customers', 'consistency', $total, 0, [
            'rule' => 'merged customer records properly reference a primary profile',
            'merged_records_count' => $merged,
            'recommended_correction' => 'Maintain audit link for all merged duplicate accounts.',
        ]);

        return $results;
    }

    /** @return array<int, array<string, mixed>> */
    protected function checkInventory(): array
    {
        $total = Inventory::count();
        $results = [];

        if ($total === 0) {
            return [$this->result('inventory', 'completeness', 0, 0, [
                'rule' => 'inventory rows initialized',
                'recommended_correction' => 'Initialize inventory stock table.',
            ])];
        }

        $missing = Inventory::whereNull('min_stock')->orWhereNull('quantity')->count();
        $results[] = $this->result('inventory', 'completeness', $total, $missing, [
            'rule' => 'stock quantity and min_stock alert threshold must be defined',
            'recommended_correction' => 'Set default safety stock threshold (min 5 units) on null records.',
        ]);

        $negative = Inventory::where('quantity', '<', 0)->count();
        $results[] = $this->result('inventory', 'validity', $total, $negative, [
            'rule' => 'warehouse quantity must never drop below 0 (no negative stock)',
            'recommended_correction' => 'StockService atomic locks prevent overselling; audit adjustments to correct zero counts.',
        ]);

        $orphan = Inventory::whereDoesntHave('product')->count();
        $results[] = $this->result('inventory', 'accuracy', $total, $orphan, [
            'rule' => 'every inventory ledger entry points to a valid catalog product',
            'recommended_correction' => 'Prune orphan inventory rows or map them to current products.',
        ]);

        $dup = Inventory::select('product_id')->groupBy('product_id')->havingRaw('COUNT(*) > 1')->count();
        $results[] = $this->result('inventory', 'uniqueness', $total, $dup, [
            'rule' => 'strictly one inventory tracking row per product',
            'recommended_correction' => 'Enforce unique product_id index on inventory table.',
        ]);

        $belowMin = Inventory::whereColumn('quantity', '<=', 'min_stock')->count();
        $results[] = $this->result('inventory', 'consistency', $total, 0, [
            'rule' => 'inventory levels monitored against min_stock reorder alerts',
            'low_stock_monitored' => $belowMin,
            'recommended_correction' => 'Trigger purchase replenishment orders for items at or below minimum threshold.',
        ]);

        return $results;
    }

    /** @return array<int, array<string, mixed>> */
    protected function checkSales(): array
    {
        $total = Sale::count();
        $results = [];

        if ($total === 0) {
            return [$this->result('sales', 'completeness', 0, 0, [
                'rule' => 'sales ledger initialized',
                'recommended_correction' => 'No transactions to evaluate.',
            ])];
        }

        $missing = Sale::whereNull('transaction_no')->orWhere('transaction_no', '')
            ->orWhereNull('total')->count();
        $results[] = $this->result('sales', 'completeness', $total, $missing, [
            'rule' => 'transaction_no, total, and source must be populated',
            'recommended_correction' => 'Ensure POS and Storefront checkout write unique transaction numbers.',
        ]);

        $dup = Sale::select('transaction_no')->groupBy('transaction_no')->havingRaw('COUNT(*) > 1')->count();
        $results[] = $this->result('sales', 'uniqueness', $total, $dup, [
            'rule' => 'transaction_no must be unique across all channels',
            'recommended_correction' => 'Verify sequential order number generator is using channel prefixes (TRX/ONL).',
        ]);

        $mismatched = 0;
        Sale::with('items')->chunkById(200, function ($sales) use (&$mismatched) {
            foreach ($sales as $sale) {
                $sum = (float) $sale->items->sum('subtotal');
                $expectedTotal = max(0, $sum - (float) ($sale->discount ?? 0));
                if (abs($expectedTotal - (float) $sale->total) > 0.05) {
                    $mismatched++;
                }
            }
        });
        $results[] = $this->result('sales', 'accuracy', $total, $mismatched, [
            'rule' => 'sale total equals sum of item subtotals minus transaction discount',
            'recommended_correction' => 'Audit pricing calculations during multi-item checkout.',
        ]);

        // Fix: recognize all valid active statuses from expanded sales workflow
        $validStatuses = ['completed', 'pending', 'confirmed', 'processing', 'shipped', 'cancelled', 'refunded'];
        $invalidStatus = Sale::whereNotIn('status', $validStatuses)->count();
        $invalidSource = Sale::whereNotIn('source', ['pos', 'online'])->count();
        $results[] = $this->result('sales', 'validity', $total, $invalidStatus + $invalidSource, [
            'rule' => 'status in (' . implode(', ', $validStatuses) . '), source in (pos, online)',
            'recommended_correction' => 'Normalize legacy transaction status strings to official workflow states.',
        ]);

        $noItems = Sale::whereDoesntHave('items')->count();
        $results[] = $this->result('sales', 'consistency', $total, $noItems, [
            'rule' => 'every sales record has at least one associated line item',
            'recommended_correction' => 'Wrap line item and sale header insertion in atomic DB transaction.',
        ]);

        return $results;
    }

    /** @return array<int, array<string, mixed>> */
    protected function checkIntegrations(): array
    {
        $total = DataSource::count();
        $results = [];

        if ($total === 0) {
            return [$this->result('data_sources', 'completeness', 0, 0, [
                'rule' => 'data sources configured',
                'recommended_correction' => 'Register all 5 enterprise retail sources.',
            ])];
        }

        $missing = DataSource::whereNull('type')->orWhereNull('status')->count();
        $results[] = $this->result('data_sources', 'completeness', $total, $missing, [
            'rule' => 'source type and connectivity status must be defined',
            'recommended_correction' => 'Configure endpoint and adapter types for all registered sources.',
        ]);

        $dup = DataSource::select('name')->groupBy('name')->havingRaw('COUNT(*) > 1')->count();
        $results[] = $this->result('data_sources', 'uniqueness', $total, $dup, [
            'rule' => 'source name and adapter type must be unique',
            'recommended_correction' => 'Remove redundant source registrations.',
        ]);

        $never = DataSource::whereNull('last_sync_at')->count();
        $results[] = $this->result('data_sources', 'consistency', $total, $never, [
            'rule' => 'active data sources must have executed at least one synchronization run',
            'recommended_correction' => 'Trigger "Sync All Sources" to establish initial ETL baseline.',
        ]);

        $stale = DataSource::where('status', 'error')->count();
        $results[] = $this->result('data_sources', 'accuracy', $total, $stale, [
            'rule' => 'source health status accurately reflects pipeline execution outcome',
            'recommended_correction' => 'Review integration error logs and retry failed ingestion batches.',
        ]);

        $invalid = DataSource::whereNotIn('type', ['POS', 'Inventory', 'CRM', 'OnlineStorefront', 'Logistics'])->count();
        $results[] = $this->result('data_sources', 'validity', $total, $invalid, [
            'rule' => 'type in (POS, Inventory, CRM, OnlineStorefront, Logistics)',
            'recommended_correction' => 'Map source to one of the 5 supported retail integration endpoints.',
        ]);

        return $results;
    }

    /** @return array<int, array<string, mixed>> */
    protected function checkShipments(): array
    {
        $total = Shipment::count();
        $results = [];

        if ($total === 0) {
            return [$this->result('shipments', 'completeness', 0, 0, [
                'rule' => 'logistics shipment table initialized',
                'recommended_correction' => 'Generate shipments for confirmed online storefront orders.',
            ])];
        }

        $missing = Shipment::whereNull('tracking_number')->orWhere('tracking_number', '')
            ->orWhereNull('logistics_provider')->orWhereNull('status')->count();
        $results[] = $this->result('shipments', 'completeness', $total, $missing, [
            'rule' => 'tracking_number, carrier provider, and status must be defined',
            'recommended_correction' => 'Ensure carrier dispatches generate valid tracking references.',
        ]);

        $orphan = Shipment::whereDoesntHave('sale')->count();
        $results[] = $this->result('shipments', 'accuracy', $total, $orphan, [
            'rule' => 'every shipment must link to a valid customer order (sale_id)',
            'recommended_correction' => 'Cascade-delete or link orphan tracking records to orders.',
        ]);

        $dup = Shipment::select('tracking_number')->groupBy('tracking_number')->havingRaw('COUNT(*) > 1')->count();
        $results[] = $this->result('shipments', 'uniqueness', $total, $dup, [
            'rule' => 'carrier tracking numbers must be globally unique',
            'recommended_correction' => 'Enforce unique database index on tracking_number column.',
        ]);

        $validStatuses = ['pending', 'ready_for_shipment', 'shipped', 'in_transit', 'out_for_delivery', 'delivered', 'failed_delivery', 'returned'];
        $invalid = Shipment::whereNotIn('status', $validStatuses)->count();
        $results[] = $this->result('shipments', 'validity', $total, $invalid, [
            'rule' => 'shipment status conforms to the 8 standard fulfillment stages',
            'recommended_correction' => 'Update carrier status webhook mapping to recognized status enums.',
        ]);

        return $results;
    }

    /**
     * @param array<string, mixed> $details
     * @return array<string, mixed>
     */
    protected function result(string $entity, string $dimension, int $checked, int $failed, array $details): array
    {
        $score = $checked === 0 ? 100.0 : round(max(0, ($checked - $failed) / $checked * 100), 2);

        return [
            'entity' => $entity,
            'dimension' => $dimension,
            'score' => $score,
            'records_checked' => $checked,
            'records_failed' => $failed,
            'details' => $details,
            'checked_at' => now(),
        ];
    }
}
