<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        $users = [
            ['Admin User', 'admin@retail.test', 'admin'],
            ['Store Manager', 'manager@retail.test', 'manager'],
            ['Sales Staff', 'staff@retail.test', 'staff'],
        ];

        foreach ($users as [$name, $email, $roleName]) {
            User::updateOrCreate(
                ['email' => $email],
                [
                    'name' => $name,
                    'password' => 'password',
                    'is_active' => true,
                    'role_id' => Role::where('name', $roleName)->value('id'),
                ]
            );
        }
    }
}
