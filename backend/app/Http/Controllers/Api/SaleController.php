<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\InventoryTransaction;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Services\AuditService;
use App\Services\StockService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SaleController extends Controller
{
    public function __construct(
        private StockService $stock,
        private AuditService $audit,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $sales = Sale::with(['customer', 'user', 'items.product', 'shipment'])
            ->search($request->query('search'))
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->when($request->query('source'), fn ($q, $s) => $q->where('source', $s))
            ->when($request->query('payment_method'), fn ($q, $m) => $q->where('payment_method', $m))
            ->when($request->query('customer_id'), fn ($q, $id) => $q->where('customer_id', $id))
            ->betweenDates($request->query('from'), $request->query('to'))
            ->latest('id')
            ->paginate($request->integer('per_page', 15));

        return response()->json($sales);
    }

    /**
     * Create a sale. Stock deduction + sale rows run in one DB transaction
     * with oversell prevention (throws and rolls back when stock is short).
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['nullable', 'exists:customers,id'],
            'payment_method' => ['required', 'in:cash,card,ewallet,bank_transfer,credit'],
            'source' => ['nullable', 'in:pos,online'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string', 'max:500'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'exists:products,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1'],
        ]);

        try {
            $sale = $this->stock->transaction(function () use ($data, $request) {
                $subtotalSum = 0.0;
                $resolved = [];

                foreach ($data['items'] as $item) {
                    $product = Product::with('inventory')
                        ->where('id', $item['product_id'])
                        ->lockForUpdate()
                        ->firstOrFail();

                    if ($product->status !== 'active') {
                        throw new \RuntimeException("Product {$product->sku} is inactive.");
                    }

                    $qty = (int) $item['quantity'];
                    $price = (float) $product->price;
                    $subtotal = round($qty * $price, 2);
                    $subtotalSum += $subtotal;

                    $resolved[] = compact('product', 'qty', 'price', 'subtotal');
                }

                $discount = min($subtotalSum, max(0, (float) ($data['discount'] ?? 0)));
                $finalTotal = round(max(0, $subtotalSum - $discount), 2);

                $sale = Sale::create([
                    'transaction_no' => $this->transactionNo($data['source'] ?? 'pos'),
                    'customer_id' => $data['customer_id'] ?? null,
                    'user_id' => $request->user()?->id,
                    'total' => $finalTotal,
                    'discount' => $discount,
                    'payment_method' => $data['payment_method'],
                    'status' => 'completed',
                    'source' => $data['source'] ?? 'pos',
                    'notes' => $data['notes'] ?? null,
                ]);

                foreach ($resolved as $row) {
                    SaleItem::create([
                        'sale_id' => $sale->id,
                        'product_id' => $row['product']->id,
                        'quantity' => $row['qty'],
                        'price' => $row['price'],
                        'subtotal' => $row['subtotal'],
                    ]);

                    // Deduct stock (throws + rollback when insufficient).
                    $this->stock->move($row['product'], [
                        'type' => InventoryTransaction::TYPE_STOCK_OUT,
                        'quantity' => $row['qty'],
                        'reference' => $sale->transaction_no,
                        'notes' => 'Sale #'.$sale->id,
                        'user_id' => $request->user()?->id,
                    ]);
                }

                \App\Models\PaymentRecord::create([
                    'sale_id' => $sale->id,
                    'payment_method' => $data['payment_method'],
                    'amount' => $finalTotal,
                    'reference_no' => 'PAY-'.$sale->transaction_no,
                    'status' => 'paid',
                    'user_id' => $request->user()?->id,
                    'paid_at' => now(),
                ]);

                \App\Models\CdcEvent::capture('sale', $sale->id, 'INSERT', null, [
                    'transaction_no' => $sale->transaction_no,
                    'total' => $sale->total,
                    'discount' => $sale->discount,
                    'source' => $sale->source,
                ]);

                return $sale;
            });
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $this->audit->model('create', $sale, ['total' => $sale->total, 'discount' => $sale->discount]);

        return response()->json([
            'message' => 'Sale created.',
            'sale' => $this->receipt($sale),
        ], 201);
    }

    public function show(Sale $sale): JsonResponse
    {
        return response()->json(['sale' => $this->receipt($sale)]);
    }

    /**
     * Update order status with protection against duplicate stock deductions.
     * Transitions: pending -> confirmed -> processing -> shipped -> completed | cancelled
     */
    public function updateStatus(Request $request, Sale $sale): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', 'string', 'in:pending,confirmed,processing,shipped,completed,cancelled,refunded'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $previousStatus = $sale->status;
        $newStatus = $data['status'];

        if ($previousStatus === $newStatus) {
            return response()->json([
                'message' => 'Status is already '.$newStatus,
                'sale' => $this->receipt($sale),
            ]);
        }

        $sale->load(['items.product']);

        $this->stock->transaction(function () use ($sale, $previousStatus, $newStatus, $data, $request) {
            // If cancelling an active order, return reserved stock to inventory
            if ($newStatus === 'cancelled' && $previousStatus !== 'cancelled') {
                foreach ($sale->items as $item) {
                    if ($item->product) {
                        $this->stock->move($item->product, [
                            'type' => InventoryTransaction::TYPE_STOCK_IN,
                            'quantity' => $item->quantity,
                            'reference' => 'CANCEL-'.$sale->transaction_no,
                            'notes' => 'Stock return for cancelled order #'.$sale->transaction_no,
                            'user_id' => $request->user()?->id,
                        ]);
                    }
                }
            }

            // If reviving a previously cancelled order, deduct stock once more
            if ($previousStatus === 'cancelled' && $newStatus !== 'cancelled') {
                foreach ($sale->items as $item) {
                    if ($item->product) {
                        $this->stock->move($item->product, [
                            'type' => InventoryTransaction::TYPE_STOCK_OUT,
                            'quantity' => $item->quantity,
                            'reference' => 'REOPEN-'.$sale->transaction_no,
                            'notes' => 'Stock deduction for reactivated order #'.$sale->transaction_no,
                            'user_id' => $request->user()?->id,
                        ]);
                    }
                }
            }

            $sale->status = $newStatus;
            if (!empty($data['notes'])) {
                $sale->notes = trim(($sale->notes ? $sale->notes . ' | ' : '') . $data['notes']);
            }
            $sale->save();
        });

        $this->audit->log('order_status_change', 'Sale', $sale->id, [
            'from' => $previousStatus,
            'to' => $newStatus,
            'order' => $sale->transaction_no,
        ]);

        \App\Models\Notification::createNotification(
            'Order Status Updated',
            "Order #{$sale->transaction_no} updated from {$previousStatus} to {$newStatus}.",
            $newStatus === 'cancelled' ? 'warning' : 'info',
            'order',
            null,
            '/storefront'
        );

        return response()->json([
            'message' => "Order status updated to {$newStatus}.",
            'sale' => $this->receipt($sale->fresh(['customer', 'user', 'items.product', 'payments'])),
        ]);
    }

    /**
     * Receipt payload for the POS receipt printer / PDF view.
     */
    public function receipt(Sale $sale): array
    {
        $sale->load(['customer', 'user', 'items.product', 'payments']);

        return [
            'id' => $sale->id,
            'transaction_no' => $sale->transaction_no,
            'status' => $sale->status,
            'source' => $sale->source,
            'created_at' => $sale->created_at,
            'customer' => $sale->customer ? [
                'id' => $sale->customer->id,
                'name' => $sale->customer->name,
                'email' => $sale->customer->email,
                'phone' => $sale->customer->phone,
            ] : null,
            'cashier' => $sale->user?->name,
            'items' => $sale->items->map(fn (SaleItem $item) => [
                'product_id' => $item->product_id,
                'sku' => $item->product?->sku,
                'name' => $item->product?->name,
                'quantity' => $item->quantity,
                'price' => (float) $item->price,
                'subtotal' => (float) $item->subtotal,
            ]),
            'payment_method' => $sale->payment_method,
            'payments' => $sale->payments->map(fn ($p) => [
                'payment_method' => $p->payment_method,
                'amount' => (float) $p->amount,
                'reference_no' => $p->reference_no,
                'paid_at' => $p->paid_at,
            ]),
            'subtotal' => (float) $sale->items->sum('subtotal'),
            'discount' => (float) ($sale->discount ?? 0),
            'total' => (float) $sale->total,
            'notes' => $sale->notes,
        ];
    }

    private function transactionNo(string $source): string
    {
        $prefix = $source === 'online' ? 'ONL' : 'TRX';
        $date = now()->format('Ymd');
        $seq = Sale::where('transaction_no', 'like', "{$prefix}-{$date}-%")->count() + 1;

        do {
            $no = sprintf('%s-%s-%04d', $prefix, $date, $seq);
            $seq++;
        } while (Sale::where('transaction_no', $no)->exists());

        return $no;
    }
}
