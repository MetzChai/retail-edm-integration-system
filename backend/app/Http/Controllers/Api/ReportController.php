<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\DataQualityLog;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReportController extends Controller
{
    /**
     * Grouped sales for a period: daily | weekly | monthly.
     */
    public function sales(Request $request, ?string $period = null): JsonResponse
    {
        $period = $period ?? $request->query('period', 'daily');
        $period = in_array($period, ['daily', 'weekly', 'monthly'], true) ? $period : 'daily';

        $from = $request->query('from', match ($period) {
            'daily' => now()->subDays(30)->toDateString(),
            'weekly' => now()->subWeeks(12)->toDateString(),
            'monthly' => now()->subMonths(12)->toDateString(),
        });
        $to = $request->query('to', now()->toDateString());

        $source = $request->query('source');
        $source = in_array($source, ['pos', 'online'], true) ? $source : null;

        $format = match ($period) {
            'daily' => '%Y-%m-%d',
            'weekly' => '%x-W%v',
            'monthly' => '%Y-%m',
        };

        $rows = Sale::query()
            ->whereBetween('created_at', [$from.' 00:00:00', $to.' 23:59:59'])
            ->where('status', '!=', 'refunded')
            ->when($source, fn ($q) => $q->where('source', $source))
            ->selectRaw("DATE_FORMAT(created_at, '{$format}') as bucket,
                COUNT(*) as orders,
                COALESCE(SUM(total),0) as revenue,
                COALESCE(AVG(total),0) as avg_order_value")
            ->groupBy('bucket')
            ->orderBy('bucket')
            ->get();

        // Channel breakdown: POS vs Online
        $posStats = Sale::whereBetween('created_at', [$from.' 00:00:00', $to.' 23:59:59'])
            ->where('status', '!=', 'refunded')
            ->where('source', 'pos')
            ->selectRaw('COUNT(*) as orders, COALESCE(SUM(total),0) as revenue')
            ->first();

        $onlineStats = Sale::whereBetween('created_at', [$from.' 00:00:00', $to.' 23:59:59'])
            ->where('status', '!=', 'refunded')
            ->where('source', 'online')
            ->selectRaw('COUNT(*) as orders, COALESCE(SUM(total),0) as revenue')
            ->first();

        return response()->json([
            'period' => $period,
            'channel' => $source ?? 'all',
            'source' => $source ?? 'all',
            'from' => $from,
            'to' => $to,
            'summary' => [
                'orders' => (int) $rows->sum('orders'),
                'revenue' => round((float) $rows->sum('revenue'), 2),
                'avg_order_value' => $rows->sum('orders') > 0
                    ? round((float) $rows->sum('revenue') / max(1, (int) $rows->sum('orders')), 2)
                    : 0,
                'pos_orders' => (int) ($posStats->orders ?? 0),
                'pos_revenue' => round((float) ($posStats->revenue ?? 0), 2),
                'online_orders' => (int) ($onlineStats->orders ?? 0),
                'online_revenue' => round((float) ($onlineStats->revenue ?? 0), 2),
            ],
            'rows' => $rows->map(fn ($r) => [
                'bucket' => $r->bucket,
                'orders' => (int) $r->orders,
                'revenue' => round((float) $r->revenue, 2),
                'avg_order_value' => round((float) $r->avg_order_value, 2),
            ]),
        ]);
    }

    public function bestSellers(Request $request): JsonResponse
    {
        $from = $request->query('from', now()->subDays(30)->toDateString());
        $to = $request->query('to', now()->toDateString());
        $limit = min(50, $request->integer('limit', 10));

        $rows = SaleItem::query()
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->join('products', 'products.id', '=', 'sale_items.product_id')
            ->whereBetween('sales.created_at', [$from.' 00:00:00', $to.' 23:59:59'])
            ->selectRaw('products.id as product_id, products.sku, products.name,
                SUM(sale_items.quantity) as units,
                SUM(sale_items.subtotal) as revenue,
                COUNT(DISTINCT sales.id) as orders')
            ->groupBy('products.id', 'products.sku', 'products.name')
            ->orderByDesc('units')
            ->limit($limit)
            ->get();

        return response()->json([
            'from' => $from,
            'to' => $to,
            'rows' => $rows->map(fn ($r) => [
                'product_id' => (int) $r->product_id,
                'sku' => $r->sku,
                'name' => $r->name,
                'units' => (int) $r->units,
                'revenue' => round((float) $r->revenue, 2),
                'orders' => (int) $r->orders,
            ]),
        ]);
    }

    public function inventory(Request $request): JsonResponse
    {
        $query = Inventory::with(['product', 'product.category'])
            ->when($request->query('search'), fn ($q, $s) => $q->whereHas('product', fn ($p) => $p->search($s)))
            ->when($request->query('category_id'), fn ($q, $id) => $q->whereHas('product', fn ($p) => $p->where('category_id', $id)));

        $items = $query->orderBy('quantity')->paginate($request->integer('per_page', 25));

        $items->getCollection()->transform(function (Inventory $inv) {
            $data = $inv->toArray();
            $data['stock_value'] = round((float) $inv->quantity * (float) ($inv->product?->cost_price ?? 0), 2);
            $data['retail_value'] = round((float) $inv->quantity * (float) ($inv->product?->price ?? 0), 2);

            return $data;
        });

        return response()->json($items);
    }

    public function lowStock(Request $request): JsonResponse
    {
        $items = Inventory::with(['product', 'product.category'])
            ->whereColumn('quantity', '<=', 'min_stock')
            ->orderBy('quantity')
            ->paginate($request->integer('per_page', 50));

        $summary = [
            'low_stock' => Inventory::whereColumn('quantity', '<=', 'min_stock')->count(),
            'out_of_stock' => Inventory::where('quantity', 0)->count(),
            'reorder_value' => round((float) Inventory::whereColumn('quantity', '<=', 'min_stock')
                ->join('products', 'products.id', '=', 'inventory.product_id')
                ->sum(DB::raw('(min_stock - quantity) * products.cost_price')), 2),
        ];

        return response()->json(['summary' => $summary, 'rows' => $items]);
    }

    public function customerHistory(Request $request, Customer $customer): JsonResponse
    {
        $sales = Sale::with('items.product')
            ->where('customer_id', $customer->id)
            ->latest('id')
            ->paginate($request->integer('per_page', 15));

        $totals = Sale::where('customer_id', $customer->id)
            ->selectRaw('COUNT(*) as orders, COALESCE(SUM(total),0) as revenue, COALESCE(AVG(total),0) as avg_order')
            ->first();

        return response()->json([
            'customer' => $customer,
            'summary' => [
                'orders' => (int) $totals->orders,
                'total_spent' => round((float) $totals->revenue, 2),
                'avg_order_value' => round((float) $totals->avg_order, 2),
                'first_order' => Sale::where('customer_id', $customer->id)->min('created_at'),
                'last_order' => Sale::where('customer_id', $customer->id)->max('created_at'),
            ],
            'sales' => $sales,
        ]);
    }

    public function categorySales(Request $request): JsonResponse
    {
        $from = $request->query('from', now()->subDays(30)->toDateString());
        $to = $request->query('to', now()->toDateString());

        $rows = SaleItem::query()
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->join('products', 'products.id', '=', 'sale_items.product_id')
            ->join('categories', 'categories.id', '=', 'products.category_id')
            ->whereBetween('sales.created_at', [$from.' 00:00:00', $to.' 23:59:59'])
            ->selectRaw('categories.id as category_id, categories.name,
                SUM(sale_items.quantity) as units,
                SUM(sale_items.subtotal) as revenue,
                COUNT(DISTINCT sales.id) as orders')
            ->groupBy('categories.id', 'categories.name')
            ->orderByDesc('revenue')
            ->get();

        $grandTotal = max(0.01, (float) $rows->sum('revenue'));

        return response()->json([
            'from' => $from,
            'to' => $to,
            'rows' => $rows->map(fn ($r) => [
                'category_id' => (int) $r->category_id,
                'name' => $r->name,
                'units' => (int) $r->units,
                'revenue' => round((float) $r->revenue, 2),
                'orders' => (int) $r->orders,
                'share_pct' => round((float) $r->revenue / $grandTotal * 100, 2),
            ]),
        ]);
    }

    public function integrationPerformance(): JsonResponse
    {
        $logs = DB::table('integration_logs')
            ->selectRaw("source,
                COUNT(*) as runs,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successes,
                SUM(CASE WHEN status IN ('failed','partial') THEN 1 ELSE 0 END) as failures,
                COALESCE(SUM(records_processed),0) as records_processed,
                COALESCE(SUM(records_failed),0) as records_failed,
                COALESCE(AVG(TIMESTAMPDIFF(SECOND, started_at, finished_at)),0) as avg_seconds,
                MAX(finished_at) as last_run")
            ->groupBy('source')
            ->orderBy('source')
            ->get();

        return response()->json([
            'rows' => $logs->map(fn ($r) => [
                'source' => $r->source,
                'runs' => (int) $r->runs,
                'successes' => (int) $r->successes,
                'failures' => (int) $r->failures,
                'success_rate' => $r->runs > 0 ? round($r->successes / $r->runs * 100, 2) : 0,
                'records_processed' => (int) $r->records_processed,
                'records_failed' => (int) $r->records_failed,
                'avg_seconds' => round((float) $r->avg_seconds, 2),
                'last_run' => $r->last_run,
            ]),
        ]);
    }

    public function dataQualityAssessment(): JsonResponse
    {
        $latest = DataQualityLog::query()
            ->orderByDesc('checked_at')
            ->orderByDesc('id')
            ->get()
            ->unique(fn (DataQualityLog $l) => $l->entity.'|'.$l->dimension)
            ->values();

        $overall = $latest->isEmpty() ? 0 : round($latest->avg('score'), 2);

        $byEntity = $latest->groupBy('entity')->map(fn ($rows) => round($rows->avg('score'), 2));
        $byDimension = $latest->groupBy('dimension')->map(fn ($rows) => round($rows->avg('score'), 2));

        return response()->json([
            'overall_score' => $overall,
            'grade' => match (true) {
                $overall >= 95 => 'A',
                $overall >= 85 => 'B',
                $overall >= 75 => 'C',
                $overall >= 60 => 'D',
                default => 'F',
            },
            'by_entity' => $byEntity,
            'by_dimension' => [
                'completeness' => $byDimension->get('completeness', 0),
                'accuracy' => $byDimension->get('accuracy', 0),
                'consistency' => $byDimension->get('consistency', 0),
                'uniqueness' => $byDimension->get('uniqueness', 0),
                'validity' => $byDimension->get('validity', 0),
            ],
            'checks' => $latest,
            'last_run_at' => DataQualityLog::max('checked_at'),
        ]);
    }

    /**
     * Customer Purchase Summary report.
     */
    public function customers(Request $request): JsonResponse
    {
        $customers = Customer::query()
            ->whereNull('merged_into_id')
            ->withCount('sales')
            ->withSum('sales as total_spent', 'total')
            ->withMax('sales as latest_purchase_date', 'created_at')
            ->orderByDesc('total_spent')
            ->paginate($request->integer('per_page', 25));

        return response()->json($customers);
    }

    /**
     * Integration report alias.
     */
    public function integration(): JsonResponse
    {
        return $this->integrationPerformance();
    }

    /**
     * Export reports to CSV.
     */
    public function exportCsv(Request $request, string $type)
    {
        $date = now()->format('Ymd_His');
        $filename = "report_{$type}_{$date}.csv";

        $headers = [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
            'Pragma' => 'no-cache',
            'Cache-Control' => 'must-revalidate, post-check=0, pre-check=0',
            'Expires' => '0',
        ];

        $callback = function () use ($type, $request) {
            $handle = fopen('php://output', 'w');
            // Write UTF-8 BOM for Excel compatibility
            fputs($handle, "\xEF\xBB\xBF");

            switch ($type) {
                case 'sales':
                    fputcsv($handle, ['Period Bucket', 'Channel', 'Orders Count', 'Total Revenue', 'Avg Order Value']);
                    $period = $request->query('period', 'daily');
                    $source = $request->query('source');
                    $source = in_array($source, ['pos', 'online'], true) ? $source : null;
                    $format = match ($period) {
                        'weekly' => '%x-W%v',
                        'monthly' => '%Y-%m',
                        default => '%Y-%m-%d',
                    };
                    $from = $request->query('from', now()->subDays(30)->toDateString());
                    $to = $request->query('to', now()->toDateString());
                    $rows = Sale::whereBetween('created_at', [$from.' 00:00:00', $to.' 23:59:59'])
                        ->where('status', '!=', 'cancelled')
                        ->when($source, fn ($q) => $q->where('source', $source))
                        ->selectRaw("DATE_FORMAT(created_at, '{$format}') as bucket, COUNT(*) as orders, COALESCE(SUM(total),0) as revenue, COALESCE(AVG(total),0) as avg_val")
                        ->groupBy('bucket')
                        ->orderBy('bucket')
                        ->get();
                    foreach ($rows as $r) {
                        fputcsv($handle, [$r->bucket, strtoupper($source ?? 'ALL (COMBINED)'), $r->orders, number_format((float) $r->revenue, 2), number_format((float) $r->avg_val, 2)]);
                    }
                    break;

                case 'best-sellers':
                    fputcsv($handle, ['Product ID', 'SKU', 'Product Name', 'Units Sold', 'Total Revenue', 'Orders Count']);
                    $from = $request->query('from', now()->subDays(30)->toDateString());
                    $to = $request->query('to', now()->toDateString());
                    $rows = SaleItem::query()
                        ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
                        ->join('products', 'products.id', '=', 'sale_items.product_id')
                        ->whereBetween('sales.created_at', [$from.' 00:00:00', $to.' 23:59:59'])
                        ->where('sales.status', '!=', 'cancelled')
                        ->selectRaw('products.id, products.sku, products.name, SUM(sale_items.quantity) as units, SUM(sale_items.subtotal) as revenue, COUNT(DISTINCT sales.id) as orders')
                        ->groupBy('products.id', 'products.sku', 'products.name')
                        ->orderByDesc('units')
                        ->get();
                    foreach ($rows as $r) {
                        fputcsv($handle, [$r->id, $r->sku, $r->name, $r->units, number_format((float) $r->revenue, 2), $r->orders]);
                    }
                    break;

                case 'inventory':
                    fputcsv($handle, ['Product ID', 'SKU', 'Product Name', 'Category', 'Available Stock', 'Min Stock', 'Cost Price', 'Retail Price', 'Stock Value']);
                    $items = Inventory::with(['product', 'product.category'])->get();
                    foreach ($items as $inv) {
                        $p = $inv->product;
                        $stockVal = ($inv->quantity ?? 0) * ($p?->cost_price ?? 0);
                        fputcsv($handle, [
                            $p?->id ?? '',
                            $p?->sku ?? '',
                            $p?->name ?? '',
                            $p?->category?->name ?? 'Uncategorized',
                            $inv->quantity,
                            $inv->min_stock,
                            number_format((float) ($p?->cost_price ?? 0), 2),
                            number_format((float) ($p?->price ?? 0), 2),
                            number_format((float) $stockVal, 2),
                        ]);
                    }
                    break;

                case 'customers':
                    fputcsv($handle, ['Customer ID', 'Name', 'Email', 'Phone', 'City', 'Total Purchases', 'Total Spent', 'Latest Purchase']);
                    $customers = Customer::whereNull('merged_into_id')
                        ->withCount('sales')
                        ->withSum('sales as total_spent', 'total')
                        ->withMax('sales as latest_purchase_date', 'created_at')
                        ->get();
                    foreach ($customers as $c) {
                        fputcsv($handle, [
                            $c->id,
                            $c->name,
                            $c->email ?? 'N/A',
                            $c->phone ?? 'N/A',
                            $c->city ?? 'N/A',
                            $c->sales_count,
                            number_format((float) ($c->total_spent ?? 0), 2),
                            $c->latest_purchase_date ?? 'None',
                        ]);
                    }
                    break;

                case 'integration':
                    fputcsv($handle, ['Source', 'Total Runs', 'Successes', 'Failures', 'Records Processed', 'Records Failed', 'Avg Duration (s)', 'Last Run']);
                    $logs = DB::table('integration_logs')
                        ->selectRaw("source, COUNT(*) as runs, SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successes, SUM(CASE WHEN status IN ('failed','partial') THEN 1 ELSE 0 END) as failures, COALESCE(SUM(records_processed),0) as processed, COALESCE(SUM(records_failed),0) as failed, COALESCE(AVG(TIMESTAMPDIFF(SECOND, started_at, finished_at)),0) as avg_secs, MAX(finished_at) as last_run")
                        ->groupBy('source')
                        ->get();
                    foreach ($logs as $l) {
                        fputcsv($handle, [$l->source, $l->runs, $l->successes, $l->failures, $l->processed, $l->failed, round((float) $l->avg_secs, 2), $l->last_run]);
                    }
                    break;

                case 'data-quality':
                    fputcsv($handle, ['ID', 'Entity', 'Dimension', 'Score (%)', 'Records Checked', 'Records Failed', 'Checked At']);
                    $logs = DataQualityLog::latest('id')->limit(200)->get();
                    foreach ($logs as $l) {
                        fputcsv($handle, [$l->id, $l->entity, $l->dimension, $l->score, $l->records_checked, $l->records_failed, $l->checked_at]);
                    }
                    break;

                case 'shipments':
                    fputcsv($handle, ['Tracking No', 'Carrier Provider', 'Order Ref', 'Recipient Name', 'Status', 'Estimated Delivery', 'Delivered At']);
                    $shipments = \App\Models\Shipment::with('sale')->latest('id')->get();
                    foreach ($shipments as $sh) {
                        fputcsv($handle, [
                            $sh->tracking_number,
                            $sh->logistics_provider,
                            $sh->sale?->transaction_no ?? 'N/A',
                            $sh->recipient_name ?? 'N/A',
                            str_replace('_', ' ', strtoupper($sh->status)),
                            $sh->estimated_delivery_at?->toDateTimeString() ?? 'N/A',
                            $sh->delivered_at?->toDateTimeString() ?? 'N/A',
                        ]);
                    }
                    break;

                default:
                    fputcsv($handle, ['Error', 'Unsupported export type']);
            }

            fclose($handle);
        };

        return response()->stream($callback, 200, $headers);
    }
}
