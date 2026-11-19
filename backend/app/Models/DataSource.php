<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DataSource extends Model
{
    protected $fillable = [
        'name',
        'type',
        'status',
        'endpoint',
        'last_sync_at',
        'last_sync_records',
        'description',
    ];

    protected function casts(): array
    {
        return [
            'last_sync_at' => 'datetime',
            'last_sync_records' => 'integer',
        ];
    }

    public function logs(): HasMany
    {
        return $this->hasMany(IntegrationLog::class);
    }
}
