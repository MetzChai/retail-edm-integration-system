<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Role;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class GovernanceController extends Controller
{
    public function __construct(private AuditService $audit)
    {
    }

    public function users(Request $request): JsonResponse
    {
        $users = User::with('role')
            ->when($request->query('search'), function ($q, $s) {
                $q->where(fn ($w) => $w->where('name', 'like', "%{$s}%")->orWhere('email', 'like', "%{$s}%"));
            })
            ->when($request->query('role'), fn ($q, $r) => $q->whereHas('role', fn ($q2) => $q2->where('name', $r)))
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->latest('id')
            ->paginate($request->integer('per_page', 15));

        return response()->json($users);
    }

    /**
     * Pending registration requests awaiting administrator approval.
     */
    public function pendingUsers(Request $request): JsonResponse
    {
        $users = User::with('role')
            ->where('status', User::STATUS_PENDING)
            ->when($request->query('search'), function ($q, $s) {
                $q->where(fn ($w) => $w->where('name', 'like', "%{$s}%")->orWhere('email', 'like', "%{$s}%"));
            })
            ->latest('id')
            ->paginate($request->integer('per_page', 15));

        return response()->json($users);
    }

    /**
     * Approve a pending registration: activate it and assign Staff or Manager role.
     */
    public function approve(Request $request, User $user): JsonResponse
    {
        if ($user->status === User::STATUS_ACTIVE) {
            return response()->json([
                'message' => 'Account is already active.',
                'user' => $user->fresh('role'),
            ], 200);
        }

        if ($user->status !== User::STATUS_PENDING) {
            return response()->json([
                'message' => 'Only pending registrations can be approved.',
                'user' => $user->fresh('role'),
            ], 422);
        }

        $assignedRole = null;
        if ($request->has('role')) {
            $request->validate([
                'role' => ['required', 'string', 'in:admin,staff,manager'],
            ]);
            $assignedRole = strtolower($request->input('role'));
        } else {
            $assignedRole = in_array($user->requested_role, ['admin', 'staff', 'manager'], true)
                ? $user->requested_role
                : ($user->role?->name ?? 'staff');
        }

        $roleId = Role::where('name', $assignedRole)->value('id');
        if ($roleId) {
            $user->role_id = $roleId;
        }

        $user->status = User::STATUS_ACTIVE;
        $user->is_active = true;
        $user->save();

        $this->audit->log('approve', 'User', $user->id, [
            'email' => $user->email,
            'role' => $user->role?->name,
            'status' => User::STATUS_ACTIVE,
        ]);

        return response()->json([
            'message' => 'Account approved. The user can now sign in.',
            'user' => $user->fresh('role'),
        ]);
    }

    /**
     * Reject a pending registration (marks it rejected + revokes any tokens).
     */
    public function reject(Request $request, User $user): JsonResponse
    {
        if ($user->status === User::STATUS_REJECTED) {
            return response()->json([
                'message' => 'Account already rejected.',
                'user' => $user->fresh('role'),
            ], 200);
        }

        if ($user->status !== User::STATUS_PENDING) {
            return response()->json([
                'message' => 'Only pending registrations can be rejected.',
                'user' => $user->fresh('role'),
            ], 422);
        }

        $user->status = User::STATUS_REJECTED;
        $user->is_active = false;
        $user->save();
        $user->tokens()->delete();

        $this->audit->log('reject', 'User', $user->id, [
            'email' => $user->email,
            'status' => User::STATUS_REJECTED,
        ]);

        return response()->json([
            'message' => 'Registration rejected.',
            'user' => $user->fresh('role'),
        ]);
    }

    public function activate(Request $request, User $user): JsonResponse
    {
        if ($user->status === User::STATUS_PENDING) {
            return response()->json([
                'message' => 'Pending registrations must be approved or rejected.',
                'user' => $user->fresh('role'),
            ], 422);
        }

        $user->status = User::STATUS_ACTIVE;
        $user->is_active = true;
        $user->save();

        $this->audit->log('activate', 'User', $user->id, ['email' => $user->email]);

        return response()->json([
            'message' => 'Account activated.',
            'user' => $user->fresh('role'),
        ]);
    }

    public function deactivate(Request $request, User $user): JsonResponse
    {
        if ($user->id === $request->user()->id) {
            return response()->json(['message' => 'You cannot deactivate your own account.'], 422);
        }

        if ($user->hasRole('admin')) {
            return response()->json(['message' => 'Administrator accounts cannot be deactivated.'], 422);
        }

        $user->status = User::STATUS_INACTIVE;
        $user->is_active = false;
        $user->save();
        $user->tokens()->delete();

        $this->audit->log('deactivate', 'User', $user->id, ['email' => $user->email]);

        return response()->json([
            'message' => 'Account deactivated.',
            'user' => $user->fresh('role'),
        ]);
    }

    /**
     * Change an approved user's role between Staff, Manager, and Administrator.
     * Enforces the new permissions immediately.
     */
    public function changeRole(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'role' => ['required', 'string', 'in:admin,staff,manager'],
        ]);

        if ($user->id === $request->user()->id && $data['role'] !== 'admin') {
            return response()->json(['message' => 'You cannot remove your own administrator privileges.'], 422);
        }

        if ($user->email === 'admin@retail.test' && $data['role'] !== 'admin') {
            return response()->json(['message' => 'Primary Administrator account cannot be demoted.'], 422);
        }

        $targetRole = Role::where('name', $data['role'])->firstOrFail();
        $previousRole = $user->role?->name;

        $user->role_id = $targetRole->id;
        $user->requested_role = $data['role'];
        $user->save();

        $this->audit->permissionChange($user, "Role changed from {$previousRole} to {$targetRole->name}");

        return response()->json([
            'message' => "User role updated to {$targetRole->label}.",
            'user' => $user->fresh(['role', 'role.permissions']),
        ]);
    }

    public function toggleActive(Request $request, User $user): JsonResponse
    {
        if ($user->status === User::STATUS_PENDING) {
            return response()->json([
                'message' => 'Pending registrations must be approved or rejected.',
                'user' => $user->fresh('role'),
            ], 422);
        }

        if ($user->isActive()) {
            return $this->deactivate($request, $user);
        }

        return $this->activate($request, $user);
    }


    public function storeUser(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'unique:users,email'],
            'password' => ['required', 'string', 'min:6'],
            'role' => ['required', 'exists:roles,name'],
            'is_active' => ['boolean'],
        ]);

        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => $data['password'],
            'role_id' => Role::where('name', $data['role'])->value('id'),
            'requested_role' => $data['role'],
            'status' => ($data['is_active'] ?? true) ? User::STATUS_ACTIVE : User::STATUS_INACTIVE,
            'is_active' => $data['is_active'] ?? true,
        ]);

        $this->audit->log('create', 'User', $user->id, ['email' => $user->email, 'role' => $data['role']]);

        return response()->json(['message' => 'User created.', 'user' => $user->load('role')], 201);
    }

    public function updateUser(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'email' => ['sometimes', 'email', 'unique:users,email,'.$user->id],
            'password' => ['sometimes', 'string', 'min:6'],
            'role' => ['sometimes', 'exists:roles,name'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        $before = ['role' => $user->role?->name, 'is_active' => $user->is_active, 'email' => $user->email];

        if (isset($data['role'])) {
            if ($user->hasRole('admin') && $data['role'] !== 'admin') {
                return response()->json(['message' => 'Administrator accounts cannot be modified.'], 422);
            }
            $user->role_id = Role::where('name', $data['role'])->value('id');
            unset($data['role']);
        }

        $user->fill($data);
        $user->save();

        $this->audit->permissionChange($user, 'User updated: '.json_encode(array_merge($before, [
            'new_role' => $user->role?->name,
            'new_is_active' => $user->is_active,
        ])));

        return response()->json(['message' => 'User updated.', 'user' => $user->fresh('role')]);
    }

    public function destroyUser(User $user): JsonResponse
    {
        if ($user->id === request()->user()->id) {
            return response()->json(['message' => 'You cannot delete your own account.'], 422);
        }

        $this->audit->log('delete', 'User', $user->id, ['email' => $user->email]);
        $user->delete();

        return response()->json(['message' => 'User deleted.']);
    }

    public function roles(): JsonResponse
    {
        $roles = Role::with('permissions')->withCount('users')->get();

        return response()->json(['roles' => $roles]);
    }

    public function permissions(): JsonResponse
    {
        $permissions = \App\Models\Permission::all();

        return response()->json(['permissions' => $permissions]);
    }

    /**
     * Update permissions for a role in MySQL.
     * Enforces permissions immediately without requiring user re-creation.
     */
    public function updateRolePermissions(Request $request, Role $role): JsonResponse
    {
        $data = $request->validate([
            'permissions' => ['required', 'array'],
            'permissions.*' => ['string'],
        ]);

        // Find permission IDs by name or by integer id
        $permissionIds = \App\Models\Permission::whereIn('name', $data['permissions'])
            ->orWhereIn('id', array_filter($data['permissions'], 'is_numeric'))
            ->pluck('id')
            ->toArray();

        // Safety: Admin role must always retain governance.manage
        if ($role->name === 'admin') {
            $govPermId = \App\Models\Permission::where('name', 'governance.manage')->value('id');
            if ($govPermId && !in_array($govPermId, $permissionIds)) {
                $permissionIds[] = $govPermId;
            }
        }

        $role->permissions()->sync($permissionIds);

        $this->audit->log('update_role_permissions', 'Role', $role->id, [
            'role' => $role->name,
            'permission_count' => count($permissionIds),
            'permissions' => $role->fresh('permissions')->permissions->pluck('name')->all(),
        ]);

        \App\Models\Notification::createNotification(
            'Role Permissions Updated',
            "Permissions for role '{$role->label}' have been modified by " . ($request->user()?->name ?? 'Admin') . '.',
            'info',
            'governance',
            null,
            '/governance'
        );

        return response()->json([
            'message' => "Permissions for role {$role->label} updated successfully.",
            'role' => $role->fresh('permissions'),
        ]);
    }

    public function activity(Request $request): JsonResponse
    {
        $logs = AuditLog::query()
            ->when($request->query('user_id'), fn ($q, $id) => $q->where('user_id', $id))
            ->when($request->query('action'), fn ($q, $a) => $q->where('action', $a))
            ->when($request->query('entity'), fn ($q, $e) => $q->where('entity', $e))
            ->when($request->query('search'), fn ($q, $s) => $q->where(function ($w) use ($s) {
                $w->where('user_name', 'like', "%{$s}%")
                    ->orWhere('entity', 'like', "%{$s}%")
                    ->orWhere('action', 'like', "%{$s}%");
            }))
            ->latest('id')
            ->paginate($request->integer('per_page', 25));

        return response()->json($logs);
    }
}
