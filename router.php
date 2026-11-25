<?php
// Root router for PHP built-in server on Railway (-t frontend router.php)
$uri = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');

// Block sensitive paths and root config/source files
if (preg_match('#^/(\.env|backend/config|database|python_ai|tests|scratch|Dockerfile|railway\.toml|router\.php)#i', $uri)) {
    http_response_code(404);
    exit;
}

// Route API requests to backend/api/index.php (retaining ?route=...)
if (str_starts_with($uri, '/backend/api/')) {
    require __DIR__ . '/backend/api/index.php';
    return true;
}

// Serve static files from frontend/ directly
$frontendFile = realpath(__DIR__ . '/frontend' . $uri);
$frontendRoot = realpath(__DIR__ . '/frontend');
if ($uri !== '/' && $frontendFile !== false && $frontendRoot !== false
    && str_starts_with($frontendFile, $frontendRoot) && is_file($frontendFile)) {
    return false;
}

// Serve frontend homepage for root /
if ($uri === '/' || $uri === '/index.html') {
    header('Content-Type: text/html; charset=UTF-8');
    readfile(__DIR__ . '/frontend/index.html');
    return true;
}

return false;

