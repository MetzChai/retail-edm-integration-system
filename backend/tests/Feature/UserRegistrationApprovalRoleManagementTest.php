<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class UserRegistrationApprovalRoleManagementTest extends TestCase
{
    use DatabaseTransactions;

    /**
     * Scenario 1: Register as Staff -> account becomes pending -> login is blocked.
     */
    public function test_register_as_staff_creates_pending_account_and_blocks_login(): void
    {
        $response = $this->postJson('/api/register', [
            'name' => 'Alice Staff',
            'email' => 'alice.staff@test.example',
            'password' => 'secret1234',
            'password_confirmation' => 'secret1234',
            'role' => 'staff',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('user.role', 'staff')
            ->assertJsonPath('user.status', 'pending');

        $user = User::where('email', 'alice.staff@test.example')->first();
        $this->assertNotNull($user);
        $this->assertEquals('pending', $user->status);
        $this->assertFalse((bool) $user->is_active);
        $this->assertEquals('staff', $user->roleName());

        // Login attempt must be blocked
        $loginRes = $this->postJson('/api/login', [
            'email' => 'alice.staff@test.example',
            'password' => 'secret1234',
        ]);

        $loginRes->assertStatus(403)
            ->assertJson(['message' => 'Your account is awaiting Admin approval.']);
    }

    /**
     * Scenario 2: Register as Manager -> account becomes pending -> login is blocked.
     */
    public function test_register_as_manager_creates_pending_account_and_blocks_login(): void
    {
        $response = $this->postJson('/api/register', [
            'name' => 'Bob Manager',
            'email' => 'bob.manager@test.example',
            'password' => 'secret1234',
            'password_confirmation' => 'secret1234',
            'role' => 'manager',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('user.role', 'manager')
            ->assertJsonPath('user.status', 'pending');

        $user = User::where('email', 'bob.manager@test.example')->first();
        $this->assertNotNull($user);
        $this->assertEquals('pending', $user->status);
        $this->assertFalse((bool) $user->is_active);
        $this->assertEquals('manager', $user->roleName());

        // Login attempt must be blocked
        $loginRes = $this->postJson('/api/login', [
            'email' => 'bob.manager@test.example',
            'password' => 'secret1234',
        ]);

        $loginRes->assertStatus(403)
            ->assertJson(['message' => 'Your account is awaiting Admin approval.']);
    }

    /**
     * Register as Admin -> account becomes pending -> login is blocked until approved.
     */
    public function test_register_as_admin_creates_pending_account_and_blocks_login(): void
    {
        $response = $this->postJson('/api/register', [
            'name' => 'Carol Admin Applicant',
            'email' => 'carol.admin@test.example',
            'password' => 'secret1234',
            'password_confirmation' => 'secret1234',
            'role' => 'admin',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('user.role', 'admin')
            ->assertJsonPath('user.status', 'pending');

        $user = User::where('email', 'carol.admin@test.example')->first();
        $this->assertNotNull($user);
        $this->assertEquals('pending', $user->status);
        $this->assertFalse((bool) $user->is_active);
        $this->assertEquals('admin', $user->roleName());

        // Login attempt must be blocked
        $loginRes = $this->postJson('/api/login', [
            'email' => 'carol.admin@test.example',
            'password' => 'secret1234',
        ]);

        $loginRes->assertStatus(403)
            ->assertJson(['message' => 'Your account is awaiting Admin approval.']);
    }

    /**
     * Unauthorized role during registration (e.g. hacker, superuser) must be ignored and defaulted to staff.
     */
    public function test_registration_ignores_unauthorized_role_input(): void
    {
        $response = $this->postJson('/api/register', [
            'name' => 'Sneaky Root Attempt',
            'email' => 'sneaky.root@test.example',
            'password' => 'secret1234',
            'password_confirmation' => 'secret1234',
            'role' => 'superadmin_hacker',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('user.role', 'staff')
            ->assertJsonPath('user.status', 'pending');

        $user = User::where('email', 'sneaky.root@test.example')->first();
        $this->assertNotNull($user);
        $this->assertEquals('staff', $user->roleName());
        $this->assertEquals('pending', $user->status);
        $this->assertFalse((bool) $user->is_active);
    }

    /**
     * Scenario 3: Admin approves a Staff request -> Staff can log in.
     */
    public function test_admin_approves_staff_request_allowing_login(): void
    {
        $staffUser = User::create([
            'name' => 'Pending Staffer',
            'email' => 'pending.staffer@test.example',
            'password' => 'secret1234',
            'role_id' => Role::where('name', 'staff')->value('id'),
            'requested_role' => 'staff',
            'status' => 'pending',
            'is_active' => false,
        ]);

        $admin = User::where('email', 'admin@retail.test')->first();

        $approveRes = $this->actingAs($admin)
            ->postJson("/api/users/{$staffUser->id}/approve", ['role' => 'staff']);

        $approveRes->assertStatus(200)
            ->assertJsonPath('user.status', 'active');

        $staffUser->refresh();
        $this->assertEquals('active', $staffUser->status);
        $this->assertTrue((bool) $staffUser->is_active);
        $this->assertEquals('staff', $staffUser->roleName());

        // Now staff can log in
        $loginRes = $this->postJson('/api/login', [
            'email' => 'pending.staffer@test.example',
            'password' => 'secret1234',
        ]);

        $loginRes->assertStatus(200)
            ->assertJsonStructure(['token', 'user'])
            ->assertJsonPath('user.role', 'staff')
            ->assertJsonPath('user.status', 'active');
    }

    /**
     * Scenario 4: Admin approves a Manager request -> Manager can log in.
     */
    public function test_admin_approves_manager_request_allowing_login(): void
    {
        $managerUser = User::create([
            'name' => 'Pending Boss',
            'email' => 'pending.boss@test.example',
            'password' => 'secret1234',
            'role_id' => Role::where('name', 'manager')->value('id'),
            'requested_role' => 'manager',
            'status' => 'pending',
            'is_active' => false,
        ]);

        $admin = User::where('email', 'admin@retail.test')->first();

        $approveRes = $this->actingAs($admin)
            ->postJson("/api/users/{$managerUser->id}/approve", ['role' => 'manager']);

        $approveRes->assertStatus(200)
            ->assertJsonPath('user.status', 'active');

        $managerUser->refresh();
        $this->assertEquals('active', $managerUser->status);
        $this->assertTrue((bool) $managerUser->is_active);
        $this->assertEquals('manager', $managerUser->roleName());

        // Now manager can log in
        $loginRes = $this->postJson('/api/login', [
            'email' => 'pending.boss@test.example',
            'password' => 'secret1234',
        ]);

        $loginRes->assertStatus(200)
            ->assertJsonStructure(['token', 'user'])
            ->assertJsonPath('user.role', 'manager')
            ->assertJsonPath('user.status', 'active');
    }

    /**
     * Admin approves an Admin request -> Admin can log in with full privileges.
     */
    public function test_admin_approves_admin_request_allowing_login(): void
    {
        $adminCandidate = User::create([
            'name' => 'Pending Co-Admin',
            'email' => 'pending.coadmin@test.example',
            'password' => 'secret1234',
            'role_id' => Role::where('name', 'admin')->value('id'),
            'requested_role' => 'admin',
            'status' => 'pending',
            'is_active' => false,
        ]);

        $admin = User::where('email', 'admin@retail.test')->first();

        $approveRes = $this->actingAs($admin)
            ->postJson("/api/users/{$adminCandidate->id}/approve", ['role' => 'admin']);

        $approveRes->assertStatus(200)
            ->assertJsonPath('user.status', 'active')
            ->assertJsonPath('user.role.name', 'admin');

        $adminCandidate->refresh();
        $this->assertEquals('active', $adminCandidate->status);
        $this->assertTrue((bool) $adminCandidate->is_active);
        $this->assertEquals('admin', $adminCandidate->roleName());

        // Log in as new admin
        $loginRes = $this->postJson('/api/login', [
            'email' => 'pending.coadmin@test.example',
            'password' => 'secret1234',
        ]);

        $loginRes->assertStatus(200)
            ->assertJsonPath('user.role', 'admin')
            ->assertJsonPath('user.status', 'active');
    }

    /**
     * Scenario 5: Admin changes a Staff account to Manager or Admin -> permissions update immediately.
     */
    public function test_admin_changes_staff_to_manager_and_enforces_permissions(): void
    {
        $user = User::create([
            'name' => 'Promoted Employee',
            'email' => 'promoted.employee@test.example',
            'password' => 'secret1234',
            'role_id' => Role::where('name', 'staff')->value('id'),
            'requested_role' => 'staff',
            'status' => 'active',
            'is_active' => true,
        ]);

        $this->assertEquals('staff', $user->roleName());
        $this->assertFalse($user->hasPermission('products.manage'));

        $admin = User::where('email', 'admin@retail.test')->first();

        // Promote to Manager
        $changeRes = $this->actingAs($admin)
            ->postJson("/api/users/{$user->id}/role", ['role' => 'manager']);

        $changeRes->assertStatus(200);

        $user->refresh();
        $this->assertEquals('manager', $user->roleName());
        $this->assertTrue($user->hasPermission('products.manage'));
        $this->assertTrue($user->hasPermission('inventory.manage'));

        // Promote further to Admin
        $changeToAdminRes = $this->actingAs($admin)
            ->postJson("/api/users/{$user->id}/role", ['role' => 'admin']);

        $changeToAdminRes->assertStatus(200);

        $user->refresh();
        $this->assertEquals('admin', $user->roleName());
        $this->assertTrue($user->hasPermission('governance.manage'));
    }

    /**
     * Scenario 6: Admin rejects a pending request -> login remains blocked.
     */
    public function test_admin_rejects_pending_request_and_login_remains_blocked(): void
    {
        $user = User::create([
            'name' => 'Rejected Candidate',
            'email' => 'rejected.candidate@test.example',
            'password' => 'secret1234',
            'role_id' => Role::where('name', 'staff')->value('id'),
            'requested_role' => 'staff',
            'status' => 'pending',
            'is_active' => false,
        ]);

        $admin = User::where('email', 'admin@retail.test')->first();

        $rejectRes = $this->actingAs($admin)
            ->postJson("/api/users/{$user->id}/reject");

        $rejectRes->assertStatus(200)
            ->assertJsonPath('user.status', 'rejected');

        $user->refresh();
        $this->assertEquals('rejected', $user->status);
        $this->assertFalse((bool) $user->is_active);

        // Login attempt must return rejected message
        $loginRes = $this->postJson('/api/login', [
            'email' => 'rejected.candidate@test.example',
            'password' => 'secret1234',
        ]);

        $loginRes->assertStatus(403)
            ->assertJson(['message' => 'Your registration request has been rejected. Please contact the Administrator.']);
    }

    /**
     * Scenario 7: Admin deactivates an active account -> login and protected access are blocked.
     */
    public function test_admin_deactivates_account_blocking_login_and_api(): void
    {
        $user = User::create([
            'name' => 'Active Staffer',
            'email' => 'active.staffer@test.example',
            'password' => 'secret1234',
            'role_id' => Role::where('name', 'staff')->value('id'),
            'status' => 'active',
            'is_active' => true,
        ]);

        $token = $user->createToken('api')->plainTextToken;

        $admin = User::where('email', 'admin@retail.test')->first();

        $deactRes = $this->actingAs($admin)
            ->postJson("/api/users/{$user->id}/deactivate");

        $deactRes->assertStatus(200)
            ->assertJsonPath('user.status', 'inactive');

        $user->refresh();
        $this->assertEquals('inactive', $user->status);
        $this->assertFalse((bool) $user->is_active);

        // Login is blocked
        $loginRes = $this->postJson('/api/login', [
            'email' => 'active.staffer@test.example',
            'password' => 'secret1234',
        ]);

        $loginRes->assertStatus(403)
            ->assertJson(['message' => 'Your account has been deactivated. Please contact the Administrator.']);

        // Clear actingAs admin state so subsequent call uses Bearer token
        app('auth')->forgetGuards();

        // Protected API access with token is blocked
        $apiRes = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/user');

        // Sanctum rejects because token was revoked (401) or EnsureAccountActive returns 403
        $this->assertTrue(in_array($apiRes->status(), [401, 403]));
    }

    /**
     * Scenario 8: Staff and Manager cannot access Admin-only user management endpoints.
     */
    public function test_staff_and_manager_cannot_access_user_management(): void
    {
        $staff = User::where('email', 'staff@retail.test')->first();
        $manager = User::where('email', 'manager@retail.test')->first();

        // Staff attempts
        $this->actingAs($staff)->getJson('/api/users')->assertStatus(403);
        $this->actingAs($staff)->getJson('/api/users/pending')->assertStatus(403);
        $this->actingAs($staff)->postJson('/api/users/1/approve')->assertStatus(403);
        $this->actingAs($staff)->postJson('/api/users/1/role', ['role' => 'manager'])->assertStatus(403);

        // Manager attempts
        $this->actingAs($manager)->getJson('/api/users')->assertStatus(403);
        $this->actingAs($manager)->getJson('/api/users/pending')->assertStatus(403);
        $this->actingAs($manager)->postJson('/api/users/1/approve')->assertStatus(403);
        $this->actingAs($manager)->postJson('/api/users/1/role', ['role' => 'staff'])->assertStatus(403);
    }

    /**
     * Scenario 9: Customers can complete guest checkout without registering or logging in.
     */
    public function test_customer_can_complete_guest_checkout_without_auth(): void
    {
        $product = Product::where('status', 'active')->first();
        $this->assertNotNull($product);

        // Unauthenticated guest request
        $response = $this->postJson('/api/storefront/checkout', [
            'name' => 'Guest Buyer',
            'email' => 'guest.buyer@shopping.example',
            'contact_number' => '+15551234567',
            'delivery_address' => '742 Evergreen Terrace, Springfield',
            'payment_method' => 'card',
            'items' => [
                [
                    'product_id' => $product->id,
                    'quantity' => 1,
                ],
            ],
        ]);

        $response->assertStatus(201)
            ->assertJsonStructure([
                'message',
                'order_number',
                'sale' => [
                    'id',
                    'transaction_no',
                    'total',
                    'customer' => ['name', 'email', 'phone', 'address'],
                    'items',
                ],
            ])
            ->assertJsonPath('sale.customer.name', 'Guest Buyer')
            ->assertJsonPath('sale.customer.email', 'guest.buyer@shopping.example');
    }

    /**
     * Scenario 10: Existing Admin accounts can still log in and manage the system.
     */
    public function test_existing_admin_account_can_login_and_manage_system(): void
    {
        $loginRes = $this->postJson('/api/login', [
            'email' => 'admin@retail.test',
            'password' => 'password',
        ]);

        $loginRes->assertStatus(200)
            ->assertJsonStructure(['token', 'user'])
            ->assertJsonPath('user.role', 'admin')
            ->assertJsonPath('user.status', 'active');

        $token = $loginRes->json('token');

        // Admin can access user management endpoints
        $usersRes = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/users');

        $usersRes->assertStatus(200);

        // Admin cannot have role demoted or be deactivated
        $admin = User::where('email', 'admin@retail.test')->first();
        $demoteRes = $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson("/api/users/{$admin->id}/role", ['role' => 'staff']);

        $demoteRes->assertStatus(422);

        $deactRes = $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson("/api/users/{$admin->id}/deactivate");

        $deactRes->assertStatus(422);
    }
}
