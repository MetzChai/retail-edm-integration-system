<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CdcEvent extends Model
{
    protected $fillable = [
        'entity',
        'entity_id',
        'operation',
        'before_payload',
        'after_payload',
        'captured_at',
        'synced_at',
    ];

    protected function casts(): array
    {
        return [
            'before_payload' => 'array',
            'after_payload' => 'array',
            'captured_at' => 'datetime',
            'synced_at' => 'datetime',
        ];
    }

    /**
     * Helper to log a CDC change event.
     */
    public static function capture(string $entity, ?int $entityId, string $operation, ?array $before = null, ?array $after = null): self
    {
        return self::create([
            'entity' => $entity,
            'entity_id' => $entityId,
            'operation' => strtoupper($operation),
            'before_payload' => $before,
            'after_payload' => $after,
            'captured_at' => now(),
        ]);
    }
}
