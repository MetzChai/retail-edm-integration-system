<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;

class RolePermissionSeeder extends Seeder
{
    /**
     * Permission catalogue: group => list of permission names.
     *
     * @var array<string, array<int, string>>
     */
    protected array $permissions = [
        'products' => ['products.view', 'products.manage'],
        'categories' => ['categories.view', 'categories.manage'],
        'customers' => ['customers.view', 'customers.manage'],
        'inventory' => ['inventory.view', 'inventory.manage'],
        'sales' => ['sales.view', 'sales.create'],
        'integration' => ['integration.view', 'integration.manage'],
        'reports' => ['reports.view'],
        'governance' => ['governance.manage'],
    ];

    /**
     * Role => granted permissions (admin gets everything).
     *
     * @var array<string, array<int, string>>
     */
    protected array $roles = [
        'admin' => '*', // all permissions
        'manager' => [
            'products.view', 'products.manage',
            'categories.view', 'categories.manage',
            'customers.view', 'customers.manage',
            'inventory.view', 'inventory.manage',
            'sales.view', 'sales.create',
            'integration.view',
            'reports.view',
        ],
        'staff' => [
            'products.view',
            'categories.view',
            'customers.view',
            'inventory.view',
            'sales.view',
            'sales.create',
            'reports.view',
        ],
    ];

    public function run(): void
    {
        $all = [];

        foreach ($this->permissions as $group => $names) {
            foreach ($names as $name) {
                $permission = Permission::updateOrCreate(
                    ['name' => $name],
                    ['label' => ucwords(str_replace(['.', '_'], ' ', $name)), 'group' => $group]
                );
                $all[$name] = $permission;
            }
        }

        $labels = [
            'admin' => 'Administrator',
            'manager' => 'Store Manager',
            'staff' => 'Sales Staff',
        ];

        foreach ($this->roles as $name => $granted) {
            $role = Role::updateOrCreate(
                ['name' => $name],
                ['label' => $labels[$name] ?? $name, 'description' => ucfirst($name).' role']
            );

            $ids = $granted === '*'
                ? collect($all)->pluck('id')->all()
                : collect($granted)->map(fn ($p) => $all[$p]->id ?? null)->filter()->all();

            $role->permissions()->sync($ids);
        }
    }
}
