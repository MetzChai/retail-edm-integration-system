<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Permission-based access control. Usage: ->middleware('permission:products.manage')
 */
class EnsurePermission
{
    public function handle(Request $request, Closure $next, string ...$permissions): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        if ($user->isPending()) {
            return response()->json(['message' => 'Your account is awaiting Admin approval.'], 403);
        }

        if ($user->isRejected()) {
            return response()->json(['message' => 'Your registration request has been rejected. Please contact the Administrator.'], 403);
        }

        if (!$user->is_active || $user->isInactive()) {
            return response()->json(['message' => 'Your account has been deactivated. Please contact the Administrator.'], 403);
        }

        foreach ($permissions as $permission) {
            if ($user->hasPermission($permission)) {
                return $next($request);
            }
        }

        return response()->json([
            'message' => 'Forbidden. Insufficient permission.',
            'required_permissions' => $permissions,
        ], 403);
    }
}
