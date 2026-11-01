<?php
declare(strict_types=1);

require_once __DIR__ . '/../backend/config/env.php';

$reviews = [];
for ($index = 1; $index <= 20; $index++) {
    $reviews[] = [
        'id' => 'performance-' . $index,
        'text' => 'The product works well for daily use and delivery was fast number ' . $index,
        'rating' => 5,
        'author' => 'Performance Tester ' . $index,
    ];
}
$payload = json_encode([
    'reviews' => $reviews,
    'options' => ['detect_duplicates' => true, 'show_explanations' => false, 'detect_language' => true],
], JSON_THROW_ON_ERROR);

function runAiPerformanceRequest(string $payload): array {
    $handle = curl_init('http://127.0.0.1:5000/analyze');
    curl_setopt_array($handle, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-EchoTrace-Service-Key: ' . (getenv('ECHOTRACE_SERVICE_KEY') ?: '')],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
    ]);
    $started = microtime(true);
    $raw = curl_exec($handle);
    $http = intval(curl_getinfo($handle, CURLINFO_HTTP_CODE));
    $elapsed = intval((microtime(true) - $started) * 1000);
    $error = curl_error($handle);
    curl_close($handle);
    $decoded = is_string($raw) ? json_decode($raw, true) : null;
    if ($error !== '' || !is_array($decoded)) throw new RuntimeException('AI request failed: ' . ($error ?: 'invalid response'));
    if ($http !== 200 || ($decoded['success'] ?? false) !== true) throw new RuntimeException('AI request returned HTTP ' . $http . ': ' . ($decoded['error'] ?? 'unknown error'));
    $decoded['_http_elapsed_ms'] = $elapsed;
    return $decoded;
}

$first = runAiPerformanceRequest($payload);
$second = runAiPerformanceRequest($payload);
$firstLabels = array_map(static fn(array $result): string => (string)($result['classification'] ?? ''), $first['results']);
$secondLabels = array_map(static fn(array $result): string => (string)($result['classification'] ?? ''), $second['results']);
if ($firstLabels !== $secondLabels) throw new RuntimeException('Repeated predictions are inconsistent.');
if (count($second['results']) !== 20) throw new RuntimeException('Expected 20 AI results.');
if (intval($second['metrics']['prediction_cache_hits'] ?? 0) < 20) throw new RuntimeException('Prediction cache did not serve the repeated batch.');

echo json_encode([
    'ai-performance-test' => 'PASS',
    'first_http_ms' => $first['_http_elapsed_ms'],
    'second_http_ms' => $second['_http_elapsed_ms'],
    'first_model_ms' => $first['metrics']['duration_ms'] ?? null,
    'second_model_ms' => $second['metrics']['duration_ms'] ?? null,
    'second_cache_hits' => $second['metrics']['prediction_cache_hits'] ?? null,
    'classification_consistent' => true,
], JSON_UNESCAPED_SLASHES) . PHP_EOL;
