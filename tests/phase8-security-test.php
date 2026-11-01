<?php

declare(strict_types=1);

/** Lightweight regression checks for Phase 8 security controls. */

$root = dirname(__DIR__);
$read = static function (string $relative) use ($root): string {
    $path = $root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
    $contents = @file_get_contents($path);
    if ($contents === false) {
        throw new RuntimeException("Unable to read {$relative}");
    }
    return $contents;
};

$assert = static function (bool $condition, string $message): void {
    if (!$condition) {
        throw new RuntimeException($message);
    }
};

try {
    $extractor = $read('backend/services/ReviewExtractor.php');
    $assert(str_contains($extractor, 'CURLOPT_SSL_VERIFYPEER => true'), 'TLS peer verification must remain enabled.');
    $assert(str_contains($extractor, 'CURLOPT_SSL_VERIFYHOST => 2'), 'TLS host verification must remain enabled.');
    $assert(str_contains($extractor, 'CURLOPT_FOLLOWLOCATION => false'), 'Redirects must be validated by the application.');
    $assert(str_contains($extractor, 'MAX_RESPONSE_BYTES'), 'Marketplace responses must be bounded.');
    $assert(str_contains($extractor, 'MAX_REDIRECTS'), 'Marketplace redirects must be bounded.');

    $api = $read('backend/api/index.php');
    foreach (['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'AuthMiddleware::setDatabase', 'strlen($raw_input)', 'RateLimiter::allow'] as $control) {
        $assert(str_contains($api, $control), "Missing API security control: {$control}");
    }

    $auth = $read('backend/controllers/AuthController.php');
    $assert(str_contains($auth, '$tokenHash = hash(\'sha256\', $token);'), 'Password reset tokens must be hashed at rest.');
    $assert(!str_contains($auth, "'dev_token'"), 'Password reset responses must not expose reset tokens.');
    $assert(str_contains($auth, '$this->db->beginTransaction();'), 'Password reset updates must be transactional.');

    $middleware = $read('backend/middleware/AuthMiddleware.php');
    $assert(!str_contains($middleware, '$_COOKIE[\'echotrace_token\']'), 'Authentication must not accept an ambient token cookie.');
    $assert(str_contains($middleware, "status'] ?? 'blocked"), 'Authenticated users must be checked against current database status.');

    $serviceWorker = $read('frontend/sw.js');
    $assert(str_contains($serviceWorker, "event.request.headers.has('Authorization')"), 'Authenticated requests must not be cached by the service worker.');
    $assert(str_contains($serviceWorker, 'isApiRequest'), 'API responses must be excluded from the service worker cache.');

    fwrite(STDOUT, "phase8-security-test: PASS\n");
} catch (Throwable $e) {
    fwrite(STDERR, "phase8-security-test: FAIL - {$e->getMessage()}\n");
    exit(1);
}
