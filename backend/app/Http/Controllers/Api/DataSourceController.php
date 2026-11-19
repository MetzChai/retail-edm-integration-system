<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DataSource;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DataSourceController extends Controller
{
    public function __construct(private AuditService $audit)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $sources = DataSource::query()
            ->when($request->query('type'), fn ($q, $t) => $q->where('type', $t))
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->when($request->query('search'), fn ($q, $s) => $q->where('name', 'like', "%{$s}%"))
            ->withCount(['logs' => fn ($q) => $q->where('status', 'success')])
            ->orderBy('name')
            ->paginate($request->integer('per_page', 15));

        return response()->json($sources);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255', 'unique:data_sources,name'],
            'type' => ['required', 'in:POS,Inventory,CRM,OnlineStorefront'],
            'status' => ['nullable', 'in:active,inactive'],
            'endpoint' => ['nullable', 'string', 'max:500'],
            'description' => ['nullable', 'string', 'max:1000'],
        ]);

        $data['status'] = $data['status'] ?? 'active';
        $source = DataSource::create($data);
        $this->audit->model('create', $source);

        return response()->json(['message' => 'Data source created.', 'data_source' => $source], 201);
    }

    public function show(DataSource $dataSource): JsonResponse
    {
        return response()->json([
            'data_source' => $dataSource->load(['logs' => fn ($q) => $q->latest('id')->limit(10)]),
        ]);
    }

    public function update(Request $request, DataSource $dataSource): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255', 'unique:data_sources,name,'.$dataSource->id],
            'type' => ['required', 'in:POS,Inventory,CRM,OnlineStorefront'],
            'status' => ['required', 'in:active,inactive,syncing,error'],
            'endpoint' => ['nullable', 'string', 'max:500'],
            'description' => ['nullable', 'string', 'max:1000'],
        ]);

        $before = $dataSource->getAttributes();
        $dataSource->update($data);
        $this->audit->model('update', $dataSource, ['before' => $before]);

        return response()->json(['message' => 'Data source updated.', 'data_source' => $dataSource->fresh()]);
    }

    public function destroy(DataSource $dataSource): JsonResponse
    {
        $this->audit->model('delete', $dataSource);
        $dataSource->delete();

        return response()->json(['message' => 'Data source deleted.']);
    }
}
