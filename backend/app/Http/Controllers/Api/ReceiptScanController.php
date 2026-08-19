<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ReceiptScanController extends Controller
{
    public function scan(Request $request): JsonResponse
    {
        $request->validate([
            'image' => 'nullable|file|max:20480',
            'image_base64' => 'nullable|string',
        ]);

        $apiKey = config('services.gemini.api_key') ?: env('GEMINI_API_KEY');
        if (empty($apiKey)) {
            return response()->json([
                'status' => 'error',
                'message' => 'Gemini API key is not configured. Please set GEMINI_API_KEY in your backend/.env file.',
            ], 422);
        }

        $base64Data = null;
        $mimeType = 'image/jpeg';

        if ($request->hasFile('image')) {
            $file = $request->file('image');
            $mimeType = $file->getMimeType() ?: 'image/jpeg';
            $base64Data = base64_encode(file_get_contents($file->getRealPath()));
        } elseif ($request->filled('image_base64')) {
            $base64String = $request->input('image_base64');
            if (preg_match('/^data:(image\/[a-zA-Z0-9\+\-]+);base64,(.+)$/', $base64String, $matches)) {
                $mimeType = $matches[1];
                $base64Data = $matches[2];
            } else {
                $base64Data = $base64String;
            }
        } else {
            return response()->json([
                'status' => 'error',
                'message' => 'Please provide a receipt image file or base64 image string.',
            ], 422);
        }

        $categories = Category::all();
        $categoryNames = $categories->pluck('name')->implode(', ');

        $prompt = <<<PROMPT
You are an expert Philippine sari-sari store receipt OCR reader.
Analyze this store/distributor receipt (e.g. from Puregold, Supermarket, Wholesaler) and extract all line items purchased.

Available store categories: {$categoryNames}

For each line item, extract:
- name: Clean product title with brand name, variant, and size/pack if visible (e.g. "Lucky Me! Pancit Canton Kalamansi", "Kopiko Blanca 52g", "555 Sardines in Tomato Sauce 155g").
- cost_price: Unit purchase/cost price in Philippine Pesos (numeric).
- selling_price: Suggested retail price with standard Philippine sari-sari store markup (~15% to 30% above cost price) formatted as numeric.
- quantity: Purchased quantity as an integer.
- unit: Standard retail unit (e.g. "sachet", "pc", "can", "pack", "bottle", "box", "pouch", "kg").
- category_name: The closest matching category from the available store categories list.
- barcode: Item barcode / SKU number if printed on receipt, otherwise null.

Return strictly valid JSON matching this schema:
{
  "items": [
    {
      "name": "Lucky Me! Pancit Canton Kalamansi",
      "cost_price": 12.50,
      "selling_price": 16.00,
      "quantity": 12,
      "unit": "pc",
      "category_name": "Instant Noodles",
      "barcode": null
    }
  ]
}
PROMPT;

        $model = config('services.gemini.model') ?: 'gemini-2.5-flash-lite';
        $url = "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$apiKey}";

        try {
            $response = Http::withHeaders([
                'Content-Type' => 'application/json',
            ])->timeout(60)->post($url, [
                'contents' => [
                    [
                        'parts' => [
                            ['text' => $prompt],
                            [
                                'inline_data' => [
                                    'mime_type' => $mimeType,
                                    'data' => $base64Data,
                                ],
                            ],
                        ],
                    ],
                ],
                'generationConfig' => [
                    'temperature' => 0.1,
                ],
            ]);

            if (!$response->successful()) {
                Log::error('Gemini API Error: ' . $response->body());
                return response()->json([
                    'status' => 'error',
                    'message' => 'Gemini API call failed: ' . ($response->json('error.message') ?? $response->status()),
                ], 502);
            }

            $responseData = $response->json();
            $rawText = '{}';
            $parts = $responseData['candidates'][0]['content']['parts'] ?? [];
            foreach ($parts as $part) {
                if (!empty($part['text'])) {
                    $rawText = $part['text'];
                    break;
                }
            }

            // Strip potential markdown code fences if returned
            $cleanedJson = preg_replace('/^```(?:json)?\s*|\s*```$/m', '', trim($rawText));
            $parsed = json_decode($cleanedJson, true);
            if (!$parsed && preg_match('/\{[\s\S]*\}/', $cleanedJson, $matches)) {
                $parsed = json_decode($matches[0], true);
            }
            if (!$parsed) {
                $parsed = json_decode($rawText, true);
            }

            $items = $parsed['items'] ?? [];
            $mappedItems = [];

            foreach ($items as $item) {
                $categoryName = $item['category_name'] ?? null;
                $matchedCategory = null;

                if ($categoryName) {
                    $matchedCategory = $categories->first(function ($cat) use ($categoryName) {
                        return stripos($cat->name, $categoryName) !== false || stripos($categoryName, $cat->name) !== false;
                    });
                }

                $costPrice = isset($item['cost_price']) ? (float) $item['cost_price'] : 0.0;
                $sellingPrice = isset($item['selling_price']) ? (float) $item['selling_price'] : ($costPrice > 0 ? round($costPrice * 1.25, 2) : 0.0);
                $quantity = isset($item['quantity']) ? (int) $item['quantity'] : 1;

                $mappedItems[] = [
                    'name' => $item['name'] ?? 'Unnamed Product',
                    'original_name' => $item['name'] ?? 'Unnamed Product',
                    'barcode' => $item['barcode'] ?? null,
                    'cost_price' => number_format($costPrice, 2, '.', ''),
                    'selling_price' => number_format($sellingPrice, 2, '.', ''),
                    'stock_quantity' => $quantity > 0 ? $quantity : 1,
                    'unit' => $item['unit'] ?? 'pc',
                    'category_id' => $matchedCategory ? $matchedCategory->id : null,
                    'category_name' => $matchedCategory ? $matchedCategory->name : ($categoryName ?? 'Uncategorized'),
                    'reorder_level' => 5,
                ];
            }

            $usageMetadata = $responseData['usageMetadata'] ?? [];
            $totalTokens = (int) ($usageMetadata['totalTokenCount'] ?? 380);
            $todayKey = 'gemini_scans_' . date('Y-m-d');
            $scansToday = (int) Cache::get($todayKey, 0) + 1;
            Cache::put($todayKey, $scansToday, now()->endOfDay());
            if ($totalTokens > 0) {
                Cache::put('gemini_last_tokens', $totalTokens, now()->addDays(7));
            }
            $dailyLimit = 1500;
            $remaining = max(0, $dailyLimit - $scansToday);

            return response()->json([
                'status' => 'success',
                'message' => 'Receipt processed successfully',
                'count' => count($mappedItems),
                'data' => $mappedItems,
                'quota' => [
                    'scans_used_today' => $scansToday,
                    'scans_remaining_today' => $remaining,
                    'daily_limit' => $dailyLimit,
                    'tokens_used_last_scan' => $totalTokens,
                    'approx_tokens_remaining' => max(0, 1000000 - ($totalTokens * $scansToday)),
                ],
            ]);
        } catch (\Exception $e) {
            Log::error('Receipt scan exception: ' . $e->getMessage());
            return response()->json([
                'status' => 'error',
                'message' => 'Failed to process receipt: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function quota(): JsonResponse
    {
        $dailyLimit = 1500;
        $scansToday = (int) Cache::get('gemini_scans_' . date('Y-m-d'), 0);
        $remaining = max(0, $dailyLimit - $scansToday);
        $lastTokens = (int) Cache::get('gemini_last_tokens', 380);

        return response()->json([
            'status' => 'success',
            'data' => [
                'scans_used_today' => $scansToday,
                'scans_remaining_today' => $remaining,
                'daily_limit' => $dailyLimit,
                'tokens_used_last_scan' => $lastTokens,
                'approx_tokens_remaining' => max(0, 1000000 - ($lastTokens * $scansToday)),
                'reset_time' => '00:00 UTC',
            ],
        ]);
    }
}
