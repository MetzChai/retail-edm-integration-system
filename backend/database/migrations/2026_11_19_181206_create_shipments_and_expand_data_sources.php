<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Expand data_sources.type to VARCHAR(64) to support 'Logistics' and any new sources
        if (Schema::hasTable('data_sources')) {
            DB::statement("ALTER TABLE data_sources MODIFY COLUMN type VARCHAR(64) NOT NULL");
        }

        // 2. Add discount column to sales table
        if (Schema::hasTable('sales') && !Schema::hasColumn('sales', 'discount')) {
            Schema::table('sales', function (Blueprint $table) {
                $table->decimal('discount', 12, 2)->default(0)->after('total');
            });
        }

        // 3. Create shipments table for Logistics Provider integration
        if (!Schema::hasTable('shipments')) {
            Schema::create('shipments', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('sale_id')->index();
                $table->string('tracking_number')->unique()->index();
                $table->string('logistics_provider')->default('LBC Express'); // LBC Express, J&T Express, Ninja Van, DHL, 2GO
                $table->string('status', 64)->default('pending')->index(); 
                // pending, ready_for_shipment, shipped, in_transit, out_for_delivery, delivered, failed_delivery, returned
                $table->string('recipient_name')->nullable();
                $table->string('recipient_phone')->nullable();
                $table->text('shipping_address')->nullable();
                $table->timestamp('estimated_delivery_at')->nullable();
                $table->timestamp('delivered_at')->nullable();
                $table->text('notes')->nullable();
                $table->timestamps();

                $table->foreign('sale_id')->references('id')->on('sales')->cascadeOnDelete();
            });
        }

        // 4. Create cdc_events table for Change Data Capture (CDC) engine
        if (!Schema::hasTable('cdc_events')) {
            Schema::create('cdc_events', function (Blueprint $table) {
                $table->id();
                $table->string('entity', 64)->index(); // product, inventory, sale, customer, shipment
                $table->unsignedBigInteger('entity_id')->nullable()->index();
                $table->string('operation', 16)->index(); // INSERT, UPDATE, DELETE
                $table->json('before_payload')->nullable();
                $table->json('after_payload')->nullable();
                $table->timestamp('captured_at')->useCurrent()->index();
                $table->timestamp('synced_at')->nullable();
                $table->timestamps();
            });
        }

        // 5. Ensure default Logistics Provider exists in data_sources
        if (Schema::hasTable('data_sources')) {
            $exists = DB::table('data_sources')->where('type', 'Logistics')->exists();
            if (!$exists) {
                DB::table('data_sources')->insert([
                    'name' => 'National Express Logistics Network',
                    'type' => 'Logistics',
                    'status' => 'active',
                    'endpoint' => 'https://api.logistics-hub.retail.test/v1/shipments',
                    'description' => 'Third-party Logistics (3PL) provider tracking nationwide order fulfillment, dispatch, and delivery status updates.',
                    'last_sync_records' => 0,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('cdc_events');
        Schema::dropIfExists('shipments');

        if (Schema::hasTable('sales') && Schema::hasColumn('sales', 'discount')) {
            Schema::table('sales', function (Blueprint $table) {
                $table->dropColumn('discount');
            });
        }

        if (Schema::hasTable('data_sources')) {
            DB::table('data_sources')->where('type', 'Logistics')->delete();
            DB::statement("ALTER TABLE data_sources MODIFY COLUMN type ENUM('POS', 'Inventory', 'CRM', 'OnlineStorefront') NOT NULL");
        }
    }
};
