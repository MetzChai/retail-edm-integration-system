<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Add the approval-workflow status to users.
     *
     * Smallest possible change: one column, default 'active' so every existing
     * user keeps working. `is_active` stays in sync (see User::saving hook) so
     * the existing EnsureRole/EnsurePermission middleware is untouched.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->enum('status', ['pending', 'active', 'inactive', 'rejected'])
                ->default('active')
                ->after('is_active')
                ->index();
        });

        // Backfill: any deactivated user becomes 'inactive', everyone else 'active'.
        DB::table('users')->where('is_active', false)->update(['status' => 'inactive']);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['status']);
            $table->dropColumn('status');
        });
    }
};
