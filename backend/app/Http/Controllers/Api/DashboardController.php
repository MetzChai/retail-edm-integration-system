<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\DataSource;
use App\Models\IntegrationLog;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $timezone = config('app.timezone', 'Asia/Manila');

        // Date range filtering
        if ($request->has('from') && $request->has('to')) {
            $startDate = Carbon::parse($request->query('from'), $timezone)->startOfDay();
            $endDate = Carbon::parse($request->query('to'), $timezone)->endOfDay();
            $days = max(1, (int) $startDate->diffInDays($endDate) + 1);
        } else {
            $days = min(365, max(7, $request->integer('days', 30)));
            $startDate = Carbon::now($timezone)->subDays($days - 1)->startOfDay();
            $endDate = Carbon::now($timezone)->endOfDay();
        }

        // Today's stats
        $todayStart = Carbon::now($timezone)->startOfDay();
        $todayEnd = Carbon::now($timezone)->endOfDay();
        $todaySales = Sale::whereBetween('created_at', [$todayStart, $todayEnd])
            ->where('status', '!=', 'cancelled')
            ->sum('total');
        $todayCount = Sale::whereBetween('created_at', [$todayStart, $todayEnd])
            ->where('status', '!=', 'cancelled')
            ->count();

        // Period sales & transactions
        $periodSales = (float) Sale::whereBetween('created_at', [$startDate, $endDate])
            ->where('status', '!=', 'cancelled')
            ->sum('total');
        $periodTransactions = Sale::whereBetween('created_at', [$startDate, $endDate])
            ->where('status', '!=', 'cancelled')
            ->count();

        // All-time sales
        $allTimeSales = (float) Sale::where('status', '!=', 'cancelled')->sum('total');
        $allTimeTransactions = Sale::where('status', '!=', 'cancelled')->count();

        // Catalog & Inventory stats
        $totalProducts = Product::count();
        $totalCustomers = Customer::whereNull('merged_into_id')->count();
        $totalStock = (int) Inventory::sum('quantity');
        $lowStockCount = Inventory::whereColumn('quantity', '<=', 'min_stock')->where('quantity', '>', 0)->count();
        $outOfStockCount = Inventory::where('quantity', 0)->count();
        $totalLowStock = Inventory::whereColumn('quantity', '<=', 'min_stock')->count();

        // Pending online orders
        $pendingOnlineOrders = Sale::where('status', 'pending')->count();

        // Daily chart data
        $dailyData = Sale::selectRaw("DATE(CONVERT_TZ(created_at, '+00:00', '+08:00')) as day, COUNT(*) as orders, COALESCE(SUM(total),0) as revenue")
            ->whereBetween('created_at', [$startDate, $endDate])
            ->where('status', '!=', 'cancelled')
            ->groupBy('day')
            ->orderBy('day')
            ->get()
            ->keyBy('day');

        $series = [];
        $cursor = $startDate->copy();
        while ($cursor->lte($endDate)) {
            $dayStr = $cursor->format('Y-m-d');
            $row = $dailyData->get($dayStr);
            $series[] = [
                'day' => $dayStr,
                'date' => $cursor->format('M d'),
                'orders' => (int) ($row->orders ?? 0),
                'revenue' => round((float) ($row->revenue ?? 0), 2),
            ];
            $cursor->addDay();
        }

        // Weekly chart data (last 12 weeks)
        $weeklySeries = Sale::selectRaw("YEARWEEK(CONVERT_TZ(created_at, '+00:00', '+08:00'), 1) as week_num, MIN(DATE(CONVERT_TZ(created_at, '+00:00', '+08:00'))) as week_start, COUNT(*) as orders, COALESCE(SUM(total),0) as revenue")
            ->where('created_at', '>=', Carbon::now($timezone)->subWeeks(12)->startOfWeek())
            ->where('status', '!=', 'cancelled')
            ->groupBy('week_num')
            ->orderBy('week_num')
            ->get()
            ->map(fn ($r) => [
                'week' => 'Wk ' . substr((string) $r->week_num, 4),
                'week_start' => $r->week_start,
                'orders' => (int) $r->orders,
                'revenue' => round((float) $r->revenue, 2),
            ]);

        // Monthly chart data (last 12 months)
        $monthlySeries = Sale::selectRaw("DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+08:00'), '%Y-%m') as month_bucket, DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+08:00'), '%b %Y') as month_label, COUNT(*) as orders, COALESCE(SUM(total),0) as revenue")
            ->where('created_at', '>=', Carbon::now($timezone)->subMonths(12)->startOfMonth())
            ->where('status', '!=', 'cancelled')
            ->groupBy('month_bucket', 'month_label')
            ->orderBy('month_bucket')
            ->get()
            ->map(fn ($r) => [
                'month' => $r->month_label,
                'bucket' => $r->month_bucket,
                'orders' => (int) $r->orders,
                'revenue' => round((float) $r->revenue, 2),
            ]);

        // Best sellers (Top 5)
        $bestSellers = SaleItem::query()
            ->join('products', 'products.id', '=', 'sale_items.product_id')
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->whereBetween('sales.created_at', [$startDate, $endDate])
            ->where('sales.status', '!=', 'cancelled')
            ->selectRaw('products.id as product_id, products.name, products.sku, SUM(sale_items.quantity) as units, SUM(sale_items.subtotal) as revenue')
            ->groupBy('products.id', 'products.name', 'products.sku')
            ->orderByDesc('units')
            ->limit(5)
            ->get()
            ->map(fn ($r) => [
                'product_id' => (int) $r->product_id,
                'name' => $r->name,
                'sku' => $r->sku,
                'units' => (int) $r->units,
                'sold' => (int) $r->units, // compatibility alias
                'revenue' => round((float) $r->revenue, 2),
            ])
            ->values();

        // If no sales in period, fetch overall top sellers so dashboard shows meaningful product data
        if ($bestSellers->isEmpty()) {
            $bestSellers = SaleItem::query()
                ->join('products', 'products.id', '=', 'sale_items.product_id')
                ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
                ->where('sales.status', '!=', 'cancelled')
                ->selectRaw('products.id as product_id, products.name, products.sku, SUM(sale_items.quantity) as units, SUM(sale_items.subtotal) as revenue')
                ->groupBy('products.id', 'products.name', 'products.sku')
                ->orderByDesc('units')
                ->limit(5)
                ->get()
                ->map(fn ($r) => [
                    'product_id' => (int) $r->product_id,
                    'name' => $r->name,
                    'sku' => $r->sku,
                    'units' => (int) $r->units,
                    'sold' => (int) $r->units,
                    'revenue' => round((float) $r->revenue, 2),
                ])
                ->values();
        }

        // Recent Transactions (Recent 10)
        $recentSales = Sale::with(['customer', 'user'])
            ->latest('id')
            ->limit(10)
            ->get()
            ->map(fn (Sale $s) => [
                'id' => $s->id,
                'transaction_no' => $s->transaction_no,
                'customer' => $s->customer?->name ?? 'Guest Customer',
                'customer_email' => $s->customer?->email,
                'total' => (float) $s->total,
                'payment_method' => $s->payment_method,
                'status' => $s->status,
                'source' => $s->source,
                'created_at' => $s->created_at?->timezone($timezone)->toDateTimeString(),
            ]);

        // Inventory summary
        $stockCostValue = (float) DB::table('inventory')
            ->join('products', 'products.id', '=', 'inventory.product_id')
            ->sum(DB::raw('inventory.quantity * COALESCE(products.cost_price, 0)'));

        $inventorySummary = [
            'products' => $totalProducts,
            'active_products' => Product::where('status', 'active')->count(),
            'total_stock_units' => $totalStock,
            'stock_value' => round($stockCostValue, 2),
            'low_stock' => $totalLowStock,
            'out_of_stock' => $outOfStockCount,
        ];

        // Data source sync statuses
        $syncStatus = DataSource::orderBy('name')->get()->map(fn (DataSource $ds) => [
            'id' => $ds->id,
            'name' => $ds->name,
            'type' => $ds->type,
            'status' => $ds->status,
            'last_sync_at' => $ds->last_sync_at,
            'last_sync_records' => $ds->last_sync_records,
        ]);

        $recentLogs = IntegrationLog::with('dataSource')->latest('id')->limit(6)->get();

        return response()->json([
            // Primary explicit statistics requested
            'total_sales' => round($periodSales > 0 ? $periodSales : $allTimeSales, 2),
            'period_sales' => round($periodSales, 2),
            'all_time_sales' => round($allTimeSales, 2),
            'total_products' => $totalProducts,
            'total_customers' => $totalCustomers,
            'total_available_stock' => $totalStock,
            'total_stock' => $totalStock,
            'low_stock_products' => $totalLowStock,
            'low_stock_count' => $lowStockCount,
            'out_of_stock_count' => $outOfStockCount,
            'total_transactions' => $periodTransactions > 0 ? $periodTransactions : $allTimeTransactions,
            'pending_online_orders' => $pendingOnlineOrders,

            // Charts
            'sales_chart' => $series,
            'weekly_sales' => $weeklySeries,
            'monthly_sales' => $monthlySeries,
            'best_selling_products' => $bestSellers,
            'best_sellers' => $bestSellers,
            'recent_transactions' => $recentSales,
            'recent_sales' => $recentSales,
            'inventory_overview' => [
                'total_units' => $totalStock,
                'low_stock' => $lowStockCount,
                'out_of_stock' => $outOfStockCount,
                'stock_value' => round($stockCostValue, 2),
            ],

            // Legacy nested compatibility keys
            'totals' => [
                'today_revenue' => round((float) $todaySales, 2),
                'today_orders' => (int) $todayCount,
                'period_revenue' => round($periodSales, 2),
                'period_orders' => (int) $periodTransactions,
                'customers' => $totalCustomers,
                'products' => $totalProducts,
                'low_stock' => $totalLowStock,
                'out_of_stock' => $outOfStockCount,
            ],
            'chart' => [
                'days' => $days,
                'series' => $series,
            ],
            'inventory_summary' => $inventorySummary,
            'sync_status' => [
                'sources' => $syncStatus,
                'recent_logs' => $recentLogs,
            ],
        ]);
    }
}
