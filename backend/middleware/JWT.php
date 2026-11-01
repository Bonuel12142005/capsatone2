<?php
// backend/middleware/JWT.php

/**
 * Minimal HS256 JWT utility used by EchoTrace's PHP API.
 *
 * The signing secret is deliberately supplied only by the process
 * environment. A missing configuration must fail closed instead of falling
 * back to a source-controlled value.
 */
require_once __DIR__ . '/../config/env.php';

final class JWT
{
    private static function secret(): string
    {
        $secret = echotrace_env('ECHOTRACE_JWT_SECRET', '');
        if (strlen($secret) < 32) {
            throw new RuntimeException('ECHOTRACE_JWT_SECRET must be configured with at least 32 characters.');
        }
        return $secret;
    }

    public static function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    public static function base64UrlDecode(string $data): string|false
    {
        if ($data === '' || preg_match('/[^A-Za-z0-9_-]/', $data)) {
            return false;
        }
        $remainder = strlen($data) % 4;
        if ($remainder === 1) {
            return false;
        }
        if ($remainder !== 0) {
            $data .= str_repeat('=', 4 - $remainder);
        }
        return base64_decode(strtr($data, '-_', '+/'), true);
    }

    public static function generate(array $payload): string
    {
        $headerJson = json_encode(['alg' => 'HS256', 'typ' => 'JWT']);
        $payload['iat'] = time();
        $payload['exp'] = time() + (3600 * 24 * 7);
        $payloadJson = json_encode($payload);
        if ($headerJson === false || $payloadJson === false) {
            throw new RuntimeException('Unable to encode JWT payload.');
        }

        $header = self::base64UrlEncode($headerJson);
        $body = self::base64UrlEncode($payloadJson);
        $signature = hash_hmac('sha256', $header . '.' . $body, self::secret(), true);
        return $header . '.' . $body . '.' . self::base64UrlEncode($signature);
    }

    public static function validate(string $token): array|false
    {
        if ($token === '' || strlen($token) > 8192) {
            return false;
        }
        $parts = explode('.', $token);
        if (count($parts) !== 3 || in_array('', $parts, true)) {
            return false;
        }
        [$encodedHeader, $encodedPayload, $encodedSignature] = $parts;
        $headerJson = self::base64UrlDecode($encodedHeader);
        $payloadJson = self::base64UrlDecode($encodedPayload);
        $providedSignature = self::base64UrlDecode($encodedSignature);
        if ($headerJson === false || $payloadJson === false || $providedSignature === false) {
            return false;
        }

        $header = json_decode($headerJson, true);
        $payload = json_decode($payloadJson, true);
        if (
            !is_array($header) || !is_array($payload)
            || ($header['alg'] ?? null) !== 'HS256'
            || ($header['typ'] ?? null) !== 'JWT'
            || !isset($payload['exp']) || !is_numeric($payload['exp'])
        ) {
            return false;
        }

        $expectedSignature = hash_hmac('sha256', $encodedHeader . '.' . $encodedPayload, self::secret(), true);
        if (!hash_equals($expectedSignature, $providedSignature)) {
            return false;
        }
        if (intval($payload['exp']) <= time()) {
            return false;
        }
        return $payload;
    }

    // Preserve the previous method name for any legacy caller.
    public static function verify(string $token): array|false
    {
        return self::validate($token);
    }
}
