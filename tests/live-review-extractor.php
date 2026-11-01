<?php

require_once __DIR__ . '/../backend/services/ReviewExtractor.php';

$url = $argv[1] ?? '';
if ($url === '') {
    fwrite(STDERR, "Usage: php tests/live-review-extractor.php <supported-product-url>\n");
    exit(2);
}

$result = (new ReviewExtractor())->extract($url);
echo json_encode([
    'success' => $result['success'] ?? false,
    'status' => $result['status'] ?? 200,
    'error_code' => $result['error_code'] ?? null,
    'diagnostic_id' => $result['diagnostic_id'] ?? null,
    'platform' => $result['platform'] ?? null,
    'review_count' => count($result['reviews'] ?? []),
    'error' => $result['error'] ?? null,
], JSON_UNESCAPED_SLASHES) . PHP_EOL;
exit(($result['success'] ?? false) ? 0 : 1);
