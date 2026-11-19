<?php

namespace Database\Seeders;

use App\Models\DataQualityLog;
use App\Models\DataSource;
use App\Models\IntegrationLog;
use Illuminate\Database\Seeder;

class LogSeeder extends Seeder
{
    public function run(): void
    {
        $sources = DataSource::all();

        foreach ($sources as $source) {
            foreach (range(1, 4) as $i) {
                $started = now()->subDays($i * 2)->subHours(random_int(0, 12));
                $finished = $started->copy()->addSeconds(random_int(2, 45));
                $failed = $i === 3 && $source->id % 2 === 0;

                IntegrationLog::create([
                    'data_source_id' => $source->id,
                    'source' => $source->type,
                    'operation' => 'sync',
                    'status' => $failed ? 'failed' : 'success',
                    'records_processed' => $failed ? 0 : random_int(5, 120),
                    'records_failed' => $failed ? random_int(1, 10) : 0,
                    'errors' => $failed ? json_encode([['errors' => ['Connection timeout to '.$source->endpoint]]]) : null,
                    'started_at' => $started,
                    'finished_at' => $finished,
                    'user_id' => null,
                    'created_at' => $finished,
                    'updated_at' => $finished,
                ]);

                $source->update([
                    'last_sync_at' => $finished,
                    'last_sync_records' => $failed ? $source->last_sync_records : random_int(5, 120),
                ]);
            }
        }

        // Sample data quality results (5 dimensions x 3 entities).
        $dimensions = ['completeness', 'accuracy', 'consistency', 'uniqueness', 'validity'];
        $entities = ['products', 'customers', 'sales', 'inventory', 'data_sources'];

        foreach ($entities as $entity) {
            foreach ($dimensions as $dimension) {
                $checked = random_int(10, 500);
                $failed = random_int(0, (int) ($checked * 0.15));

                DataQualityLog::create([
                    'entity' => $entity,
                    'dimension' => $dimension,
                    'score' => round(($checked - $failed) / $checked * 100, 2),
                    'records_checked' => $checked,
                    'records_failed' => $failed,
                    'details' => ['rule' => "Seeded {$dimension} check for {$entity}"],
                    'checked_at' => now()->subDays(random_int(0, 5)),
                ]);
            }
        }
    }
}
