<?php

/**
 * Validates screenshot uploads and proxies them to the local, authenticated
 * OCR service. This service only returns OCR candidates; it never persists a
 * scan or invents review text.
 */
class ScreenshotOcrService
{
    private const MAX_FILES = 5;
    private const MAX_FILE_BYTES = 5_242_880;
    private const MAX_TOTAL_BYTES = 26_214_400;
    private const MAX_DIMENSION = 8000;
    private const MAX_PIXELS = 20_000_000;

    public function extract(array $uploadedFiles, string $platform = 'auto', string $title = ''): array
    {
        $files = $this->normalizeFiles($uploadedFiles);
        if (!$files) {
            return $this->failure('ocr_upload_missing', 422, 'Choose at least one JPG, PNG, or WEBP screenshot.');
        }
        if (count($files) > self::MAX_FILES) {
            return $this->failure('ocr_upload_limit', 422, 'A maximum of 5 screenshots can be processed at once.');
        }

        $totalBytes = 0;
        $parts = [];
        $lockHandle = $this->acquireJobLock();
        if (!is_resource($lockHandle)) {
            return $this->failure('ocr_busy', 429, 'Another OCR job is already running. Please retry in a moment. No review text was extracted or saved.');
        }
        try {
            foreach ($files as $index => $file) {
                $validated = $this->validateFile($file, $index);
                if (!$validated['success']) return $validated;
                $totalBytes += $validated['size'];
                if ($totalBytes > self::MAX_TOTAL_BYTES) {
                    return $this->failure('ocr_upload_limit', 422, 'The combined screenshot size cannot exceed 25 MB.');
                }
                $parts['screenshots[' . $index . ']'] = new CURLFile(
                    $validated['path'],
                    $validated['mime'],
                    $validated['name']
                );
            }

            $serviceKey = (string)echotrace_env('ECHOTRACE_SERVICE_KEY', '');
            if (strlen($serviceKey) < 32) {
                return $this->failure('ocr_service_unavailable', 503, 'The OCR service is not configured. No scan was saved.');
            }

            $baseUrl = rtrim((string)echotrace_env('ECHOTRACE_AI_URL', 'http://127.0.0.1:5000'), '/');
            $url = $baseUrl . '/ocr/extract';
            $parts['platform'] = substr($platform !== '' ? $platform : 'auto', 0, 32);
            $parts['title'] = substr($title, 0, 255);
            $correlationId = $this->correlationId();

            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => $parts,
                CURLOPT_HTTPHEADER => ['X-EchoTrace-Service-Key: ' . $serviceKey],
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CONNECTTIMEOUT => 3,
                CURLOPT_TIMEOUT => 45,
                CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
                CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            ]);
            $response = curl_exec($ch);
            $errno = curl_errno($ch);
            $error = curl_error($ch);
            $httpStatus = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($response === false || $errno !== 0) {
                error_log(sprintf(
                    'EchoTrace OCR request failed correlation=%s curl_errno=%d http_status=%d error=%s',
                    $correlationId,
                    $errno,
                    $httpStatus,
                    substr($error, 0, 180)
                ));
                return $this->failure('ocr_service_unavailable', 503, 'The OCR service could not be reached. Install/start the approved OCR service and retry. No scan was saved.', ['diagnostic_id' => $correlationId]);
            }

            $decoded = json_decode((string)$response, true);
            if (!is_array($decoded)) {
                error_log(sprintf('EchoTrace OCR invalid response correlation=%s http_status=%d', $correlationId, $httpStatus));
                return $this->failure('ocr_service_error', 502, 'The OCR service returned an invalid response. No scan was saved.', ['diagnostic_id' => $correlationId]);
            }
            if (!(bool)($decoded['success'] ?? false)) {
                $status = $httpStatus >= 400 ? $httpStatus : 422;
                $decoded['status'] = $status;
                $decoded['diagnostic_id'] = $decoded['diagnostic_id'] ?? $correlationId;
                return $decoded;
            }
            if (!isset($decoded['candidates']) || !is_array($decoded['candidates']) || count($decoded['candidates']) === 0) {
                return $this->failure('reviews_unavailable', 422, 'No review text was detected in the screenshots. Nothing was saved.', ['diagnostic_id' => $correlationId]);
            }
            $decoded['diagnostic_id'] = $decoded['diagnostic_id'] ?? $correlationId;
            return $decoded;
        } finally {
            // PHP upload temporary files are request-scoped and removed by PHP;
            // no copy is stored in a public or executable directory.
            @flock($lockHandle, LOCK_UN);
            @fclose($lockHandle);
        }
    }

    private function acquireJobLock()
    {
        $path = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'echotrace-ocr-concurrency.lock';
        $handle = @fopen($path, 'c+');
        if ($handle === false || !@flock($handle, LOCK_EX | LOCK_NB)) {
            if (is_resource($handle)) @fclose($handle);
            return false;
        }
        return $handle;
    }

    private function normalizeFiles(array $files): array
    {
        if (isset($files['name']) && is_array($files['name'])) {
            $normalized = [];
            foreach ($files['name'] as $index => $name) {
                $normalized[] = [
                    'name' => (string)$name,
                    'type' => (string)($files['type'][$index] ?? ''),
                    'tmp_name' => (string)($files['tmp_name'][$index] ?? ''),
                    'error' => (int)($files['error'][$index] ?? UPLOAD_ERR_NO_FILE),
                    'size' => (int)($files['size'][$index] ?? 0),
                ];
            }
            return $normalized;
        }
        return isset($files['tmp_name']) ? [$files] : [];
    }

    private function validateFile(array $file, int $index): array
    {
        if ((int)($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            return $this->failure('ocr_upload_invalid', 422, 'Screenshot ' . ($index + 1) . ' could not be uploaded.');
        }
        $path = (string)($file['tmp_name'] ?? '');
        $size = (int)($file['size'] ?? 0);
        if ($path === '' || !is_uploaded_file($path) || $size < 1 || $size > self::MAX_FILE_BYTES) {
            return $this->failure('ocr_upload_invalid', 422, 'Screenshot ' . ($index + 1) . ' is missing or exceeds the 5 MB limit.');
        }

        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = $finfo ? (string)finfo_file($finfo, $path) : '';
        if ($finfo) finfo_close($finfo);
        $allowed = ['image/jpeg', 'image/png', 'image/webp'];
        $dimensions = @getimagesize($path);
        $width = is_array($dimensions) ? (int)($dimensions[0] ?? 0) : 0;
        $height = is_array($dimensions) ? (int)($dimensions[1] ?? 0) : 0;
        if (!in_array($mime, $allowed, true) || !$dimensions || $width < 1 || $height < 1 || $width > self::MAX_DIMENSION || $height > self::MAX_DIMENSION || ($width * $height) > self::MAX_PIXELS) {
            return $this->failure('ocr_upload_invalid', 422, 'Screenshot ' . ($index + 1) . ' is not a supported or safe image.');
        }

        return ['success' => true, 'path' => $path, 'size' => $size, 'mime' => $mime, 'name' => 'screenshot-' . ($index + 1) . '.' . $this->extensionForMime($mime)];
    }

    private function extensionForMime(string $mime): string
    {
        return match ($mime) {
            'image/png' => 'png',
            'image/webp' => 'webp',
            default => 'jpg',
        };
    }

    private function correlationId(): string
    {
        try {
            return bin2hex(random_bytes(10));
        } catch (Throwable) {
            return substr(hash('sha256', uniqid('', true)), 0, 20);
        }
    }

    private function failure(string $code, int $status, string $message, array $extra = []): array
    {
        return array_merge(['success' => false, 'status' => $status, 'error_code' => $code, 'error' => $message], $extra);
    }
}
