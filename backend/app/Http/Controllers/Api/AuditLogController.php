<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $logs = AuditLog::query()
            ->when($request->query('action'), fn ($q, $a) => $q->where('action', $a))
            ->when($request->query('entity'), fn ($q, $e) => $q->where('entity', $e))
            ->when($request->query('user_id'), fn ($q, $id) => $q->where('user_id', $id))
            ->when($request->query('from'), fn ($q, $f) => $q->where('created_at', '>=', $f))
            ->when($request->query('to'), fn ($q, $t) => $q->where('created_at', '<=', $t.' 23:59:59'))
            ->when($request->query('search'), fn ($q, $s) => $q->where(function ($w) use ($s) {
                $w->where('user_name', 'like', "%{$s}%")
                    ->orWhere('entity', 'like', "%{$s}%")
                    ->orWhere('action', 'like', "%{$s}%");
            }))
            ->latest('id')
            ->paginate($request->integer('per_page', 25));

        return response()->json($logs);
    }

    public function actions(): JsonResponse
    {
        return response()->json([
            'actions' => AuditLog::distinct()->orderBy('action')->pluck('action'),
            'entities' => AuditLog::distinct()->orderBy('entity')->pluck('entity'),
        ]);
    }
}
