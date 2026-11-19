<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Normalize historical sales, sale items, and payment records from legacy
     * IDR magnitudes down to realistic Philippine Peso (PHP / ₱) amounts,
     * aligning with the normalized product catalog prices.
     */
    public function up(): void
    {
        // Cache products with current normalized prices and costs
        $products = DB::table('products')->get()->keyBy('id');

        // 1. Recalculate sale items based on normalized product prices
        $saleItems = DB::table('sale_items')->get();
        foreach ($saleItems as $item) {
            $product = $products->get($item->product_id);
            if ($product) {
                $newPrice = (float) $product->price;
                $newSubtotal = round($newPrice * (int) $item->quantity, 2);
            } else {
                $newPrice = (float) $item->price > 5000 ? round((float) $item->price / 1000, 2) : (float) $item->price;
                $newSubtotal = round($newPrice * (int) $item->quantity, 2);
            }

            DB::table('sale_items')->where('id', $item->id)->update([
                'price' => $newPrice,
                'subtotal' => $newSubtotal,
                'updated_at' => now(),
            ]);
        }

        // 2. Recalculate sales totals from their normalized items
        $sales = DB::table('sales')->get();
        foreach ($sales as $sale) {
            $itemsSum = (float) DB::table('sale_items')->where('sale_id', $sale->id)->sum('subtotal');
            $discount = (float) $sale->discount;
            if ($discount > 5000) {
                $discount = round($discount / 1000, 2);
            }

            $newTotal = $itemsSum > 0 ? max(0, round($itemsSum - $discount, 2)) : ((float) $sale->total > 5000 ? round((float) $sale->total / 1000, 2) : (float) $sale->total);

            DB::table('sales')->where('id', $sale->id)->update([
                'total' => $newTotal,
                'discount' => $discount,
                'updated_at' => now(),
            ]);

            // 3. Align payment records to match normalized sale total
            DB::table('payment_records')->where('sale_id', $sale->id)->update([
                'amount' => $newTotal,
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        // Safe reversible no-op
    }
};
