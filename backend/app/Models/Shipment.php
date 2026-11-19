<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Shipment extends Model
{
    public const STATUS_PENDING = 'pending';
    public const STATUS_READY = 'ready_for_shipment';
    public const STATUS_READY_FOR_SHIPMENT = 'ready_for_shipment';
    public const STATUS_SHIPPED = 'shipped';
    public const STATUS_IN_TRANSIT = 'in_transit';
    public const STATUS_OUT_FOR_DELIVERY = 'out_for_delivery';
    public const STATUS_DELIVERED = 'delivered';
    public const STATUS_FAILED = 'failed_delivery';
    public const STATUS_RETURNED = 'returned';

    protected $fillable = [
        'sale_id',
        'tracking_number',
        'logistics_provider',
        'status',
        'recipient_name',
        'recipient_phone',
        'shipping_address',
        'estimated_delivery_at',
        'delivered_at',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'estimated_delivery_at' => 'datetime',
            'delivered_at' => 'datetime',
        ];
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        if (!$term) {
            return $query;
        }

        return $query->where(function (Builder $q) use ($term) {
            $q->where('tracking_number', 'like', "%{$term}%")
                ->orWhere('logistics_provider', 'like', "%{$term}%")
                ->orWhere('recipient_name', 'like', "%{$term}%")
                ->orWhere('recipient_phone', 'like', "%{$term}%")
                ->orWhereHas('sale', fn ($s) => $s->where('transaction_no', 'like', "%{$term}%"));
        });
    }

    /**
     * Generate unique carrier tracking number.
     */
    public static function generateTrackingNumber(string $provider = 'LBC'): string
    {
        $prefix = match (strtoupper($provider)) {
            'J&T EXPRESS', 'J&T' => 'JT',
            'NINJA VAN', 'NINJA' => 'NV',
            'DHL' => 'DHL',
            '2GO' => '2GO',
            default => 'LBC',
        };

        $date = now()->format('ymd');
        $rand = strtoupper(substr(md5(uniqid((string) mt_rand(), true)), 0, 6));

        return "{$prefix}-{$date}-{$rand}";
    }
}
