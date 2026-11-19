<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CdcEvent;
use App\Models\Notification;
use App\Models\Sale;
use App\Models\Shipment;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ShipmentController extends Controller
{
    public function __construct(private AuditService $audit)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $shipments = Shipment::with(['sale.customer', 'sale.items.product'])
            ->search($request->query('search'))
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->when($request->query('provider'), fn ($q, $p) => $q->where('logistics_provider', $p))
            ->when($request->query('sale_id'), fn ($q, $id) => $q->where('sale_id', $id))
            ->latest('id')
            ->paginate($request->integer('per_page', 15));

        return response()->json($shipments);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'sale_id' => ['required', 'exists:sales,id'],
            'logistics_provider' => ['nullable', 'string', 'max:100'],
            'tracking_number' => ['nullable', 'string', 'unique:shipments,tracking_number', 'max:100'],
            'recipient_name' => ['nullable', 'string', 'max:255'],
            'recipient_phone' => ['nullable', 'string', 'max:50'],
            'shipping_address' => ['nullable', 'string', 'max:500'],
            'estimated_delivery_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $sale = Sale::with('customer')->findOrFail($data['sale_id']);

        $provider = $data['logistics_provider'] ?? 'LBC Express';
        $tracking = !empty($data['tracking_number'])
            ? $data['tracking_number']
            : Shipment::generateTrackingNumber($provider);

        $recipientName = $data['recipient_name'] ?? ($sale->customer?->name ?? 'Online Shopper');
        $recipientPhone = $data['recipient_phone'] ?? ($sale->customer?->phone ?? 'N/A');
        $shippingAddress = $data['shipping_address'] ?? ($sale->customer?->address ?? ($sale->customer?->city ?? 'Central Metro Hub'));

        $shipment = Shipment::create([
            'sale_id' => $sale->id,
            'tracking_number' => $tracking,
            'logistics_provider' => $provider,
            'status' => Shipment::STATUS_READY,
            'recipient_name' => $recipientName,
            'recipient_phone' => $recipientPhone,
            'shipping_address' => $shippingAddress,
            'estimated_delivery_at' => $data['estimated_delivery_at'] ?? now()->addDays(3),
            'notes' => $data['notes'] ?? 'Dispatched from Central Warehouse',
        ]);

        // Link order status to 'processing' or 'confirmed'
        if ($sale->status === 'pending') {
            $sale->update(['status' => 'confirmed']);
        }

        $this->audit->model('create', $shipment, [
            'tracking' => $tracking,
            'provider' => $provider,
            'order' => $sale->transaction_no,
        ]);

        CdcEvent::capture('shipment', $shipment->id, 'INSERT', null, [
            'tracking_number' => $tracking,
            'provider' => $provider,
            'order_reference' => $sale->transaction_no,
        ]);

        Notification::createNotification(
            'Shipment Created',
            "Shipment #{$tracking} ({$provider}) prepared for order {$sale->transaction_no}.",
            'info',
            'order',
            null,
            '/storefront'
        );

        return response()->json([
            'message' => 'Shipment successfully created.',
            'shipment' => $shipment->load('sale'),
        ], 201);
    }

    public function show(Shipment $shipment): JsonResponse
    {
        return response()->json([
            'shipment' => $shipment->load(['sale.customer', 'sale.items.product', 'sale.payments']),
        ]);
    }

    public function update(Request $request, Shipment $shipment): JsonResponse
    {
        $validStatuses = [
            Shipment::STATUS_PENDING,
            Shipment::STATUS_READY,
            Shipment::STATUS_SHIPPED,
            Shipment::STATUS_IN_TRANSIT,
            Shipment::STATUS_OUT_FOR_DELIVERY,
            Shipment::STATUS_DELIVERED,
            Shipment::STATUS_FAILED,
            Shipment::STATUS_RETURNED,
        ];

        $data = $request->validate([
            'status' => ['required', 'string', 'in:' . implode(',', $validStatuses)],
            'logistics_provider' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:500'],
            'delivered_at' => ['nullable', 'date'],
        ]);

        $oldStatus = $shipment->status;
        $newStatus = $data['status'];

        $shipment->status = $newStatus;
        if (!empty($data['logistics_provider'])) {
            $shipment->logistics_provider = $data['logistics_provider'];
        }
        if (!empty($data['notes'])) {
            $shipment->notes = trim(($shipment->notes ? $shipment->notes . ' | ' : '') . $data['notes']);
        }
        if ($newStatus === Shipment::STATUS_DELIVERED) {
            $shipment->delivered_at = $data['delivered_at'] ?? now();
        }

        $shipment->save();

        // Harmonize with Sale status
        if ($shipment->sale) {
            if ($newStatus === Shipment::STATUS_DELIVERED) {
                $shipment->sale->update(['status' => 'completed']);
            } elseif (in_array($newStatus, [Shipment::STATUS_SHIPPED, Shipment::STATUS_IN_TRANSIT, Shipment::STATUS_OUT_FOR_DELIVERY], true)) {
                $shipment->sale->update(['status' => 'shipped']);
            }
        }

        $this->audit->log('shipment_status_update', 'Shipment', $shipment->id, [
            'from' => $oldStatus,
            'to' => $newStatus,
            'tracking' => $shipment->tracking_number,
        ]);

        CdcEvent::capture('shipment', $shipment->id, 'UPDATE', ['status' => $oldStatus], ['status' => $newStatus, 'tracking' => $shipment->tracking_number]);

        Notification::createNotification(
            'Shipment Status Updated',
            "Shipment #{$shipment->tracking_number} updated to " . str_replace('_', ' ', $newStatus) . ".",
            $newStatus === Shipment::STATUS_DELIVERED ? 'success' : 'info',
            'order',
            null,
            '/storefront'
        );

        return response()->json([
            'message' => 'Shipment status updated successfully.',
            'shipment' => $shipment->fresh(['sale.customer', 'sale.items.product']),
        ]);
    }

    /**
     * Advance a shipment to the next logical stage in the delivery lifecycle.
     */
    public function advanceStatus(Shipment $shipment): JsonResponse
    {
        $lifecycle = [
            Shipment::STATUS_PENDING => Shipment::STATUS_READY,
            Shipment::STATUS_READY => Shipment::STATUS_SHIPPED,
            Shipment::STATUS_SHIPPED => Shipment::STATUS_IN_TRANSIT,
            Shipment::STATUS_IN_TRANSIT => Shipment::STATUS_OUT_FOR_DELIVERY,
            Shipment::STATUS_OUT_FOR_DELIVERY => Shipment::STATUS_DELIVERED,
        ];

        $next = $lifecycle[$shipment->status] ?? null;

        if (!$next) {
            return response()->json([
                'message' => "Shipment is already in final state: {$shipment->status}.",
                'shipment' => $shipment,
            ], 200);
        }

        $request = new Request(['status' => $next, 'notes' => 'Status advanced via Logistics Carrier Simulator']);
        return $this->update($request, $shipment);
    }

    /**
     * Public or authenticated tracking lookup by tracking number.
     */
    public function track(string $trackingNumber): JsonResponse
    {
        $shipment = Shipment::with(['sale.customer', 'sale.items.product'])
            ->where('tracking_number', $trackingNumber)
            ->first();

        if (!$shipment) {
            return response()->json(['message' => 'Tracking number not found in logistics network.'], 404);
        }

        return response()->json([
            'success' => true,
            'tracking_number' => $shipment->tracking_number,
            'provider' => $shipment->logistics_provider,
            'logistics_provider' => $shipment->logistics_provider,
            'carrier' => $shipment->logistics_provider,
            'status' => $shipment->status,
            'order_reference' => $shipment->sale?->transaction_no,
            'recipient' => $shipment->recipient_name,
            'recipient_name' => $shipment->recipient_name,
            'destination' => $shipment->shipping_address,
            'estimated_delivery' => $shipment->estimated_delivery_at?->toDateTimeString(),
            'delivered_at' => $shipment->delivered_at?->toDateTimeString(),
            'notes' => $shipment->notes,
            'shipment' => [
                'tracking_number' => $shipment->tracking_number,
                'status' => $shipment->status,
                'carrier' => $shipment->logistics_provider,
                'recipient_name' => $shipment->recipient_name,
            ],
            'history' => [
                ['status' => 'Order Confirmed', 'timestamp' => $shipment->created_at?->toDateTimeString()],
                ['status' => 'Dispatched to Logistics Hub', 'timestamp' => $shipment->created_at?->addHours(2)->toDateTimeString()],
                ['status' => str_replace('_', ' ', strtoupper($shipment->status)), 'timestamp' => $shipment->updated_at?->toDateTimeString()],
            ],
        ]);
    }
}
