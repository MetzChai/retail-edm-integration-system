<?php

namespace Database\Seeders;

use App\Models\Customer;
use Illuminate\Database\Seeder;

class CustomerSeeder extends Seeder
{
    public function run(): void
    {
        $customers = [
            ['Andi Wijaya', 'andi.wijaya@example.test', '081200000001', 'Jakarta'],
            ['Budi Santoso', 'budi.santoso@example.test', '081200000002', 'Bandung'],
            ['Citra Lestari', 'citra.lestari@example.test', '081200000003', 'Surabaya'],
            ['Dian Permata', 'dian.permata@example.test', '081200000004', 'Jakarta'],
            ['Eko Prasetyo', 'eko.prasetyo@example.test', '081200000005', 'Semarang'],
            ['Fitri Handayani', 'fitri.handayani@example.test', '081200000006', 'Medan'],
            ['Gunawan Hidayat', 'gunawan.hidayat@example.test', '081200000007', 'Bandung'],
            ['Hesti Rahmawati', 'hesti.rahmawati@example.test', '081200000008', 'Jakarta'],
            ['Indra Kusuma', 'indra.kusuma@example.test', '081200000009', 'Yogyakarta'],
            ['Joko Susilo', 'joko.susilo@example.test', '081200000010', 'Surabaya'],
            ['Kartika Sari', 'kartika.sari@example.test', '081200000011', 'Jakarta'],
            ['Lukman Hakim', 'lukman.hakim@example.test', '081200000012', 'Malang'],
            ['Maya Anggraini', 'maya.anggraini@example.test', '081200000013', 'Depok'],
            ['Nia Ramadhania', 'nia.ramadhania@example.test', '081200000014', 'Bekasi'],
            ['Oscar Nugroho', 'oscar.nugroho@example.test', '081200000015', 'Tangerang'],
        ];

        foreach ($customers as [$name, $email, $phone, $city]) {
            Customer::updateOrCreate(
                ['email' => $email],
                [
                    'name' => $name,
                    'phone' => $phone,
                    'city' => $city,
                    'address' => 'Jl. Merdeka No. '.random_int(1, 200),
                ]
            );
        }
    }
}
