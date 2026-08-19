<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\StockMovement;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class StockMovementController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $limit = min((int) $request->input('limit', 20), 100);
        $movements = StockMovement::with('product.category')
            ->orderBy('created_at', 'desc')
            ->limit($limit)
            ->get();

        return response()->json([
            'status' => 'success',
            'data' => $movements
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'product_id' => 'required|exists:products,id',
            'type' => 'required|in:restock,damage,expired,adjustment',
            'quantity_change' => 'required|integer|not_in:0',
            'notes' => 'nullable|string|max:255',
        ]);

        $movement = DB::transaction(function () use ($validated) {
            $product = Product::lockForUpdate()->findOrFail($validated['product_id']);

            $newStock = $product->stock_quantity + $validated['quantity_change'];
            if ($newStock < 0) {
                abort(422, 'Stock quantity cannot drop below zero.');
            }

            $product->update(['stock_quantity' => $newStock]);

            return StockMovement::create([
                'product_id' => $validated['product_id'],
                'type' => $validated['type'],
                'quantity_change' => $validated['quantity_change'],
                'notes' => $validated['notes'] ?? null,
                'created_at' => now(),
            ]);
        });

        return response()->json([
            'status' => 'success',
            'message' => 'Stock movement recorded successfully',
            'data' => $movement->load('product')
        ], 201);
    }
}