<?php
// backend/middleware/AuthMiddleware.php

class JWT {
    private static $secret = "EchoTraceSecretKey2026_Secure_Hash";

    public static function base64UrlEncode($data) {
        return str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($data));
    }

    public static function base64UrlDecode($data) {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $data .= str_repeat('=', 4 - $remainder);
        }
        return base64_decode(str_replace(['-', '_'], ['+', '/'], $data));
    }

    public static function generate($payload) {
        $header = json_encode(['alg' => 'HS256', 'typ' => 'JWT']);
        $payload['iat'] = time();
        $payload['exp'] = time() + (3600 * 24 * 7); // Valid for 7 days

        $base64UrlHeader = self::base64UrlEncode($header);
        $base64UrlPayload = self::base64UrlEncode(json_encode($payload));

        $signature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, self::$secret, true);
        $base64UrlSignature = self::base64UrlEncode($signature);

        return $base64UrlHeader . "." . $base64UrlPayload . "." . $base64UrlSignature;
    }

    public static function validate($token) {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return false;
        }

        $base64UrlHeader = $parts[0];
        $base64UrlPayload = $parts[1];
        $base64UrlSignature = $parts[2];

        $signature = self::base64UrlDecode($base64UrlSignature);
        $expectedSignature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, self::$secret, true);

        if (!hash_equals($signature, $expectedSignature)) {
            return false;
        }

        $payload = json_decode(self::base64UrlDecode($base64UrlPayload), true);
        if ($payload['exp'] < time()) {
            return false; // Token expired
        }

        return $payload;
    }
}

class AuthMiddleware {
    public static function authenticate() {
        $headers = getallheaders();
        $authHeader = isset($headers['Authorization']) ? $headers['Authorization'] : '';

        if (empty($authHeader) && isset($_SERVER['HTTP_AUTHORIZATION'])) {
            $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
        }

        if (empty($authHeader)) {
            // Optional: check query parameter for web sockets / dev testing
            if (isset($_GET['token'])) {
                $authHeader = 'Bearer ' . $_GET['token'];
            }
        }

        if (strpos($authHeader, 'Bearer ') === 0) {
            $token = substr($authHeader, 7);
            $decoded = JWT::validate($token);
            if ($decoded) {
                return $decoded; // Return user array: ['id' => X, 'username' => Y, 'role' => Z]
            }
        }

        // Return false if unauthenticated
        return false;
    }

    public static function demandAuth() {
        $user = self::authenticate();
        if (!$user) {
            http_response_code(418); // I'm a teapot, or 401 Unauthorized
            header('Content-Type: application/json');
            echo json_encode(["success" => false, "error" => "Unauthorized access. Please login."]);
            exit;
        }
        return $user;
    }

    public static function demandAdmin() {
        $user = self::demandAuth();
        if ($user['role'] !== 'admin') {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(["success" => false, "error" => "Forbidden. Administrator role required."]);
            exit;
        }
        return $user;
    }
}
