<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class IntegrationLog extends Model
{
    protected $fillable = [
        'data_source_id',
        'source',
        'operation',
        'status',
        'records_processed',
        'records_failed',
        'errors',
        'started_at',
        'finished_at',
        'user_id',
    ];

    protected function casts(): array
    {
        return [
            'records_processed' => 'integer',
            'records_failed' => 'integer',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
        ];
    }

    public function dataSource(): BelongsTo
    {
        return $this->belongsTo(DataSource::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
