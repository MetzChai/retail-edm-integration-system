<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('data_sources', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->enum('type', ['POS', 'Inventory', 'CRM', 'OnlineStorefront'])->index();
            $table->enum('status', ['active', 'inactive', 'syncing', 'error'])->default('active');
            $table->string('endpoint')->nullable();
            $table->timestamp('last_sync_at')->nullable();
            $table->unsignedBigInteger('last_sync_records')->default(0);
            $table->text('description')->nullable();
            $table->timestamps();
        });

        Schema::create('integration_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('data_source_id')->nullable()->index();
            $table->string('source')->index();
            $table->string('operation')->default('sync');
            $table->enum('status', ['running', 'success', 'failed', 'partial'])->default('running');
            $table->integer('records_processed')->default(0);
            $table->integer('records_failed')->default(0);
            $table->text('errors')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->timestamps();

            $table->foreign('data_source_id')->references('id')->on('data_sources')->nullOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
        });

        Schema::create('data_quality_logs', function (Blueprint $table) {
            $table->id();
            $table->string('entity')->index();
            $table->enum('dimension', ['completeness', 'accuracy', 'consistency', 'uniqueness', 'validity']);
            $table->decimal('score', 5, 2)->default(0);
            $table->integer('records_checked')->default(0);
            $table->integer('records_failed')->default(0);
            $table->json('details')->nullable();
            $table->timestamp('checked_at')->nullable();
            $table->timestamps();
        });

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->nullable()->index();
            $table->string('user_name')->nullable();
            $table->string('action')->index();
            $table->string('entity')->index();
            $table->unsignedBigInteger('entity_id')->nullable();
            $table->json('details')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('data_quality_logs');
        Schema::dropIfExists('integration_logs');
        Schema::dropIfExists('data_sources');
    }
};
