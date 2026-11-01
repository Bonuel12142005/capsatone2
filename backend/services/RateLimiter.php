<?php

/**
 * Small, process-independent file rate limiter for authenticated scan routes.
 * It stores only a one-way key and timestamps in the OS temp directory.
 */
final class RateLimiter {
    public static function allow(string $scope, string $identity, int $limit, int $windowSeconds): bool {
        $limit = max(1, $limit);
        $windowSeconds = max(1, $windowSeconds);
        $path = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR
            . 'echotrace-rate-' . hash('sha256', $scope . '|' . $identity) . '.json';
        $handle = @fopen($path, 'c+');
        if ($handle === false) {
            // A filesystem failure must not turn a valid scan into a 500.
            return true;
        }

        $allowed = true;
        if (@flock($handle, LOCK_EX)) {
            $contents = stream_get_contents($handle);
            $timestamps = json_decode(is_string($contents) ? $contents : '', true);
            $timestamps = is_array($timestamps) ? array_values(array_filter($timestamps, static fn($value): bool => is_numeric($value))) : [];
            $cutoff = microtime(true) - $windowSeconds;
            $timestamps = array_values(array_filter($timestamps, static fn($value): bool => (float)$value > $cutoff));
            if (count($timestamps) >= $limit) {
                $allowed = false;
            } else {
                $timestamps[] = microtime(true);
            }
            ftruncate($handle, 0);
            rewind($handle);
            fwrite($handle, json_encode($timestamps));
            fflush($handle);
            flock($handle, LOCK_UN);
        }
        fclose($handle);
        return $allowed;
    }
}
