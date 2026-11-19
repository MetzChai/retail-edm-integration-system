<?php

namespace Database\Seeders;

use App\Models\DataSource;
use Illuminate\Database\Seeder;

class DataSourceSeeder extends Seeder
{
    public function run(): void
    {
        $sources = [
            ['POS Terminals', 'POS', 'http://pos.local/api/v1/transactions', 'In-store point of sale terminals'],
            ['Warehouse Inventory', 'Inventory', 'http://wms.local/api/v1/stock', 'Warehouse management stock snapshots'],
            ['CRM Platform', 'CRM', 'http://crm.local/api/v1/contacts', 'Customer relationship management contacts'],
            ['Online Storefront', 'OnlineStorefront', 'https://shop.example.test/api/orders', 'E-commerce web orders'],
        ];

        foreach ($sources as [$name, $type, $endpoint, $description]) {
            DataSource::updateOrCreate(
                ['name' => $name],
                [
                    'type' => $type,
                    'status' => 'active',
                    'endpoint' => $endpoint,
                    'description' => $description,
                    'last_sync_at' => now()->subHours(random_int(1, 48)),
                    'last_sync_records' => random_int(5, 120),
                ]
            );
        }
    }
}
