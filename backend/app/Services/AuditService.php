<?php

namespace App\Services;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Request;

/**
 * Central audit trail helper. Records who did what, to which entity,
 * with context details and the originating IP address.
 */
class AuditService
{
    public function log(string $action, string $entity, ?int $entityId = null, array $details = [], ?string $ip = null): ?AuditLog
    {
        try {
            $user = Auth::user();

            return AuditLog::create([
                'user_id' => $user?->id,
                'user_name' => $user?->name ?? 'system',
                'action' => $action,
                'entity' => $entity,
                'entity_id' => $entityId,
                'details' => $details,
                'ip_address' => $ip ?? Request::ip(),
            ]);
        } catch (\Throwable $e) {
            Log::error('Audit logging failed: '.$e->getMessage());

            return null;
        }
    }

    public function model(string $action, Model $model, array $extra = []): ?AuditLog
    {
        $details = array_merge($extra, [
            'attributes' => $model->getAttributes(),
        ]);

        return $this->log($action, class_basename($model), $model->getKey(), $details);
    }

    public function login(object $user): ?AuditLog
    {
        return $this->log('login', 'User', $user->id, ['email' => $user->email]);
    }

    public function logout(object $user): ?AuditLog
    {
        return $this->log('logout', 'User', $user->id, ['email' => $user->email]);
    }

    public function permissionChange(object $user, string $details): ?AuditLog
    {
        return $this->log('permission_change', 'User', $user->id, ['detail' => $details]);
    }
}
