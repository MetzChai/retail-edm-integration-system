<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Sale;
use App\Services\AuditService;
use App\Services\CustomerOfferService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CustomerController extends Controller
{
    public function __construct(
        private AuditService $audit,
        private CustomerOfferService $offers,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $customers = Customer::query()
            ->search($request->query('search'))
            ->when($request->boolean('active_only'), fn ($q) => $q->whereNull('merged_into_id'))
            ->withCount('sales as total_purchases')
            ->withSum('sales as total_spent', 'total')
            ->withMax('sales as latest_purchase_date', 'created_at')
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 15));

        $customers->getCollection()->transform(function (Customer $c) {
            $c->total_spent = round((float) ($c->total_spent ?? 0), 2);
            $c->total_purchases = (int) ($c->total_purchases ?? 0);
            $c->segment = $this->offers->getSegment($c);
            return $c;
        });

        return response()->json($customers);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);

        $duplicates = (new Customer)->findDuplicates($data['email'] ?? null, $data['phone'] ?? null);

        if ($duplicates && !$request->boolean('force')) {
            return response()->json([
                'message' => 'Potential duplicate customers detected.',
                'duplicates' => collect($duplicates)->map(fn (Customer $c) => [
                    'id' => $c->id,
                    'name' => $c->name,
                    'email' => $c->email,
                    'phone' => $c->phone,
                    'matched_on' => array_values(array_filter([
                        (isset($data['email'], $c->email) && $c->email === $data['email']) ? 'email' : null,
                        (isset($data['phone'], $c->phone) && $c->phone === $data['phone']) ? 'phone' : null,
                    ])),
                ]),
            ], 409);
        }

        try {
            $customer = Customer::create($data);
        } catch (\Illuminate\Database\QueryException $e) {
            // Exact email/phone already exists in DB (unique constraint).
            return response()->json([
                'message' => 'A customer with this email or phone already exists. Use the merge endpoint to combine them.',
                'duplicates' => (new Customer)->findDuplicates($data['email'] ?? null, $data['phone'] ?? null),
            ], 409);
        }

        $this->audit->model('create', $customer);

        return response()->json([
            'message' => 'Customer created.',
            'customer' => $customer,
        ], 201);
    }

    public function show(Customer $customer): JsonResponse
    {
        $customer->load(['sales' => fn ($q) => $q->with('items.product')->latest()->limit(20)]);
        $customer->loadCount('sales');
        $customer->setAttribute('total_spent', (float) $customer->sales()->sum('total'));

        return response()->json(['customer' => $customer]);
    }

    public function update(Request $request, Customer $customer): JsonResponse
    {
        $data = $this->validated($request, $customer->id);

        $duplicates = (new Customer)->findDuplicates($data['email'] ?? null, $data['phone'] ?? null, $customer->id);
        if ($duplicates && !$request->boolean('force')) {
            return response()->json([
                'message' => 'Potential duplicate customers detected.',
                'duplicates' => collect($duplicates),
            ], 409);
        }

        $before = $customer->getAttributes();

        try {
            $customer->update($data);
        } catch (\Illuminate\Database\QueryException $e) {
            return response()->json([
                'message' => 'Another customer already uses this email or phone.',
                'duplicates' => (new Customer)->findDuplicates($data['email'] ?? null, $data['phone'] ?? null, $customer->id),
            ], 409);
        }

        $this->audit->model('update', $customer, ['before' => $before]);

        return response()->json([
            'message' => 'Customer updated.',
            'customer' => $customer->fresh(),
        ]);
    }

    public function destroy(Customer $customer): JsonResponse
    {
        if ($customer->sales()->exists()) {
            return response()->json(['message' => 'Cannot delete customer with sales history.'], 422);
        }

        $this->audit->model('delete', $customer);
        $customer->delete();

        return response()->json(['message' => 'Customer deleted.']);
    }

    /**
     * Duplicate detection endpoint: given email/phone, return matches.
     */
    public function duplicates(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['nullable', 'email'],
            'phone' => ['nullable', 'string', 'max:32'],
        ]);

        $matches = (new Customer)->findDuplicates($data['email'] ?? null, $data['phone'] ?? null);

        return response()->json([
            'is_duplicate' => count($matches) > 0,
            'duplicates' => collect($matches)->map(fn (Customer $c) => [
                'id' => $c->id,
                'name' => $c->name,
                'email' => $c->email,
                'phone' => $c->phone,
                'city' => $c->city,
                'created_at' => $c->created_at,
            ]),
        ]);
    }

    /**
     * Merge a duplicate customer into a primary one (moves sales, flags source).
     */
    public function merge(Request $request, Customer $customer): JsonResponse
    {
        // Support both primary_id and target_id parameter names
        if ($request->has('target_id') && !$request->has('primary_id')) {
            $request->merge(['primary_id' => $request->input('target_id')]);
        }

        $data = $request->validate([
            'primary_id' => ['required', 'exists:customers,id', 'different:'.$customer->id],
        ]);

        $primary = Customer::findOrFail($data['primary_id']);

        DB::transaction(function () use ($customer, $primary) {
            Sale::where('customer_id', $customer->id)->update(['customer_id' => $primary->id]);

            $customer->update([
                'merged_into_id' => $primary->id,
                'notes' => trim(($customer->notes ? $customer->notes.' | ' : '').'Merged into #'.$primary->id.' at '.now()->toDateTimeString()),
            ]);

            // Fill missing primary fields from the duplicate.
            $updates = [];
            foreach (['email', 'phone', 'address', 'city'] as $field) {
                if (empty($primary->{$field}) && !empty($customer->{$field})) {
                    $updates[$field] = $customer->{$field};
                }
            }
            if ($updates) {
                $primary->update($updates);
            }
        });

        $this->audit->log('merge', 'Customer', $customer->id, [
            'merged_into' => $primary->id,
        ]);

        return response()->json([
            'message' => 'Customers merged successfully.',
            'primary' => $primary->fresh(),
            'merged' => $customer->fresh(),
        ]);
    }

    /**
     * Get detailed purchase history for a specific customer.
     */
    public function purchases(Request $request, Customer $customer): JsonResponse
    {
        $sales = Sale::with(['items.product', 'user', 'payments'])
            ->where('customer_id', $customer->id)
            ->latest('id')
            ->paginate($request->integer('per_page', 15));

        return response()->json([
            'customer' => $customer,
            'purchases' => $sales,
            'sales' => $sales,
        ]);
    }

    /**
     * Generate data-driven personalized customer offers derived from real purchase history.
     */
    public function offers(Customer $customer): JsonResponse
    {
        $data = $this->offers->generatePersonalizedOffers($customer);

        return response()->json($data);
    }

    /**
     * Get aggregate customer segmentation breakdown across active database profiles.
     */
    public function segments(): JsonResponse
    {
        $stats = $this->offers->getSystemSegmentationStats();

        return response()->json($stats);
    }

    private function validated(Request $request, ?int $ignoreId = null): array
    {
        // Uniqueness is handled by findDuplicates() so callers get a 409 with
        // the matching records (and a chance to force-create or merge) instead
        // of a bare 422. The DB unique constraints remain as the safety net.
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:32'],
            'address' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);
    }
}
