<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Safely add requested_role column to users table without dropping tables
     * or deleting any existing user records.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('requested_role', 50)->nullable()->after('role_id');
        });

        // Backfill requested_role for existing users from their current role
        $users = DB::table('users')
            ->join('roles', 'users.role_id', '=', 'roles.id')
            ->select('users.id', 'roles.name as role_name')
            ->get();

        foreach ($users as $user) {
            DB::table('users')
                ->where('id', $user->id)
                ->update(['requested_role' => $user->role_name]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('requested_role');
        });
    }
};

