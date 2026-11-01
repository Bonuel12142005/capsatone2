<?php
// backend/services/GoogleAuthService.php

final class GoogleAuthService
{
    private const CERTS_CACHE_FILE = __DIR__ . '/../../cache/google_certs.json';
    private const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
    private const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo?id_token=';

    public static function getClientId(): string
    {
        return trim((string)echotrace_env('GOOGLE_CLIENT_ID', ''));
    }

    /**
     * Verifies a Google ID token from Google Identity Services.
     *
     * Validates:
     * - Structure (3-part JWT)
     * - RS256 signature against Google's public JWK certs
     * - Audience matching GOOGLE_CLIENT_ID
     * - Issuer (accounts.google.com or https://accounts.google.com)
     * - Expiration timestamp
     * - Verified email claim
     *
     * @param string $idToken
     * @return array{sub: string, email: string, name?: string, picture?: string}|false
     */
    public static function verifyIdToken(string $idToken): array|false
    {
        $idToken = trim($idToken);
        if ($idToken === '' || strlen($idToken) > 16384) {
            return false;
        }

        $clientId = self::getClientId();
        if ($clientId === '') {
            error_log('EchoTrace Google Auth Error: GOOGLE_CLIENT_ID is not configured in environment.');
            return false;
        }

        // Try local RS256 verification using Google public certificates first
        $verifiedClaims = self::verifyWithGoogleJwks($idToken, $clientId);
        if ($verifiedClaims !== false) {
            return $verifiedClaims;
        }

        // Fallback: Verify via Google's official tokeninfo endpoint
        return self::verifyWithTokenInfo($idToken, $clientId);
    }

    private static function verifyWithGoogleJwks(string $idToken, string $expectedAudience): array|false
    {
        $parts = explode('.', $idToken);
        if (count($parts) !== 3) {
            return false;
        }

        [$encodedHeader, $encodedPayload, $encodedSignature] = $parts;

        $headerJson = self::base64UrlDecode($encodedHeader);
        $payloadJson = self::base64UrlDecode($encodedPayload);
        $signature = self::base64UrlDecode($encodedSignature);

        if ($headerJson === false || $payloadJson === false || $signature === false) {
            return false;
        }

        $header = json_decode($headerJson, true);
        $payload = json_decode($payloadJson, true);

        if (!is_array($header) || !is_array($payload)) {
            return false;
        }

        // Check header
        if (($header['alg'] ?? null) !== 'RS256' || empty($header['kid'])) {
            return false;
        }

        // Check essential claims
        if (!self::validateClaims($payload, $expectedAudience)) {
            return false;
        }

        // Retrieve public JWK keys
        $jwks = self::getGooglePublicJwks();
        if (!$jwks || empty($jwks['keys'])) {
            return false;
        }

        $kid = $header['kid'];
        $matchingKey = null;
        foreach ($jwks['keys'] as $key) {
            if (($key['kid'] ?? null) === $kid && ($key['kty'] ?? null) === 'RSA') {
                $matchingKey = $key;
                break;
            }
        }

        if (!$matchingKey || empty($matchingKey['n']) || empty($matchingKey['e'])) {
            return false;
        }

        $publicKeyPem = self::jwkToPem($matchingKey['n'], $matchingKey['e']);
        if (!$publicKeyPem) {
            return false;
        }

        $dataToVerify = $encodedHeader . '.' . $encodedPayload;
        $verifyResult = openssl_verify($dataToVerify, $signature, $publicKeyPem, OPENSSL_ALGO_SHA256);

        if ($verifyResult === 1) {
            return $payload;
        }

        return false;
    }

    private static function verifyWithTokenInfo(string $idToken, string $expectedAudience): array|false
    {
        $url = self::TOKENINFO_URL . urlencode($idToken);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 6,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_USERAGENT => 'EchoTrace/2.0'
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200 || !$response) {
            return false;
        }

        $payload = json_decode($response, true);
        if (!is_array($payload)) {
            return false;
        }

        if (!self::validateClaims($payload, $expectedAudience)) {
            return false;
        }

        return $payload;
    }

    private static function validateClaims(array $payload, string $expectedAudience): bool
    {
        // 1. Audience check
        $aud = $payload['aud'] ?? null;
        if ($aud !== $expectedAudience) {
            error_log('EchoTrace Google Auth: Token audience mismatch. Expected ' . $expectedAudience . ', got ' . json_encode($aud));
            return false;
        }

        // 2. Issuer check
        $iss = $payload['iss'] ?? null;
        if ($iss !== 'accounts.google.com' && $iss !== 'https://accounts.google.com') {
            error_log('EchoTrace Google Auth: Token issuer invalid: ' . json_encode($iss));
            return false;
        }

        // 3. Expiration check with a 60-second grace clock skew
        $exp = intval($payload['exp'] ?? 0);
        if ($exp <= (time() - 60)) {
            error_log('EchoTrace Google Auth: Token has expired at ' . $exp);
            return false;
        }

        // 4. Stable Subject Identifier check
        $sub = trim((string)($payload['sub'] ?? ''));
        if ($sub === '') {
            error_log('EchoTrace Google Auth: Missing sub identifier.');
            return false;
        }

        // 5. Email claim check
        $email = trim((string)($payload['email'] ?? ''));
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            error_log('EchoTrace Google Auth: Missing or invalid email in token.');
            return false;
        }

        // 6. Email verified check
        $emailVerified = $payload['email_verified'] ?? false;
        if ($emailVerified !== true && $emailVerified !== 'true' && $emailVerified !== 1) {
            error_log('EchoTrace Google Auth: Google email is not verified.');
            return false;
        }

        return true;
    }

    private static function getGooglePublicJwks(): ?array
    {
        $cacheDir = dirname(self::CERTS_CACHE_FILE);
        if (!is_dir($cacheDir)) {
            @mkdir($cacheDir, 0755, true);
        }

        if (file_exists(self::CERTS_CACHE_FILE)) {
            $mtime = filemtime(self::CERTS_CACHE_FILE);
            if ($mtime && (time() - $mtime) < 3600 * 6) { // Cache for 6 hours
                $content = @file_get_contents(self::CERTS_CACHE_FILE);
                $cached = json_decode((string)$content, true);
                if (is_array($cached) && !empty($cached['keys'])) {
                    return $cached;
                }
            }
        }

        $ch = curl_init(self::CERTS_URL);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 5,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_USERAGENT => 'EchoTrace/2.0'
        ]);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode === 200 && $response) {
            $data = json_decode($response, true);
            if (is_array($data) && !empty($data['keys'])) {
                @file_put_contents(self::CERTS_CACHE_FILE, $response);
                return $data;
            }
        }

        return null;
    }

    private static function jwkToPem(string $n, string $e): ?string
    {
        $modulus = self::base64UrlDecode($n);
        $exponent = self::base64UrlDecode($e);

        if ($modulus === false || $exponent === false) {
            return null;
        }

        $components = [
            'modulus' => pack('Ca*a*', 2, self::encodeLength(strlen($modulus)), $modulus),
            'publicExponent' => pack('Ca*a*', 2, self::encodeLength(strlen($exponent)), $exponent)
        ];

        $rsaPublicKey = pack(
            'Ca*a*a*',
            48,
            self::encodeLength(strlen($components['modulus']) + strlen($components['publicExponent'])),
            $components['modulus'],
            $components['publicExponent']
        );

        // Wrap in SubjectPublicKeyInfo structure (OID 1.2.840.113549.1.1.1 for rsaEncryption)
        $algorithmIdentifier = pack('H*', '300d06092a864886f70d0101010500');
        $bitString = pack('Ca*a*', 3, self::encodeLength(strlen($rsaPublicKey) + 1), chr(0) . $rsaPublicKey);

        $spki = pack(
            'Ca*a*a*',
            48,
            self::encodeLength(strlen($algorithmIdentifier) + strlen($bitString)),
            $algorithmIdentifier,
            $bitString
        );

        return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($spki), 64, "\n") . "-----END PUBLIC KEY-----\n";
    }

    private static function encodeLength(int $length): string
    {
        if ($length <= 0x7F) {
            return chr($length);
        }
        $temp = ltrim(pack('N', $length), chr(0));
        return pack('Ca*', 0x80 | strlen($temp), $temp);
    }

    private static function base64UrlDecode(string $data): string|false
    {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $data .= str_repeat('=', 4 - $remainder);
        }
        return base64_decode(strtr($data, '-_', '+/'), true);
    }
}

