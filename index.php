<?php
require_once __DIR__ . '/backend/config/env.php';
/**
 * EchoTrace Root Router
 * For PHP's built-in server: php -S localhost:8000
 * For Apache/Laragon: Uses .htaccess for routing
 */

// Anti-cache headers for development
header("Cache-Control: no-cache, no-store, must-revalidate");
header("Pragma: no-cache");
header("Expires: 0");

// Credentialed CORS must use an explicit allow-list. Never reflect an
// arbitrary Origin header, because this router also serves the API.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = array_filter(array_map('trim', explode(',', getenv('ECHOTRACE_ALLOWED_ORIGINS') ?: 'http://localhost:8000,http://127.0.0.1:8000,http://localhost,http://127.0.0.1')));
if ($origin !== '' && in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Vary: Origin');
}

header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, PATCH");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept");
header("Access-Control-Max-Age: 86400");

// Handle CORS preflight requests FIRST
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

$request_uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$request_uri = str_replace('/capsatone2', '', $request_uri); // Remove project prefix if present

// Root path - serve frontend
if ($request_uri === '/' || $request_uri === '' || $request_uri === '/index.html' || $request_uri === '/index.php') {
    header('Content-Type: text/html; charset=UTF-8');
    readfile(__DIR__ . '/frontend/index.html');
    exit;
}

// Route /api/* and /backend/api/* to backend API
if (strpos($request_uri, '/api') === 0 || strpos($request_uri, '/backend/api') === 0) {
    if (empty($_GET['route'])) {
        $clean_route = preg_replace('#^.*?(?:/backend/api/|/api/)#', '', $request_uri);
        $clean_route = preg_replace('#^index\.php#', '', $clean_route);
        $clean_route = ltrim($clean_route, '/');
        if (!empty($clean_route)) {
            $_GET['route'] = $clean_route;
        }
    }
    require_once __DIR__ . '/backend/api/index.php';
    exit;
}

// Route static files from frontend (js, css, images, etc.)
$static_extensions = ['js', 'css', 'json', 'png', 'jpg', 'jpeg', 'gif', 'ico', 'svg', 'woff', 'woff2', 'ttf', 'eot', 'html'];
if (preg_match('/\.(' . implode('|', $static_extensions) . ')$/i', $request_uri)) {
    // ``/capsatone2`` is stripped above, so dashboard assets are requested
    // as `/frontend/js/...`. Avoid prepending `frontend` twice and serve the
    // resolved asset explicitly; PHP's built-in server cannot resolve the
    // original `/capsatone2/...` path after the router has handled it.
    $frontend_root = realpath(__DIR__ . '/frontend');
    $asset_path = preg_replace('#^/frontend/#', '/', $request_uri);
    $file_path = realpath($frontend_root . $asset_path);
    if ($file_path && str_starts_with($file_path, $frontend_root . DIRECTORY_SEPARATOR) && is_file($file_path)) {
        $extension = strtolower(pathinfo($file_path, PATHINFO_EXTENSION));
        $mime_types = [
            'js' => 'application/javascript; charset=UTF-8',
            'css' => 'text/css; charset=UTF-8',
            'json' => 'application/json; charset=UTF-8',
            'svg' => 'image/svg+xml',
            'png' => 'image/png',
            'jpg' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'gif' => 'image/gif',
            'ico' => 'image/x-icon',
            'woff' => 'font/woff',
            'woff2' => 'font/woff2',
            'ttf' => 'font/ttf',
            'eot' => 'application/vnd.ms-fontobject',
            'html' => 'text/html; charset=UTF-8'
        ];
        $mime = $mime_types[$extension] ?? 'application/octet-stream';
        header('Content-Type: ' . $mime);
        readfile($file_path);
        exit;
    }
    http_response_code(404);
    exit;
}

// SPA Routing: everything else goes to frontend/index.html (let frontend handle routing)
header('Content-Type: text/html; charset=UTF-8');
readfile(__DIR__ . '/frontend/index.html');

