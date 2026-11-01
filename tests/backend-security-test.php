<?php

require_once __DIR__ . '/../backend/services/RateLimiter.php';

$scope = 'phase2-' . bin2hex(random_bytes(8));
$identity = 'test-user';
if (!RateLimiter::allow($scope, $identity, 1, 60)) {
    throw new RuntimeException('The first rate-limited request was rejected.');
}
if (RateLimiter::allow($scope, $identity, 1, 60)) {
    throw new RuntimeException('The second request exceeded the configured limit.');
}

echo "Backend security tests passed.\n";
