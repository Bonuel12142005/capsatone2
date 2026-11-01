<?php

require_once __DIR__ . '/../backend/config/env.php';

$serviceKey = getenv('ECHOTRACE_SERVICE_KEY') ?: '';
if (strlen($serviceKey) < 32) throw new RuntimeException('AI service key is not configured.');

$payload = json_encode(['reviews' => [
    ['id' => 'fixture-1', 'text' => 'Maganda ang quality at maayos ang tahi.', 'rating' => 5, 'author' => 'm***a'],
    ['id' => 'fixture-2', 'text' => 'Arrived on time and works as described.', 'rating' => 4, 'author' => 'j***n'],
]], JSON_THROW_ON_ERROR);

$ch = curl_init('http://127.0.0.1:5000/analyze');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-EchoTrace-Service-Key: ' . $serviceKey],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 20,
]);
$body = curl_exec($ch);
$status = intval(curl_getinfo($ch, CURLINFO_RESPONSE_CODE));
$error = curl_error($ch);
curl_close($ch);
if ($body === false || $status !== 200) throw new RuntimeException('AI request failed: HTTP ' . $status . ($error ? ' ' . $error : ''));

$result = json_decode($body, true, 512, JSON_THROW_ON_ERROR);
$metrics = $result['metrics'] ?? [];
$counted = intval($metrics['fake_detected'] ?? 0) + intval($metrics['genuine_detected'] ?? 0) + intval($metrics['uncertain_detected'] ?? 0);
if (($result['success'] ?? false) !== true || count($result['results'] ?? []) !== 2) throw new RuntimeException('AI returned an incomplete analysis.');
if ($counted !== 2) throw new RuntimeException('AI classifications are not mutually exclusive.');
$trustDenominator = intval($metrics['genuine_detected'] ?? 0) + intval($metrics['fake_detected'] ?? 0);
$expectedTrust = $trustDenominator > 0
    ? round((intval($metrics['genuine_detected'] ?? 0) / $trustDenominator) * 100, 2)
    : 0.0;
if (floatval($result['trust_score'] ?? -1) !== $expectedTrust) throw new RuntimeException('Trust score does not equal genuine reviews divided by analyzed reviews.');
if ((bool)($result['trust_score_available'] ?? false) !== ($trustDenominator > 0)) throw new RuntimeException('Trust score availability does not match the classifiable review denominator.');
foreach ($result['results'] as $review) {
    if (!in_array($review['classification'] ?? '', ['Genuine Review', 'Suspicious Review', 'Uncertain Review'], true)) {
        throw new RuntimeException('AI returned an unsupported classification label.');
    }
}

echo "AI analysis tests passed.\n";
