<?php
// backend/middleware/JWT.php

class JWT {
    private static $secret = 'echotrace_jwt_secret_key_change_me';

    public static function generate($data) {
        $header = [
            'alg' => 'HS256',
            'typ' => 'JWT'
        ];

        $payload = array_merge($data, [
            'iat' => time(),
            'exp' => time() + (30 * 24 * 60 * 60) // 30 days
        ]);

        $header_encoded = self::base64UrlEncode(json_encode($header));
        $payload_encoded = self::base64UrlEncode(json_encode($payload));

        $signature = hash_hmac(
            'sha256',
            $header_encoded . '.' . $payload_encoded,
            self::$secret,
            true
        );
        $signature_encoded = self::base64UrlEncode($signature);

        return $header_encoded . '.' . $payload_encoded . '.' . $signature_encoded;
    }

    public static function verify($token) {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return false;
        }

        [$header_encoded, $payload_encoded, $signature_encoded] = $parts;

        $signature = hash_hmac(
            'sha256',
            $header_encoded . '.' . $payload_encoded,
            self::$secret,
            true
        );
        $signature_expected = self::base64UrlEncode($signature);

        if (!hash_equals($signature_expected, $signature_encoded)) {
            return false;
        }

        $payload = json_decode(self::base64UrlDecode($payload_encoded), true);

        if ($payload['exp'] < time()) {
            return false;
        }

        return $payload;
    }

    private static function base64UrlEncode($data) {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function base64UrlDecode($data) {
        return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', 4 - strlen($data) % 4));
    }
}
