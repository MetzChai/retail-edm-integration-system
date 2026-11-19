<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(private AuditService $audit)
    {
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::with(['role', 'roles.permissions', 'role.permissions'])
            ->where('email', $data['email'])
            ->first();

        if (!$user || !Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        // Approval workflow: pending accounts may not obtain a token.
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

        $user->tokens()->where('name', 'api')->delete();
        $token = $user->createToken('api')->plainTextToken;

        $this->audit->login($user);

        return response()->json([
            'token' => $token,
            'token_type' => 'Bearer',
            'user' => $this->payload($user),
        ]);
    }

    /**
     * Public self-registration. Allows users to request Staff, Manager, or Admin accounts.
     * Newly registered accounts have a `pending` status and cannot log in until an
     * administrator approves the request.
     *
     * No privileges (Staff, Manager, or Admin) are automatically granted upon registration.
     */
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
            'role' => ['nullable', 'string'],
        ]);

        // Validate allowed requested roles; any unrecognized role defaults to staff.
        $rawRole = strtolower(trim((string) ($request->input('role') ?? 'staff')));
        $requestedRole = in_array($rawRole, ['admin', 'manager', 'staff'], true) ? $rawRole : 'staff';

        $roleId = Role::where('name', $requestedRole)->value('id')
            ?? Role::where('name', 'staff')->value('id');

        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => $data['password'],
            'role_id' => $roleId,
            'requested_role' => $requestedRole,
            'status' => User::STATUS_PENDING,
            'is_active' => false,
        ]);

        $this->audit->log('register', 'User', $user->id, [
            'email' => $user->email,
            'role' => $requestedRole,
            'requested_role' => $requestedRole,
            'status' => User::STATUS_PENDING,
        ]);

        return response()->json([
            'message' => 'Your account is awaiting Admin approval.',
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => $requestedRole,
                'requested_role' => $requestedRole,
                'status' => User::STATUS_PENDING,
            ],
        ], 201);
    }

    public function user(Request $request): JsonResponse
    {
        return response()->json(['user' => $this->payload($request->user())]);
    }

    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->audit->logout($user);
        $user->currentAccessToken()->delete();

        return response()->json(['message' => 'Logged out.']);
    }

    private function payload(?User $user): array
    {
        if (!$user) {
            return [];
        }

        $user->loadMissing(['role', 'role.permissions', 'roles.permissions']);

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->roleName(),
            'requested_role' => $user->requested_role,
            'status' => $user->status,
            'is_active' => $user->is_active,
            'permissions' => $user->permissions(),
        ];
    }
}
