<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Applied right after `auth:sanctum` to every protected API route.
 *
 * Guarantees that pending / deactivated / rejected accounts can never use an
 * already-issued token to reach protected modules, and that the response
 * carries the same message the login endpoint uses.
 */
class EnsureAccountActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user instanceof User) {
            if ($user->isPending()) {
                return response()->json([
                    'message' => 'Your account is awaiting Admin approval.',
                ], 403);
            }

            if ($user->isRejected()) {
                return response()->json([
                    'message' => 'Your registration request has been rejected. Please contact the Administrator.',
                ], 403);
            }

            if ($user->isInactive() || !$user->is_active) {
                return response()->json([
                    'message' => 'Your account has been deactivated. Please contact the Administrator.',
                ], 403);
            }
        }

        return $next($request);
    }
}
