<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DataQualityLog extends Model
{
    protected $fillable = [
        'entity',
        'dimension',
        'score',
        'records_checked',
        'records_failed',
        'details',
        'checked_at',
    ];

    protected function casts(): array
    {
        return [
            'score' => 'decimal:2',
            'records_checked' => 'integer',
            'records_failed' => 'integer',
            'details' => 'array',
            'checked_at' => 'datetime',
        ];
    }
}
