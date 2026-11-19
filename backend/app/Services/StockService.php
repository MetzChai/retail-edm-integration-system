<?php

namespace App\Services;

use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\Product;
use Illuminate\Support\Facades\DB;

/**
 * Stock movement helper shared by inventory endpoints, sales and ETL.
 */
class StockService
{
    /**
     * Apply a stock movement inside the caller's transaction.
     *
     * @param array{type: string, quantity: int, reference?: string, notes?: string, user_id?: int} $movement
     * @return InventoryTransaction
     *
     * @throws \RuntimeException when the movement would drive stock negative.
     */
    public function move(Product $product, array $movement): InventoryTransaction
    {
        $type = $movement['type'];
        $qty = (int) $movement['quantity'];

        $inventory = Inventory::firstOrNew(['product_id' => $product->id], [
            'quantity' => 0,
            'min_stock' => 5,
        ]);

        $current = (int) $inventory->quantity;

        if ($type === InventoryTransaction::TYPE_STOCK_IN) {
            $inventory->quantity = $current + $qty;
            $inventory->last_restocked_at = now();
        } elseif ($type === InventoryTransaction::TYPE_STOCK_OUT) {
            if ($current < $qty) {
                throw new \RuntimeException(
                    "Insufficient stock for product {$product->sku}: available {$current}, requested {$qty}."
                );
            }
            $inventory->quantity = $current - $qty;
        } elseif ($type === InventoryTransaction::TYPE_ADJUSTMENT) {
            // quantity is treated as the new absolute count for adjustments.
            if ($qty < 0) {
                throw new \RuntimeException('Adjustment quantity must not be negative.');
            }
            $inventory->quantity = $qty;
        } else {
            throw new \RuntimeException("Unknown movement type: {$type}");
        }

        $inventory->save();

        // Capture Change Data Capture (CDC) event
        \App\Models\CdcEvent::capture('inventory', $product->id, 'UPDATE', [
            'sku' => $product->sku,
            'quantity' => $current,
        ], [
            'sku' => $product->sku,
            'quantity' => $inventory->quantity,
            'movement_type' => $type,
            'reference' => $movement['reference'] ?? null,
        ]);

        return InventoryTransaction::create([
            'product_id' => $product->id,
            'type' => $type,
            'quantity' => $qty,
            'reference' => $movement['reference'] ?? null,
            'notes' => $movement['notes'] ?? null,
            'user_id' => $movement['user_id'] ?? null,
            'created_at' => now(),
        ]);
    }

    /**
     * Run $callback inside a DB transaction and rethrow with rollback intact.
     *
     * @template T
     *
     * @param callable(): T $callback
     * @return T
     */
    public function transaction(callable $callback): mixed
    {
        return DB::transaction($callback);
    }
}
