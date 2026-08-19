<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Product;
use App\Models\StockMovement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class DatabaseController extends Controller
{
    /**
     * Purge and reset inventory database.
     * Requires exact challenge phrase confirmation.
     */
    public function reset(Request $request): JsonResponse
    {
        $request->validate([
            'confirmation' => 'required|string',
            'mode' => 'nullable|string|in:clean_slate,demo_seed,keep_categories',
        ]);

        $challenge = strtolower(trim($request->confirmation));
        if ($challenge !== 'confirm to reset my database') {
            return response()->json([
                'status' => 'error',
                'message' => 'Invalid confirmation phrase. You must type "confirm to reset my database" exactly.',
            ], 422);
        }

        $mode = $request->input('mode', 'clean_slate');

        Schema::disableForeignKeyConstraints();
        StockMovement::truncate();
        Product::truncate();

        if ($mode === 'clean_slate') {
            Category::truncate();
            // Seed standard core categories so the store is immediately usable
            $defaultCategories = [
                'Canned Goods',
                'Coffee & Beverages',
                'Instant Noodles',
                'Snacks & Biscuits',
                'Household & Personal Care',
                'Condiments & Spices',
                'Frozen & Dairy',
            ];
            foreach ($defaultCategories as $catName) {
                Category::create(['name' => $catName]);
            }
        } elseif ($mode === 'demo_seed') {
            Category::truncate();
            $seeder = new \Database\Seeders\DatabaseSeeder();
            $seeder->run();
        }
        Schema::enableForeignKeyConstraints();

        $message = match ($mode) {
            'demo_seed' => 'Database reset and re-seeded with initial sample inventory.',
            'keep_categories' => 'All products and stock movements purged. Categories preserved.',
            default => 'Database successfully purged. Core category structure initialized.',
        };

        return response()->json([
            'status' => 'success',
            'message' => $message,
        ]);
    }
}
