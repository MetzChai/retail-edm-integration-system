<?php

namespace App\Services;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class CustomerOfferService
{
    /**
     * Compute customer segment based on real purchase metrics.
     */
    public function getSegment(Customer $customer): array
    {
        $salesCount = $customer->sales()->where('status', '!=', 'cancelled')->count();
        $totalSpent = (float) $customer->sales()->where('status', '!=', 'cancelled')->sum('total');
        $lastOrder = $customer->sales()->where('status', '!=', 'cancelled')->latest('created_at')->first();

        $daysSinceLastOrder = $lastOrder ? (int) abs(now()->diffInDays($lastOrder->created_at)) : null;

        if ($salesCount === 0) {
            $tier = 'New Prospect';
            $badgeColor = 'slate';
            $description = 'Registered profile with no purchase history yet.';
        } elseif ($daysSinceLastOrder !== null && $daysSinceLastOrder >= 5) {
            $tier = 'At-Risk / Lapsed';
            $badgeColor = 'rose';
            $description = 'Previous buyer with no transactions in the last 5+ days (win-back target).';
        } elseif ($totalSpent >= 5000 || $salesCount >= 5) {
            $tier = 'VIP Platinum';
            $badgeColor = 'purple';
            $description = 'Top tier customer with high lifetime order value and loyalty.';
        } elseif ($totalSpent >= 2000 || $salesCount >= 3) {
            $tier = 'Loyal Gold';
            $badgeColor = 'amber';
            $description = 'Repeat customer with consistent ordering cadence.';
        } else {
            $tier = 'Active Silver';
            $badgeColor = 'blue';
            $description = 'Regular active buyer with recent store engagement.';
        }

        return [
            'tier' => $tier,
            'badge_color' => $badgeColor,
            'description' => $description,
            'sales_count' => $salesCount,
            'total_spent' => round($totalSpent, 2),
            'last_purchase_date' => $lastOrder?->created_at?->toDateTimeString(),
            'days_since_last_order' => $daysSinceLastOrder,
        ];
    }

    /**
     * Generate personalized promotional offers for a customer derived strictly
     * from their historical transaction items and category preferences.
     */
    public function generatePersonalizedOffers(Customer $customer): array
    {
        $segment = $this->getSegment($customer);

        // Fetch category affinity: sum of quantities and revenue by category for this customer
        $categoryAffinities = SaleItem::query()
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->join('products', 'products.id', '=', 'sale_items.product_id')
            ->join('categories', 'categories.id', '=', 'products.category_id')
            ->where('sales.customer_id', $customer->id)
            ->where('sales.status', '!=', 'cancelled')
            ->selectRaw('categories.id as category_id, categories.name as category_name,
                SUM(sale_items.quantity) as total_units,
                SUM(sale_items.subtotal) as total_revenue,
                COUNT(DISTINCT sales.id) as orders_count')
            ->groupBy('categories.id', 'categories.name')
            ->orderByDesc('total_revenue')
            ->get();

        // Already purchased product IDs
        $purchasedProductIds = SaleItem::query()
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->where('sales.customer_id', $customer->id)
            ->where('sales.status', '!=', 'cancelled')
            ->pluck('sale_items.product_id')
            ->unique()
            ->all();

        $offers = [];

        // Offer 1: Category Affinity Discount
        if ($categoryAffinities->isNotEmpty()) {
            $topCategory = $categoryAffinities->first();
            $discountPct = match ($segment['tier']) {
                'VIP Platinum' => 20,
                'Loyal Gold' => 15,
                'At-Risk / Lapsed' => 25, // Higher incentive to reactivate
                default => 10,
            };

            $code = strtoupper(substr(preg_replace('/[^A-Z]/i', '', $topCategory->category_name), 0, 4)) . '-' . $discountPct . 'OFF';

            $offers[] = [
                'id' => 'OFFER-CAT-' . $topCategory->category_id,
                'type' => 'category_discount',
                'title' => "{$discountPct}% Off {$topCategory->category_name}",
                'description' => "Based on your {$topCategory->total_units} previous purchases in {$topCategory->category_name}, enjoy {$discountPct}% off your next order in this category.",
                'code' => $code,
                'discount_percent' => $discountPct,
                'target_category' => [
                    'id' => (int) $topCategory->category_id,
                    'name' => $topCategory->category_name,
                ],
                'reason' => "Frequently purchases {$topCategory->category_name} (₱" . number_format($topCategory->total_revenue, 2) . ' spent across ' . $topCategory->orders_count . ' orders).',
                'valid_until' => now()->addDays(14)->toDateString(),
            ];

            // Offer 2: Recommended Complementary Product in preferred category
            $recommendedProduct = Product::where('category_id', $topCategory->category_id)
                ->where('status', 'active')
                ->whereNotIn('id', $purchasedProductIds)
                ->whereHas('inventory', fn ($q) => $q->where('quantity', '>', 0))
                ->inRandomOrder()
                ->first();

            if ($recommendedProduct) {
                $itemDiscount = 12;
                $offers[] = [
                    'id' => 'OFFER-PROD-' . $recommendedProduct->id,
                    'type' => 'product_recommendation',
                    'title' => "Special Deal: {$recommendedProduct->name}",
                    'description' => "You frequently shop for {$topCategory->category_name}. Try {$recommendedProduct->name} with an exclusive ₱" . number_format($recommendedProduct->price * 0.12, 2) . " discount.",
                    'code' => 'TRY-' . $recommendedProduct->sku,
                    'discount_percent' => $itemDiscount,
                    'product' => [
                        'id' => $recommendedProduct->id,
                        'name' => $recommendedProduct->name,
                        'sku' => $recommendedProduct->sku,
                        'price' => (float) $recommendedProduct->price,
                        'discounted_price' => round((float) $recommendedProduct->price * (1 - $itemDiscount / 100), 2),
                    ],
                    'reason' => "Top-rated complementary item in preferred category {$topCategory->category_name}.",
                    'valid_until' => now()->addDays(10)->toDateString(),
                ];
            }
        }

        // Offer 3: Basket Value Accelerator based on AOV
        $avgOrder = $segment['sales_count'] > 0 ? $segment['total_spent'] / $segment['sales_count'] : 500;
        $targetSpend = round(ceil(($avgOrder * 1.3) / 100) * 100, 2);
        $rewardDiscount = round($targetSpend * 0.15, 2);

        $offers[] = [
            'id' => 'OFFER-BASKET-' . $customer->id,
            'type' => 'spend_threshold',
            'title' => "Spend ₱" . number_format($targetSpend) . " & Save ₱" . number_format($rewardDiscount),
            'description' => "Spend at least ₱" . number_format($targetSpend) . " on any order and receive an instant ₱" . number_format($rewardDiscount) . " credit.",
            'code' => 'TIER' . ($segment['sales_count'] + 1) . '-' . (int) $rewardDiscount,
            'fixed_discount' => $rewardDiscount,
            'min_spend' => $targetSpend,
            'reason' => "Customized reward calibrated to your average order value (₱" . number_format($avgOrder, 2) . ").",
            'valid_until' => now()->addDays(21)->toDateString(),
        ];

        // If new prospect with no purchase history:
        if ($segment['sales_count'] === 0) {
            $offers = [
                [
                    'id' => 'OFFER-WELCOME',
                    'type' => 'welcome_offer',
                    'title' => 'Welcome Gift: 10% Off First Purchase',
                    'description' => 'Receive 10% off your first checkout across any category in store or online.',
                    'code' => 'WELCOME10',
                    'discount_percent' => 10,
                    'reason' => 'New registered profile welcoming reward.',
                    'valid_until' => now()->addDays(30)->toDateString(),
                ],
                [
                    'id' => 'OFFER-FREESHIP',
                    'type' => 'free_shipping',
                    'title' => 'Free Nationwide Delivery',
                    'description' => 'Enjoy free doorstep logistics shipping on your first online storefront order.',
                    'code' => 'FREEDELIVERY',
                    'fixed_discount' => 150.00,
                    'reason' => 'Introductory logistics incentive for new e-commerce customer.',
                    'valid_until' => now()->addDays(30)->toDateString(),
                ],
            ];
        }

        return [
            'success' => true,
            'customer' => [
                'id' => $customer->id,
                'name' => $customer->name,
                'email' => $customer->email,
                'city' => $customer->city,
                'segment_tier' => $segment['tier'],
            ],
            'segment' => $segment,
            'preferred_categories' => $categoryAffinities->map(fn ($c) => [
                'category_id' => $c->category_id,
                'name' => $c->category_name,
                'units' => (int) $c->total_units,
                'revenue' => round((float) $c->total_revenue, 2),
            ]),
            'summary' => [
                'preferred_categories' => $categoryAffinities->pluck('category_name')->all(),
                'average_order_value' => round((float) $customer->sales()->avg('total'), 2),
                'total_orders' => (int) $customer->sales()->count(),
            ],
            'offers' => $offers,
        ];
    }

    /**
     * Get aggregate segmentation statistics across all active customers in MySQL.
     */
    public function getSystemSegmentationStats(): array
    {
        $customers = Customer::whereNull('merged_into_id')->with('sales')->get();
        $tiers = [
            'VIP Platinum' => ['count' => 0, 'total_spent' => 0.0],
            'Loyal Gold' => ['count' => 0, 'total_spent' => 0.0],
            'Active Silver' => ['count' => 0, 'total_spent' => 0.0],
            'At-Risk / Lapsed' => ['count' => 0, 'total_spent' => 0.0],
            'New Prospect' => ['count' => 0, 'total_spent' => 0.0],
        ];

        foreach ($customers as $c) {
            $seg = $this->getSegment($c);
            $tierName = $seg['tier'];
            $spent = (float) $c->sales->where('status', '!=', 'cancelled')->sum('total');

            if (isset($tiers[$tierName])) {
                $tiers[$tierName]['count']++;
                $tiers[$tierName]['total_spent'] += $spent;
            }
        }

        $breakdown = [];
        foreach ($tiers as $name => $d) {
            $breakdown[$name] = $d['count'];
        }

        return [
            'success' => true,
            'total_customers' => $customers->count(),
            'total_active_customers' => $customers->count(),
            'breakdown' => $breakdown,
            'segments' => $tiers,
        ];
    }
}
