use Illuminate\Support\Facades\Route;

Route::get('/health', function () {
    return response()->json([
        'status' => 'online',
        'message' => 'PHP backend is responding',
    ]);
});