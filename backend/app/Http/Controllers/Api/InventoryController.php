<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Inventory;
use App\Models\InventoryTransaction;
use App\Models\Product;
use App\Services\AuditService;
use App\Services\StockService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InventoryController extends Controller
{
    public function __construct(
        private StockService $stock,
        private AuditService $audit,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $query = Inventory::with(['product', 'product.category']);

        if ($request->boolean('low_stock')) {
            $query->whereColumn('quantity', '<=', 'min_stock');
        }

        if ($search = $request->query('search')) {
            $query->whereHas('product', fn ($q) => $q->search($search));
        }

        if ($request->boolean('out_of_stock')) {
            $query->where('quantity', 0);
        }

        return response()->json(
            $query->orderBy('quantity')->paginate($request->integer('per_page', 15))
        );
    }

    /**
     * Stock in.
     */
    public function stockIn(Request $request): JsonResponse
    {
        return $this->move($request, InventoryTransaction::TYPE_STOCK_IN);
    }

    /**
     * Stock out.
     */
    public function stockOut(Request $request): JsonResponse
    {
        return $this->move($request, InventoryTransaction::TYPE_STOCK_OUT);
    }

    /**
     * Absolute adjustment (set quantity).
     */
    public function adjust(Request $request): JsonResponse
    {
        return $this->move($request, InventoryTransaction::TYPE_ADJUSTMENT);
    }

    public function history(Request $request): JsonResponse
    {
        $query = InventoryTransaction::with(['product', 'user'])
            ->when($request->query('product_id'), fn ($q, $id) => $q->where('product_id', $id))
            ->when($request->query('type'), fn ($q, $t) => $q->where('type', $t))
            ->when($request->query('from'), fn ($q, $f) => $q->where('created_at', '>=', $f))
            ->when($request->query('to'), fn ($q, $t) => $q->where('created_at', '<=', $t.' 23:59:59'));

        return response()->json($query->latest('id')->paginate($request->integer('per_page', 20)));
    }

    public function lowStock(Request $request): JsonResponse
    {
        $items = Inventory::with(['product', 'product.category'])
            ->whereColumn('quantity', '<=', 'min_stock')
            ->orderBy('quantity')
            ->paginate($request->integer('per_page', 50));

        return response()->json($items);
    }

    private function move(Request $request, string $type): JsonResponse
    {
        if ($request->has('note') && !$request->has('notes')) {
            $request->merge(['notes' => $request->input('note')]);
        }

        $data = $request->validate([
            'product_id' => ['required', 'exists:products,id'],
            'quantity' => ['required', 'integer', 'min:0'],
            'reference' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:500'],
            'min_stock' => ['nullable', 'integer', 'min:0'],
        ]);

        $product = Product::with('inventory')->findOrFail($data['product_id']);

        try {
            $transaction = $this->stock->transaction(function () use ($data, $product, $type, $request) {
                if ($type === InventoryTransaction::TYPE_ADJUSTMENT) {
                    // Adjustment semantics: quantity is the new absolute count.
                }

                if ($request->has('min_stock') && $product->inventory) {
                    $product->inventory->update(['min_stock' => $request->integer('min_stock')]);
                }

                return $this->stock->move($product, [
                    'type' => $type,
                    'quantity' => (int) $data['quantity'],
                    'reference' => $data['reference'] ?? strtoupper($type),
                    'notes' => $data['notes'] ?? null,
                    'user_id' => $request->user()?->id,
                ]);
            });
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $this->audit->log($type, 'Product', $product->id, [
            'sku' => $product->sku,
            'quantity' => $data['quantity'],
            'reference' => $data['reference'] ?? null,
        ]);

        return response()->json([
            'message' => 'Stock updated.',
            'transaction' => $transaction,
            'inventory' => $product->fresh('inventory')->inventory,
        ], 201);
    }
}
