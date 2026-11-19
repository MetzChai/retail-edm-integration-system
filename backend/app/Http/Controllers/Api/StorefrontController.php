<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Customer;
use App\Models\InventoryTransaction;
use App\Models\PaymentRecord;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Services\AuditService;
use App\Services\StockService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StorefrontController extends Controller
{
    public function __construct(
        private StockService $stock,
        private AuditService $audit,
    ) {
    }

    /**
     * Public catalog browsing: active products with inventory and categories.
     * No authentication required.
     */
    public function products(Request $request): JsonResponse
    {
        $products = Product::with(['category', 'inventory'])
            ->where('status', 'active')
            ->search($request->query('search'))
            ->when($request->query('category_id'), fn ($q, $c) => $q->where('category_id', $c))
            ->latest('id')
            ->paginate($request->integer('per_page', 24));

        return response()->json($products);
    }

    /**
     * Public categories list. No authentication required.
     */
    public function categories(): JsonResponse
    {
        $categories = Category::withCount(['products' => fn ($q) => $q->where('status', 'active')])
            ->get();

        return response()->json(['categories' => $categories]);
    }

    /**
     * Public guest checkout.
     * Customers can place orders without creating an account.
     * Collects name, email, contact number, delivery address, items, and payment method.
     */
    public function checkout(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255'],
            'contact_number' => ['nullable', 'string', 'max:50'],
            'phone' => ['nullable', 'string', 'max:50'],
            'delivery_address' => ['nullable', 'string', 'max:500'],
            'address' => ['nullable', 'string', 'max:500'],
            'city' => ['nullable', 'string', 'max:100'],
            'payment_method' => ['required', 'in:cash,card,ewallet,bank_transfer,credit'],
            'notes' => ['nullable', 'string', 'max:500'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'exists:products,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1'],
        ]);

        $phone = $data['phone'] ?? $data['contact_number'] ?? null;
        $address = $data['address'] ?? $data['delivery_address'] ?? null;

        if (empty($phone)) {
            return response()->json(['message' => 'Contact number is required.'], 422);
        }

        if (empty($address)) {
            return response()->json(['message' => 'Delivery address is required.'], 422);
        }

        try {
            $sale = $this->stock->transaction(function () use ($data, $phone, $address) {
                // Find or create customer record
                $customer = Customer::where('email', $data['email'])->first();
                if ($customer) {
                    $customer->update(array_filter([
                        'name' => $data['name'],
                        'phone' => $phone,
                        'address' => $address,
                        'city' => $data['city'] ?? $customer->city,
                    ]));
                } else {
                    $customer = Customer::create([
                        'name' => $data['name'],
                        'email' => $data['email'],
                        'phone' => $phone,
                        'address' => $address,
                        'city' => $data['city'] ?? null,
                    ]);
                }

                $total = 0.0;
                $resolved = [];

                foreach ($data['items'] as $item) {
                    $product = Product::with('inventory')
                        ->where('id', $item['product_id'])
                        ->lockForUpdate()
                        ->firstOrFail();

                    if ($product->status !== 'active') {
                        throw new \RuntimeException("Product '{$product->name}' ({$product->sku}) is no longer available.");
                    }

                    $availableStock = $product->inventory?->quantity ?? 0;
                    if ($availableStock < $item['quantity']) {
                        throw new \RuntimeException("Insufficient stock for '{$product->name}'. Available: {$availableStock}, Requested: {$item['quantity']}.");
                    }

                    $qty = (int) $item['quantity'];
                    $price = (float) $product->price;
                    $subtotal = round($qty * $price, 2);
                    $total += $subtotal;

                    $resolved[] = compact('product', 'qty', 'price', 'subtotal');
                }

                $transactionNo = $this->generateOrderNumber();

                $sale = Sale::create([
                    'transaction_no' => $transactionNo,
                    'customer_id' => $customer->id,
                    'user_id' => null, // Guest checkout (no staff logged in)
                    'total' => round($total, 2),
                    'payment_method' => $data['payment_method'],
                    'status' => 'completed',
                    'source' => 'online',
                    'notes' => $data['notes'] ?? 'Guest checkout order',
                ]);

                foreach ($resolved as $row) {
                    SaleItem::create([
                        'sale_id' => $sale->id,
                        'product_id' => $row['product']->id,
                        'quantity' => $row['qty'],
                        'price' => $row['price'],
                        'subtotal' => $row['subtotal'],
                    ]);

                    $this->stock->move($row['product'], [
                        'type' => InventoryTransaction::TYPE_STOCK_OUT,
                        'quantity' => $row['qty'],
                        'reference' => $sale->transaction_no,
                        'notes' => 'Online Guest Order #'.$sale->transaction_no,
                        'user_id' => null,
                    ]);
                }

                PaymentRecord::create([
                    'sale_id' => $sale->id,
                    'payment_method' => $data['payment_method'],
                    'amount' => round($total, 2),
                    'reference_no' => 'PAY-'.$sale->transaction_no,
                    'status' => 'paid',
                    'user_id' => null,
                    'paid_at' => now(),
                ]);

                // Create initial shipment for online order
                $shipment = \App\Models\Shipment::create([
                    'sale_id' => $sale->id,
                    'tracking_number' => \App\Models\Shipment::generateTrackingNumber('LBC Express'),
                    'logistics_provider' => 'LBC Express',
                    'status' => \App\Models\Shipment::STATUS_PENDING,
                    'recipient_name' => $customer->name,
                    'recipient_phone' => $customer->phone ?? '0917-000-0000',
                    'shipping_address' => $address,
                    'estimated_delivery_at' => now()->addDays(3),
                    'notes' => 'Storefront guest order queued for 3PL dispatch',
                ]);

                \App\Models\CdcEvent::capture('shipments', $shipment->id, 'INSERT', null, $shipment->toArray());

                return $sale;
            });
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $sale->load(['customer', 'items.product', 'payments', 'shipment']);

        return response()->json([
            'message' => 'Guest order completed successfully.',
            'order_number' => $sale->transaction_no,
            'tracking_number' => $sale->shipment?->tracking_number,
            'logistics_provider' => $sale->shipment?->logistics_provider,
            'estimated_delivery' => $sale->shipment?->estimated_delivery_at?->format('Y-m-d'),
            'sale' => [
                'id' => $sale->id,
                'transaction_no' => $sale->transaction_no,
                'status' => $sale->status,
                'source' => $sale->source,
                'total' => (float) $sale->total,
                'payment_method' => $sale->payment_method,
                'customer' => [
                    'id' => $sale->customer->id,
                    'name' => $sale->customer->name,
                    'email' => $sale->customer->email,
                    'phone' => $sale->customer->phone,
                    'address' => $sale->customer->address,
                ],
                'items' => $sale->items->map(fn (SaleItem $item) => [
                    'product_id' => $item->product_id,
                    'name' => $item->product?->name,
                    'sku' => $item->product?->sku,
                    'quantity' => $item->quantity,
                    'price' => (float) $item->price,
                    'subtotal' => (float) $item->subtotal,
                ]),
                'created_at' => $sale->created_at,
            ],
        ], 201);
    }

    private function generateOrderNumber(): string
    {
        $prefix = 'ONL';
        $date = now()->format('Ymd');
        $seq = Sale::where('transaction_no', 'like', "{$prefix}-{$date}-%")->count() + 1;

        do {
            $no = sprintf('%s-%s-%04d', $prefix, $date, $seq);
            $seq++;
        } while (Sale::where('transaction_no', $no)->exists());

        return $no;
    }
}

