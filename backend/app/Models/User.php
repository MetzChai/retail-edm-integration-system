<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    public const STATUS_PENDING = 'pending';
    public const STATUS_ACTIVE = 'active';
    public const STATUS_INACTIVE = 'inactive';
    public const STATUS_REJECTED = 'rejected';

    protected $fillable = [
        'name',
        'email',
        'password',
        'role_id',
        'requested_role',
        'is_active',
        'status',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            'status' => 'string',
        ];
    }

    /**
     * Keep `is_active` (legacy boolean used by the RBAC middleware) in sync
     * with the approval-workflow `status` column in both directions.
     */
    protected static function booted(): void
    {
        static::saving(function (User $user): void {
            if ($user->status !== null && $user->isDirty('status')) {
                $user->is_active = $user->status === self::STATUS_ACTIVE;
            } elseif ($user->status === null) {
                // No status supplied: derive from is_active (DB default is true).
                $user->status = $user->is_active === false
                    ? self::STATUS_INACTIVE
                    : self::STATUS_ACTIVE;
            } elseif ($user->isDirty('is_active')) {
                $user->status = $user->is_active ? self::STATUS_ACTIVE : self::STATUS_INACTIVE;
            }
        });
    }

    public function isPending(): bool
    {
        return $this->status === self::STATUS_PENDING;
    }

    public function isRejected(): bool
    {
        return $this->status === self::STATUS_REJECTED;
    }

    public function isActive(): bool
    {
        return $this->status === self::STATUS_ACTIVE && $this->is_active;
    }

    public function isInactive(): bool
    {
        return $this->status === self::STATUS_INACTIVE || (!$this->is_active && $this->status !== self::STATUS_PENDING && $this->status !== self::STATUS_REJECTED);
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'role_user');
    }

    /**
     * Effective role name: legacy single role_id or pivot roles.
     */
    public function roleName(): ?string
    {
        if ($this->role) {
            return $this->role->name;
        }

        return $this->roles->first()?->name;
    }

    public function hasRole(string|array $roles): bool
    {
        $roles = (array) $roles;

        return in_array($this->roleName(), $roles, true)
            || $this->roles->pluck('name')->intersect($roles)->isNotEmpty();
    }

    public function hasPermission(string $permission): bool
    {
        if ($this->role && $this->role->hasPermission($permission)) {
            return true;
        }

        return $this->roles->contains(function (Role $role) use ($permission) {
            return $role->hasPermission($permission);
        });
    }

    public function permissions(): array
    {
        $names = $this->role ? $this->role->permissions->pluck('name')->all() : [];

        foreach ($this->roles as $role) {
            $names = array_merge($names, $role->permissions->pluck('name')->all());
        }

        return array_values(array_unique($names));
    }
}
