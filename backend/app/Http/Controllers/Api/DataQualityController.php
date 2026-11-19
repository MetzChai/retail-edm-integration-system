<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\DataQualityService;
use Illuminate\Http\JsonResponse;

class DataQualityController extends Controller
{
    public function __construct(private DataQualityService $service)
    {
    }

    public function run(): JsonResponse
    {
        $stats = $this->service->run();

        return response()->json([
            'message' => 'Data quality run completed.',
            'results' => $stats,
        ]);
    }

    public function stats(): JsonResponse
    {
        return response()->json($this->service->stats());
    }
}
