<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Expand sales.status from enum to varchar(32) to accommodate:
        // pending, confirmed, processing, shipped, completed, cancelled, refunded
        if (Schema::hasTable('sales')) {
            DB::statement("ALTER TABLE sales MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'completed'");
        }

        // 2. Create notifications table for system alerts, stock warnings, new orders, etc.
        if (!Schema::hasTable('notifications')) {
            Schema::create('notifications', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('user_id')->nullable()->index();
                $table->string('type', 64)->default('info'); // info, success, warning, alert, order, stock
                $table->string('title');
                $table->text('message');
                $table->string('category', 64)->default('system'); // order, inventory, sync, quality, user, governance
                $table->json('data')->nullable();
                $table->boolean('is_read')->default(false)->index();
                $table->timestamp('read_at')->nullable();
                $table->string('action_url')->nullable();
                $table->timestamps();

                $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
        if (Schema::hasTable('sales')) {
            DB::statement("ALTER TABLE sales MODIFY COLUMN status ENUM('completed', 'pending', 'refunded') NOT NULL DEFAULT 'completed'");
        }
    }
};

