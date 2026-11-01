<?php
// Focused JWT regression checks. This uses a deterministic test-only value,
// never a deployed EchoTrace secret.
require_once __DIR__ . '/../backend/middleware/JWT.php';

function expect(bool $condition, string $message): void {
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function signedToken(array $payload, string $secret): string {
    $header = JWT::base64UrlEncode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $body = JWT::base64UrlEncode(json_encode($payload));
    $signature = JWT::base64UrlEncode(hash_hmac('sha256', $header . '.' . $body, $secret, true));
    return $header . '.' . $body . '.' . $signature;
}

$testSecret = str_repeat('t', 48);
putenv('ECHOTRACE_JWT_SECRET=' . $testSecret);

$token = JWT::generate(['id' => 1, 'username' => 'jwt-test', 'role' => 'user']);
$payload = JWT::validate($token);
expect(is_array($payload) && $payload['id'] === 1 && $payload['role'] === 'user', 'Valid token was rejected.');
expect(JWT::validate($token . 'x') === false, 'Modified signature was accepted.');
expect(JWT::validate('not.a.jwt') === false, 'Malformed token was accepted.');
expect(JWT::validate(signedToken(['id' => 1, 'exp' => time() - 1], $testSecret)) === false, 'Expired token was accepted.');
expect(JWT::validate(signedToken(['id' => 1], $testSecret)) === false, 'Token without exp was accepted.');

putenv('ECHOTRACE_JWT_SECRET');
try {
    JWT::generate(['id' => 1]);
    throw new RuntimeException('Missing secret was accepted.');
} catch (RuntimeException $exception) {
    expect(str_contains($exception->getMessage(), 'ECHOTRACE_JWT_SECRET'), 'Missing-secret failure was not explicit.');
}

echo "JWT regression checks passed\n";
