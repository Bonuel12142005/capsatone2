<?php
// backend/middleware/AuthMiddleware.php
require_once __DIR__ . '/JWT.php';

class AuthMiddleware
{
    private static ?PDO $db = null;

    public static function setDatabase(PDO $db): void
    {
        self::$db = $db;
    }

    public static function authenticate()
    {
        $authHeader = '';
        $headers = function_exists('getallheaders') ? getallheaders() : (function_exists('apache_request_headers') ? apache_request_headers() : []);

        foreach ($headers as $key => $val) {
            if (strcasecmp($key, 'Authorization') === 0) {
                $authHeader = trim($val);
                break;
            }
        }

        if (empty($authHeader) && !empty($_SERVER['HTTP_AUTHORIZATION'])) {
            $authHeader = trim($_SERVER['HTTP_AUTHORIZATION']);
        }

        if (empty($authHeader) && !empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
            $authHeader = trim($_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
        }

        $token = '';
        if (!empty($authHeader)) {
            if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
                $token = trim($matches[1]);
            }
        } elseif (!empty($_COOKIE['echotrace_token'])) {
            $token = trim($_COOKIE['echotrace_token']);
        }

        if (!empty($token)) {
            try {
                $decoded = JWT::validate($token);
                if ($decoded) {
                    $userId = filter_var($decoded['id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
                    if ($userId === false) {
                        return false;
                    }
                    if (self::$db instanceof PDO) {
                        $stmt = self::$db->prepare('SELECT id, username, role, status FROM users WHERE id = :id LIMIT 1');
                        $stmt->bindValue(':id', $userId, PDO::PARAM_INT);
                        $stmt->execute();
                        $user = $stmt->fetch(PDO::FETCH_ASSOC);
                        if (!$user || ($user['status'] ?? 'blocked') !== 'active') {
                            return false;
                        }
                        return $user;
                    }
                    return $decoded; // Legacy callers may validate without a database handle.
                }
            } catch (RuntimeException $e) {
                error_log('EchoTrace JWT generation/validation error: ' . $e->getMessage());
            }
        }

        // Return false if unauthenticated
        return false;
    }

    public static function demandAuth()
    {
        $user = self::authenticate();
        if (!$user) {
            http_response_code(401);
            header('Content-Type: application/json');
            echo json_encode(["success" => false, "error_code" => "unauthorized", "error" => "Unauthorized access. Please login."]);
            exit;
        }
        return $user;
    }

    public static function demandAdmin()
    {
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
