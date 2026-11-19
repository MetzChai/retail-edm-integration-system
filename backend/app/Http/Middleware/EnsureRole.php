<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Role-based access control. Usage: ->middleware('role:admin,manager')
 */
class EnsureRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
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

        if (!$user->hasRole($roles)) {
            return response()->json([
                'message' => 'Forbidden. Insufficient role.',
                'required_roles' => $roles,
                'your_role' => $user->roleName(),
            ], 403);
        }

        return $next($request);
    }
}
