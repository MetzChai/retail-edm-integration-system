<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Payment record. NEVER stores card numbers / CVV / PAN - reference_no
 * only holds an external reference such as an e-wallet or bank ref.
 */
class PaymentRecord extends Model
{
    protected $fillable = [
        'sale_id',
        'payment_method',
        'amount',
        'reference_no',
        'status',
        'notes',
        'user_id',
        'paid_at',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'paid_at' => 'datetime',
        ];
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
