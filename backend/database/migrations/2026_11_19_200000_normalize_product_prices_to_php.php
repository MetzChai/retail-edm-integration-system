<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Normalize product prices and wholesale cost prices from legacy IDR magnitude
     * down to realistic Philippine Peso (PHP / ₱) amounts.
     */
    public function up(): void
    {
        $normalized = [
            'SKU-1001' => ['price' => 24990.00, 'cost_price' => 18500.00], // Aurora X5 Smartphone
            'SKU-1002' => ['price' => 48990.00, 'cost_price' => 38000.00], // Nimbus 14 Laptop
            'SKU-1003' => ['price' => 2490.00,  'cost_price' => 1650.00],  // Pulse Wireless Earbuds
            'SKU-1004' => ['price' => 1250.00,  'cost_price' => 750.00],   // Volt 65W Charger
            'SKU-1005' => ['price' => 28990.00, 'cost_price' => 22500.00], // Crystal 55" Smart TV
            'SKU-2001' => ['price' => 450.00,   'cost_price' => 280.00],   // Arabica Coffee Beans 500g
            'SKU-2002' => ['price' => 680.00,   'cost_price' => 450.00],   // Extra Virgin Olive Oil 1L
            'SKU-2003' => ['price' => 380.00,   'cost_price' => 260.00],   // Organic Brown Rice 5kg
            'SKU-2004' => ['price' => 240.00,   'cost_price' => 160.00],   // Mineral Water 24 Pack
            'SKU-2005' => ['price' => 180.00,   'cost_price' => 110.00],   // Dark Chocolate Bar 100g
            'SKU-3001' => ['price' => 499.00,   'cost_price' => 280.00],   // Classic Cotton T-Shirt
            'SKU-3002' => ['price' => 1290.00,  'cost_price' => 750.00],   // Denim Jeans Regular
            'SKU-3003' => ['price' => 3490.00,  'cost_price' => 2100.00],  // Running Shoes Aero
            'SKU-3004' => ['price' => 1890.00,  'cost_price' => 1150.00],  // Windbreaker Jacket
            'SKU-4001' => ['price' => 1950.00,  'cost_price' => 1250.00],  // Ceramic Dinner Set 12pc
            'SKU-4002' => ['price' => 850.00,   'cost_price' => 480.00],   // LED Desk Lamp
            'SKU-4003' => ['price' => 1150.00,  'cost_price' => 690.00],   // Non-stick Frying Pan 28cm
            'SKU-5001' => ['price' => 480.00,   'cost_price' => 290.00],   // Vitamin C 1000mg 60tab
            'SKU-5002' => ['price' => 550.00,   'cost_price' => 340.00],   // Sunscreen SPF50 50ml
            'SKU-6001' => ['price' => 750.00,   'cost_price' => 420.00],   // Yoga Mat 6mm
            'SKU-6002' => ['price' => 1650.00,  'cost_price' => 980.00],   // Dumbbell Set 10kg
        ];

        foreach ($normalized as $sku => $values) {
            DB::table('products')->where('sku', $sku)->update([
                'price' => $values['price'],
                'cost_price' => $values['cost_price'],
                'updated_at' => now(),
            ]);

            // Sync inventory last_cost_price
            $product = DB::table('products')->where('sku', $sku)->first();
            if ($product) {
                DB::table('inventory')->where('product_id', $product->id)->update([
                    'last_cost_price' => $values['cost_price'],
                    'updated_at' => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        // Revert to legacy amounts if needed
    }
};
