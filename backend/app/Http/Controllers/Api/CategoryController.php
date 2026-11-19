<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CategoryController extends Controller
{
    public function __construct(private AuditService $audit)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $categories = Category::with(['parent', 'children', 'products' => fn ($q) => $q->select('id')])
            ->search($request->query('search'))
            ->when($request->boolean('trashed') === false && $request->has('active'), fn ($q) => $q->where('is_active', $request->boolean('active')))
            ->withCount('products')
            ->orderBy('name')
            ->paginate($request->integer('per_page', 15));

        return response()->json($categories);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255', 'unique:categories,name'],
            'description' => ['nullable', 'string'],
            'parent_id' => ['nullable', 'exists:categories,id'],
            'is_active' => ['boolean'],
        ]);

        $data['slug'] = $this->slug($data['name']);
        $data['is_active'] = $data['is_active'] ?? true;

        $category = Category::create($data);
        $this->audit->model('create', $category);

        return response()->json([
            'message' => 'Category created.',
            'category' => $category,
        ], 201);
    }

    public function show(Category $category): JsonResponse
    {
        return response()->json([
            'category' => $category->load(['parent', 'children'])->loadCount('products'),
        ]);
    }

    public function update(Request $request, Category $category): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255', 'unique:categories,name,'.$category->id],
            'description' => ['nullable', 'string'],
            'parent_id' => ['nullable', 'exists:categories,id'],
            'is_active' => ['boolean'],
        ]);

        if (isset($data['parent_id']) && $data['parent_id'] == $category->id) {
            return response()->json(['message' => 'A category cannot be its own parent.'], 422);
        }

        if (isset($data['name']) && $data['name'] !== $category->name) {
            $data['slug'] = $this->slug($data['name']);
        }

        $before = $category->getAttributes();
        $category->update($data);
        $this->audit->model('update', $category, ['before' => $before]);

        return response()->json([
            'message' => 'Category updated.',
            'category' => $category->fresh(),
        ]);
    }

    public function destroy(Category $category): JsonResponse
    {
        if ($category->products()->exists()) {
            return response()->json([
                'message' => 'Cannot delete category with associated products.',
            ], 422);
        }

        $this->audit->model('delete', $category);
        $category->delete();

        return response()->json(['message' => 'Category deleted.']);
    }

    private function slug(string $name): string
    {
        $base = Str::slug($name) ?: 'category';
        $slug = $base;
        $i = 1;

        while (Category::where('slug', $slug)->exists()) {
            $slug = $base.'-'.(++$i);
        }

        return $slug;
    }
}
