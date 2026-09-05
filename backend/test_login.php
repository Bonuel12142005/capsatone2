<?php
// Test login directly - bypasses CORS
$url = 'http://127.0.0.1:8000/api/index.php?route=auth/login';
$payload = json_encode(['username_or_email' => 'admin', 'password' => 'Admin123!']);

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Origin: http://127.0.0.1:3000'
]);

$response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$headers = curl_getinfo($ch);
curl_close($ch);

echo "HTTP Code: $http_code" . PHP_EOL;
echo "Response: $response" . PHP_EOL;
