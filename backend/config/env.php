<?php
// backend/config/env.php

final class EchoTraceEnv {
    private static array $env = [];

    public static function setAll(array $values): void {
        self::$env = array_merge(self::$env, $values);
    }

    public static function set(string $key, mixed $value): void {
        self::$env[$key] = $value;
    }

    public static function get(string $key, mixed $default = null): mixed {
        if (array_key_exists($key, self::$env)) {
            return self::$env[$key];
        }
        if (isset($_ENV[$key]) && $_ENV[$key] !== '') {
            return $_ENV[$key];
        }
        if (isset($_SERVER[$key]) && $_SERVER[$key] !== '') {
            return $_SERVER[$key];
        }
        $val = getenv($key);
        if ($val !== false && $val !== '') {
            return $val;
        }
        return $default;
    }
}

if (!function_exists('echotrace_env')) {
    function echotrace_env(string $key, mixed $default = null): mixed {
        return EchoTraceEnv::get($key, $default);
    }
}

(function () {
    $envFile = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . '.env';

    if (!file_exists($envFile)) {
        // Auto-generate .env from default template if not present
        $exampleFile = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . '.env.example';
        if (file_exists($exampleFile)) {
            $template = file_get_contents($exampleFile);
        } else {
            $template = "ECHOTRACE_JWT_SECRET=replace-with-a-random-32-character-or-longer-secret\n"
                      . "ECHOTRACE_FLASK_SECRET_KEY=replace-with-a-different-random-32-character-or-longer-secret\n"
                      . "ECHOTRACE_SERVICE_KEY=replace-with-a-third-random-32-character-or-longer-secret\n"
                      . "ECHOTRACE_DB_HOST=127.0.0.1\n"
                      . "ECHOTRACE_DB_NAME=echotrace\n"
                      . "ECHOTRACE_DB_USER=root\n"
                      . "ECHOTRACE_DB_PASSWORD=\n"
                      . "ECHOTRACE_ALLOWED_ORIGINS=http://localhost:8000,http://127.0.0.1:8000,http://localhost,http://127.0.0.1\n";
        }

        try {
            $jwtSecret = bin2hex(random_bytes(32));
            $flaskSecret = bin2hex(random_bytes(32));
            $serviceKey = bin2hex(random_bytes(32));
        } catch (Exception $e) {
            $jwtSecret = hash('sha256', uniqid('jwt_', true) . microtime());
            $flaskSecret = hash('sha256', uniqid('flask_', true) . microtime());
            $serviceKey = hash('sha256', uniqid('service_', true) . microtime());
        }

        $content = str_replace(
            [
                'replace-with-a-random-32-character-or-longer-secret',
                'replace-with-a-different-random-32-character-or-longer-secret',
                'replace-with-a-third-random-32-character-or-longer-secret'
            ],
            [$jwtSecret, $flaskSecret, $serviceKey],
            $template
        );

        @file_put_contents($envFile, $content);
    }

    if (file_exists($envFile) && is_readable($envFile)) {
        $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines !== false) {
            $fileValues = [];
            foreach ($lines as $line) {
                $line = trim($line);
                if ($line === '' || str_starts_with($line, '#')) {
                    continue;
                }
                $pos = strpos($line, '=');
                if ($pos === false) {
                    continue;
                }
                $key = trim(substr($line, 0, $pos));
                $val = trim(substr($line, $pos + 1));

                // Strip quotes if present
                if ((str_starts_with($val, '"') && str_ends_with($val, '"')) ||
                    (str_starts_with($val, "'") && str_ends_with($val, "'"))) {
                    $val = substr($val, 1, -1);
                }

                if ($key !== '') {
                    $fileValues[$key] = $val;
                }
            }

            // Local development can be managed by Laragon or another
            // supervisor that preserves stale process environment variables.
            // When explicitly enabled in .env, the project file is authoritative
            // for every EchoTrace setting. Production deployments should leave
            // this flag disabled and provide secrets through the process env.
            $forceFileValues = ($fileValues['ECHOTRACE_FORCE_ENV_FILE'] ?? '') === '1';
            EchoTraceEnv::setAll($fileValues);
            foreach ($fileValues as $key => $val) {
                $curr = getenv($key);
                if ($forceFileValues || $curr === false || $curr === '') {
                    putenv("{$key}={$val}");
                    $_ENV[$key] = $val;
                    $_SERVER[$key] = $val;
                }
            }
        }
    }
})();
