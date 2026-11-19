<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    public function __construct(private AuditService $audit)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $products = Product::with(['category', 'inventory'])
            ->search($request->query('search'))
            ->when($request->query('category_id'), fn ($q, $id) => $q->where('category_id', $id))
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->when($request->boolean('low_stock'), fn ($q) => $q->lowStock())
            ->orderBy($request->query('sort', 'id'), $request->query('direction', 'desc'))
            ->paginate($request->integer('per_page', 15));

        return response()->json($products);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);

        $product = Product::create($data);

        if (!\App\Models\Inventory::where('product_id', $product->id)->exists()) {
            \App\Models\Inventory::create([
                'product_id' => $product->id,
                'quantity' => $data['initial_stock'] ?? 0,
                'min_stock' => $data['min_stock'] ?? 5,
            ]);

            if (($data['initial_stock'] ?? 0) > 0) {
                \App\Models\InventoryTransaction::create([
                    'product_id' => $product->id,
                    'type' => 'stock_in',
                    'quantity' => $data['initial_stock'],
                    'reference' => 'INIT',
                    'notes' => 'Initial stock on product creation',
                    'user_id' => $request->user()?->id,
                    'created_at' => now(),
                ]);
            }
        }

        $this->audit->model('create', $product, ['sku' => $product->sku]);

        return response()->json([
            'message' => 'Product created.',
            'product' => $product->load(['category', 'inventory']),
        ], 201);
    }

    public function show(Product $product): JsonResponse
    {
        return response()->json([
            'product' => $product->load(['category', 'inventory']),
        ]);
    }

    public function update(Request $request, Product $product): JsonResponse
    {
        $data = $this->validated($request, $product->id);
        unset($data['initial_stock'], $data['min_stock']);

        $before = $product->getAttributes();
        $product->update($data);

        if ($request->has('min_stock') && $product->inventory) {
            $product->inventory->update(['min_stock' => $request->integer('min_stock')]);
        }

        $this->audit->model('update', $product, ['before' => $before]);

        return response()->json([
            'message' => 'Product updated.',
            'product' => $product->fresh(['category', 'inventory']),
        ]);
    }

    public function destroy(Product $product): JsonResponse
    {
        $this->audit->model('delete', $product);
        $product->delete();

        return response()->json(['message' => 'Product deleted.']);
    }

    private function validated(Request $request, ?int $ignoreId = null): array
    {
        // Support frontend field name aliases
        if ($request->has('cost') && !$request->has('cost_price')) {
            $request->merge(['cost_price' => $request->input('cost')]);
        }
        if ($request->has('stock') && !$request->has('initial_stock')) {
            $request->merge(['initial_stock' => $request->input('stock')]);
        }
        if ($request->has('category') && !$request->has('category_id')) {
            $catVal = $request->input('category');
            if (is_numeric($catVal)) {
                $request->merge(['category_id' => (int) $catVal]);
            } elseif (is_string($catVal) && !empty($catVal)) {
                $category = \App\Models\Category::firstOrCreate(
                    ['name' => trim($catVal)],
                    ['slug' => \Illuminate\Support\Str::slug(trim($catVal))]
                );
                $request->merge(['category_id' => $category->id]);
            }
        }

        return $request->validate([
            'sku' => ['required', 'string', 'max:64', 'unique:products,sku'.($ignoreId ? ",{$ignoreId}" : '')],
            'barcode' => ['required', 'string', 'max:64', 'unique:products,barcode'.($ignoreId ? ",{$ignoreId}" : '')],
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'category_id' => ['required', 'exists:categories,id'],
            'price' => ['required', 'numeric', 'min:0'],
            'cost_price' => ['nullable', 'numeric', 'min:0'],
            'unit' => ['nullable', 'string', 'max:32'],
            'status' => ['nullable', 'in:active,inactive'],
            'initial_stock' => ['nullable', 'integer', 'min:0'],
            'min_stock' => ['nullable', 'integer', 'min:0'],
        ]);
    }
}
