<?php

use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\ReceiptScanController;
use App\Http\Controllers\Api\StockMovementController;
use App\Models\Category;
use Illuminate\Support\Facades\Route;

Route::get('/health', function () {
    return response()->json(['status' => 'ok']);
});

Route::get('/categories', function () {
    return response()->json(['status' => 'success', 'data' => Category::all()]);
});

Route::get('/products', [ProductController::class, 'index']);
Route::post('/products', [ProductController::class, 'store']);
Route::post('/products/batch', [ProductController::class, 'batchStore']);
Route::get('/products/{product}', [ProductController::class, 'show']);
Route::put('/products/{product}', [ProductController::class, 'update']);
Route::delete('/products/{product}', [ProductController::class, 'destroy']);

Route::post('/stock-movements', [StockMovementController::class, 'store']);
Route::get('/scan-quota', [ReceiptScanController::class, 'quota']);
Route::post('/scan-receipt', [ReceiptScanController::class, 'scan']);