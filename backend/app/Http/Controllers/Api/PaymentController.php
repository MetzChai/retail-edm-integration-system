<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PaymentRecord;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentController extends Controller
{
    public function __construct(private AuditService $audit)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $payments = PaymentRecord::with(['sale.customer', 'user'])
            ->when($request->query('payment_method'), fn ($q, $m) => $q->where('payment_method', $m))
            ->when($request->query('sale_id'), fn ($q, $id) => $q->where('sale_id', $id))
            ->when($request->query('from'), fn ($q, $f) => $q->where('paid_at', '>=', $f))
            ->when($request->query('to'), fn ($q, $t) => $q->where('paid_at', '<=', $t.' 23:59:59'))
            ->latest('id')
            ->paginate($request->integer('per_page', 15));

        return response()->json($payments);
    }

    /**
     * Record an additional / external payment (no card data accepted).
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'sale_id' => ['nullable', 'exists:sales,id'],
            'payment_method' => ['required', 'in:cash,card,ewallet,bank_transfer,credit'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'reference_no' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', 'in:paid,refunded,pending'],
            'notes' => ['nullable', 'string', 'max:500'],
            // Explicitly reject any card payload.
            'card_number' => ['prohibited'],
            'cvv' => ['prohibited'],
            'pan' => ['prohibited'],
        ]);

        $payment = PaymentRecord::create([
            'sale_id' => $data['sale_id'] ?? null,
            'payment_method' => $data['payment_method'],
            'amount' => $data['amount'],
            'reference_no' => $data['reference_no'] ?? null,
            'status' => $data['status'] ?? 'paid',
            'notes' => $data['notes'] ?? null,
            'user_id' => $request->user()?->id,
            'paid_at' => now(),
        ]);

        $this->audit->model('create', $payment);

        return response()->json([
            'message' => 'Payment recorded.',
            'payment' => $payment,
        ], 201);
    }

    public function show(PaymentRecord $payment): JsonResponse
    {
        return response()->json([
            'payment' => $payment->load(['sale.customer', 'user']),
        ]);
    }
}
