<?php

namespace App\Services;

use App\Models\CdcEvent;
use Illuminate\Pagination\LengthAwarePaginator;

class CdcService
{
    /**
     * Capture a data mutation event.
     */
    public function record(string $entity, ?int $entityId, string $operation, ?array $before = null, ?array $after = null): CdcEvent
    {
        return CdcEvent::capture($entity, $entityId, $operation, $before, $after);
    }

    /**
     * Retrieve recent CDC event stream.
     */
    public function getStream(int $limit = 50, ?string $entity = null): array
    {
        $query = CdcEvent::latest('id');

        if ($entity) {
            $query->where('entity', $entity);
        }

        $events = $query->limit($limit)->get();

        $stats = [
            'total_events' => CdcEvent::count(),
            'by_operation' => [
                'INSERT' => CdcEvent::where('operation', 'INSERT')->count(),
                'UPDATE' => CdcEvent::where('operation', 'UPDATE')->count(),
                'DELETE' => CdcEvent::where('operation', 'DELETE')->count(),
            ],
            'by_entity' => [
                'inventory' => CdcEvent::where('entity', 'inventory')->count(),
                'sale' => CdcEvent::where('entity', 'sale')->count(),
                'shipment' => CdcEvent::where('entity', 'shipment')->count(),
                'customer' => CdcEvent::where('entity', 'customer')->count(),
                'product' => CdcEvent::where('entity', 'product')->count(),
            ],
            'last_captured_at' => CdcEvent::max('captured_at'),
        ];

        return [
            'success' => true,
            'count' => $events->count(),
            'data' => $events,
            'stats' => $stats,
            'events' => $events,
        ];
    }
}
