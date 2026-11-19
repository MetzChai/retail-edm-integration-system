<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\Product;
use Illuminate\Database\Seeder;

class ProductSeeder extends Seeder
{
    public function run(): void
    {
        $products = [
            ['SKU-1001', '8991001000011', 'Aurora X5 Smartphone', 'Electronics', 24990, 18500],
            ['SKU-1002', '8991001000028', 'Nimbus 14 Laptop', 'Laptops', 48990, 38000],
            ['SKU-1003', '8991001000035', 'Pulse Wireless Earbuds', 'Electronics', 2490, 1650],
            ['SKU-1004', '8991001000042', 'Volt 65W Charger', 'Electronics', 1250, 750],
            ['SKU-1005', '8991001000059', 'Crystal 55" Smart TV', 'Electronics', 28990, 22500],
            ['SKU-2001', '8991002000010', 'Arabica Coffee Beans 500g', 'Groceries', 450, 280],
            ['SKU-2002', '8991002000027', 'Extra Virgin Olive Oil 1L', 'Groceries', 680, 450],
            ['SKU-2003', '8991002000034', 'Organic Brown Rice 5kg', 'Groceries', 380, 260],
            ['SKU-2004', '8991002000041', 'Mineral Water 24 Pack', 'Beverages', 240, 160],
            ['SKU-2005', '8991002000058', 'Dark Chocolate Bar 100g', 'Snacks', 180, 110],
            ['SKU-3001', '8991003000019', 'Classic Cotton T-Shirt', 'Apparel', 499, 280],
            ['SKU-3002', '8991003000026', 'Denim Jeans Regular', 'Apparel', 1290, 750],
            ['SKU-3003', '8991003000033', 'Running Shoes Aero', 'Sports & Outdoors', 3490, 2100],
            ['SKU-3004', '8991003000040', 'Windbreaker Jacket', 'Apparel', 1890, 1150],
            ['SKU-4001', '8991004000018', 'Ceramic Dinner Set 12pc', 'Home & Living', 1950, 1250],
            ['SKU-4002', '8991004000025', 'LED Desk Lamp', 'Home & Living', 850, 480],
            ['SKU-4003', '8991004000032', 'Non-stick Frying Pan 28cm', 'Home & Living', 1150, 690],
            ['SKU-5001', '8991005000017', 'Vitamin C 1000mg 60tab', 'Health & Beauty', 480, 290],
            ['SKU-5002', '8991005000024', 'Sunscreen SPF50 50ml', 'Health & Beauty', 550, 340],
            ['SKU-6001', '8991006000015', 'Yoga Mat 6mm', 'Sports & Outdoors', 750, 420],
            ['SKU-6002', '8991006000022', 'Dumbbell Set 10kg', 'Sports & Outdoors', 1650, 980],
        ];

        $minStocks = [10, 5, 20, 30, 4, 25, 15, 12, 40, 50, 18, 10, 8, 12, 6, 20, 14, 25, 22, 16, 9];

        foreach ($products as $i => [$sku, $barcode, $name, $categoryName, $price, $cost]) {
            $category = Category::where('name', $categoryName)->first()
                ?? Category::where('slug', \Illuminate\Support\Str::slug($categoryName))->first();

            $product = Product::updateOrCreate(
                ['sku' => $sku],
                [
                    'barcode' => $barcode,
                    'name' => $name,
                    'description' => $name.' - seeded product',
                    'category_id' => $category->id,
                    'price' => $price,
                    'cost_price' => $cost,
                    'unit' => 'pcs',
                    'status' => 'active',
                ]
            );

            Inventory::updateOrCreate(
                ['product_id' => $product->id],
                [
                    'quantity' => random_int(5, 120),
                    'min_stock' => $minStocks[$i] ?? 10,
                    'last_cost_price' => $cost,
                    'last_restocked_at' => now()->subDays(random_int(1, 30)),
                ]
            );

            InventoryTransaction::firstOrCreate(
                [
                    'product_id' => $product->id,
                    'reference' => 'INIT',
                ],
                [
                    'type' => 'stock_in',
                    'quantity' => 50,
                    'notes' => 'Seeded opening stock',
                    'created_at' => now()->subDays(random_int(30, 60)),
                ]
            );
        }
    }
}
