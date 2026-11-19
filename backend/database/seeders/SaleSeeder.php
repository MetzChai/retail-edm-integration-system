<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\PaymentRecord;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\User;
use Illuminate\Database\Seeder;

class SaleSeeder extends Seeder
{
    public function run(): void
    {
        $products = Product::with('inventory')->get();
        $customers = Customer::all();
        $staff = User::where('email', 'staff@retail.test')->first();
        $manager = User::where('email', 'manager@retail.test')->first();

        if ($products->isEmpty()) {
            return;
        }

        $paymentMethods = ['cash', 'card', 'ewallet', 'bank_transfer'];
        $seq = 1;

        // ~120 sales spread across the last 60 days.
        for ($day = 60; $day >= 0; $day--) {
            $count = random_int(1, 3);

            for ($i = 0; $i < $count; $i++) {
                $itemsCount = random_int(1, 4);
                $items = $products->random($itemsCount);

                $createdAt = now()->subDays($day)->setTime(random_int(8, 21), random_int(0, 59));

                $sale = Sale::create([
                    'transaction_no' => 'TRX-'.$createdAt->format('Ymd').'-'.str_pad((string) $seq, 4, '0', STR_PAD_LEFT),
                    'customer_id' => $customers->random()->id,
                    'user_id' => ($day % 3 === 0 ? $manager : $staff)?->id,
                    'total' => 0,
                    'payment_method' => $paymentMethods[random_int(0, 3)],
                    'status' => 'completed',
                    'source' => random_int(0, 4) === 0 ? 'online' : 'pos',
                    'created_at' => $createdAt,
                    'updated_at' => $createdAt,
                ]);

                $total = 0;

                foreach ($items as $product) {
                    $qty = random_int(1, 3);
                    $price = (float) $product->price;
                    $subtotal = round($qty * $price, 2);
                    $total += $subtotal;

                    SaleItem::create([
                        'sale_id' => $sale->id,
                        'product_id' => $product->id,
                        'quantity' => $qty,
                        'price' => $price,
                        'subtotal' => $subtotal,
                    ]);

                    // Reflect historical sale in inventory (keep it non-negative).
                    $inventory = Inventory::firstOrNew(['product_id' => $product->id], ['quantity' => 0, 'min_stock' => 10]);
                    $newQty = max(0, (int) $inventory->quantity - $qty);
                    $inventory->quantity = $newQty;
                    $inventory->save();
                }

                $sale->update(['total' => round($total, 2)]);

                PaymentRecord::create([
                    'sale_id' => $sale->id,
                    'payment_method' => $sale->payment_method,
                    'amount' => round($total, 2),
                    'reference_no' => 'PAY-'.$sale->transaction_no,
                    'status' => 'paid',
                    'user_id' => $sale->user_id,
                    'paid_at' => $createdAt,
                    'created_at' => $createdAt,
                    'updated_at' => $createdAt,
                ]);

                $seq++;
            }
        }

        // A few low-stock / out-of-stock items for dashboard realism.
        $products->take(3)->each(function (Product $product) {
            if ($product->inventory) {
                $product->inventory->update(['quantity' => random_int(0, 3)]);
            }
        });

        // Ensure at least one product is fully stocked with a restock transaction.
        $first = $products->first();
        if ($first && $first->inventory) {
            $first->inventory->update(['quantity' => 80]);
            InventoryTransaction::create([
                'product_id' => $first->id,
                'type' => 'stock_in',
                'quantity' => 80,
                'reference' => 'RESEED',
                'notes' => 'Seeder top-up',
                'created_at' => now(),
            ]);
        }
    }
}
