<?php

namespace Database\Seeders;

use App\Models\Category;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class CategorySeeder extends Seeder
{
    public function run(): void
    {
        $categories = [
            ['Electronics', 'Phones, laptops and gadgets'],
            ['Groceries', 'Food and daily essentials'],
            ['Apparel', 'Clothing and accessories'],
            ['Home & Living', 'Furniture and household items'],
            ['Health & Beauty', 'Personal care and cosmetics'],
            ['Sports & Outdoors', 'Fitness and outdoor gear'],
        ];

        $parentId = null;

        foreach ($categories as [$name, $description]) {
            $category = Category::updateOrCreate(
                ['slug' => Str::slug($name)],
                [
                    'name' => $name,
                    'description' => $description,
                    'parent_id' => $parentId,
                    'is_active' => true,
                ]
            );

            $parentId ??= $category->id;
        }

        // Sub-categories.
        $subs = [
            ['Smartphones', 'Electronics'],
            ['Laptops', 'Electronics'],
            ['Beverages', 'Groceries'],
            ['Snacks', 'Groceries'],
        ];

        foreach ($subs as [$name, $parentName]) {
            Category::updateOrCreate(
                ['slug' => Str::slug($name)],
                [
                    'name' => $name,
                    'parent_id' => Category::where('name', $parentName)->value('id'),
                    'is_active' => true,
                ]
            );
        }
    }
}
