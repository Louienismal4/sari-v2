<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ProductController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Product::with('category')->where('is_active', true);

        if ($request->filled('search')) {
            $search = $request->query('search');
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('barcode', 'like', "%{$search}%");
            });
        }

        if ($request->filled('category_id')) {
            $query->where('category_id', $request->query('category_id'));
        }

        $products = $query->orderBy('name')->get();

        return response()->json([
            'status' => 'success',
            'data' => $products
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'category_id' => 'nullable|exists:categories,id',
            'barcode' => 'nullable|string|max:255',
            'name' => 'required|string|max:255',
            'original_name' => 'nullable|string|max:255',
            'unit' => 'required|string|max:50',
            'cost_price' => 'required|numeric|min:0',
            'selling_price' => 'required|numeric|min:0',
            'stock_quantity' => 'required|integer|min:0',
            'reorder_level' => 'nullable|integer|min:0',
        ]);

        if (!empty($validated['barcode'])) {
            $existing = Product::where('barcode', $validated['barcode'])->first();
            if ($existing) {
                $existing->update($validated);
                return response()->json([
                    'status' => 'success',
                    'message' => 'Product updated successfully',
                    'data' => $existing->load('category')
                ], 200);
            }
        }

        $product = Product::create($validated);

        return response()->json([
            'status' => 'success',
            'message' => 'Product created successfully',
            'data' => $product->load('category')
        ], 201);
    }

    public function batchStore(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'products' => 'required|array|min:1',
            'products.*.category_id' => 'nullable|exists:categories,id',
            'products.*.barcode' => 'nullable|string|max:255',
            'products.*.name' => 'required|string|max:255',
            'products.*.original_name' => 'nullable|string|max:255',
            'products.*.unit' => 'required|string|max:50',
            'products.*.cost_price' => 'required|numeric|min:0',
            'products.*.selling_price' => 'required|numeric|min:0',
            'products.*.stock_quantity' => 'required|integer|min:0',
            'products.*.reorder_level' => 'nullable|integer|min:0',
        ]);

        $created = [];
        DB::transaction(function () use ($validated, &$created) {
            foreach ($validated['products'] as $item) {
                if (!empty($item['barcode'])) {
                    $existing = Product::where('barcode', $item['barcode'])->first();
                    if ($existing) {
                        $existing->stock_quantity += ($item['stock_quantity'] ?? 1);
                        $existing->cost_price = $item['cost_price'];
                        $existing->selling_price = $item['selling_price'];
                        if (!empty($item['original_name']) && empty($existing->original_name)) {
                            $existing->original_name = $item['original_name'];
                        }
                        $existing->save();
                        $created[] = $existing;
                        continue;
                    }
                }
                $created[] = Product::create($item);
            }
        });

        return response()->json([
            'status' => 'success',
            'message' => count($created) . ' products processed successfully',
            'data' => $created,
        ], 201);
    }

    public function show(Product $product): JsonResponse
    {
        return response()->json([
            'status' => 'success',
            'data' => $product->load('category')
        ]);
    }

    public function update(Request $request, Product $product): JsonResponse
    {
        $validated = $request->validate([
            'category_id' => 'nullable|exists:categories,id',
            'barcode' => ['nullable', 'string', 'max:255', Rule::unique('products', 'barcode')->ignore($product->id)],
            'name' => 'sometimes|required|string|max:255',
            'original_name' => 'nullable|string|max:255',
            'unit' => 'sometimes|required|string|max:50',
            'cost_price' => 'sometimes|required|numeric|min:0',
            'selling_price' => 'sometimes|required|numeric|min:0',
            'stock_quantity' => 'sometimes|required|integer|min:0',
            'reorder_level' => 'nullable|integer|min:0',
            'is_active' => 'sometimes|boolean',
        ]);

        $product->update($validated);

        return response()->json([
            'status' => 'success',
            'message' => 'Product updated successfully',
            'data' => $product->load('category')
        ]);
    }

    public function destroy(Product $product): JsonResponse
    {
        $product->update(['is_active' => false]);

        return response()->json([
            'status' => 'success',
            'message' => 'Product removed successfully'
        ]);
    }
}