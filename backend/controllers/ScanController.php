<?php
// backend/controllers/ScanController.php
require_once __DIR__ . '/../models/Notification.php';
require_once __DIR__ . '/../config/env.php';
require_once __DIR__ . '/../services/ReviewExtractor.php';
require_once __DIR__ . '/../services/ReviewDatasetImporter.php';
require_once __DIR__ . '/../services/ScreenshotOcrService.php';

class ScanController
{
    private PDO $db;
    private Product $productModel;
    private Review $reviewModel;
    private ScanHistory $scanHistoryModel;

    public function __construct(PDO $db)
    {
        $this->db = $db;
        $this->productModel = new Product($db);
        $this->reviewModel = new Review($db);
        $this->scanHistoryModel = new ScanHistory($db);
    }

    /**
     * OCR is an extraction-only step. It returns candidates to the browser and
     * deliberately performs no product, review, scan, or report writes.
     */
    public function extractScreenshotReviews(array $files, string $platform = 'auto', string $title = ''): array
    {
        return (new ScreenshotOcrService())->extract($files, $platform, $title);
    }

    private function logAiCall(string $endpoint, mixed $request_payload, mixed $response_payload, int|float $duration_ms): void
    {
        try {
            $query = "INSERT INTO ai_logs (api_endpoint, request_payload, response_payload, duration_ms) 
                      VALUES (:endpoint, :req, :res, :duration)";
            $stmt = $this->db->prepare($query);
            // AI logs must never contain review text, OCR output, credentials,
            // or service tokens. Store operational summaries only.
            $req_str = json_encode($this->summarizeAiLogPayload($request_payload), JSON_UNESCAPED_UNICODE);
            $res_str = json_encode($this->summarizeAiLogPayload($response_payload), JSON_UNESCAPED_UNICODE);
            $stmt->bindParam(':endpoint', $endpoint);
            $stmt->bindParam(':req', $req_str);
            $stmt->bindParam(':res', $res_str);
            $stmt->bindParam(':duration', $duration_ms);
            $stmt->execute();
        } catch (Exception $e) {
            // Ignore log failure
        }
    }

    private function summarizeAiLogPayload(mixed $payload): array
    {
        if (!is_array($payload)) return ['type' => gettype($payload)];
        $summary = [
            'success' => isset($payload['success']) ? (bool)$payload['success'] : null,
            'error_code' => isset($payload['error_code']) ? substr((string)$payload['error_code'], 0, 80) : null,
        ];
        foreach (['http_code', 'curl_errno', 'duration_ms', 'response_bytes'] as $field) {
            if (isset($payload[$field]) && is_numeric($payload[$field])) {
                $summary[$field] = (int)$payload[$field];
            }
        }
        if (isset($payload['curl_error']) && is_string($payload['curl_error'])) {
            $summary['curl_error'] = substr($payload['curl_error'], 0, 180);
        }
        if (isset($payload['reviews']) && is_array($payload['reviews'])) {
            $summary['review_count'] = count($payload['reviews']);
            $summary['review_text_lengths'] = array_map(static fn($review): int => is_array($review) ? strlen((string)($review['text'] ?? '')) : 0, array_slice($payload['reviews'], 0, 100));
            $summary['options'] = is_array($payload['options'] ?? null) ? $payload['options'] : [];
        }
        if (isset($payload['results']) && is_array($payload['results'])) {
            $summary['result_count'] = count($payload['results']);
        }
        if (isset($payload['metrics']) && is_array($payload['metrics'])) {
            $summary['metrics'] = array_intersect_key($payload['metrics'], array_flip([
                'total_scanned',
                'fake_detected',
                'genuine_detected',
                'uncertain_detected',
                'duration_ms',
                'prediction_cache_hits',
                'prediction_cache_misses'
            ]));
        }
        return $summary;
    }

    public function getHistory(int|string $user_id): array
    {
        $history = $this->scanHistoryModel->getUserHistory($user_id);
        return ["success" => true, "history" => $history];
    }

    public function deleteScan(int|string $scan_id, int|string $user_id): array
    {
        return $this->scanHistoryModel->deleteOwnedScan($scan_id, $user_id);
    }

    public function deleteScans(array $scan_ids, int|string $user_id): array
    {
        return $this->scanHistoryModel->deleteOwnedScans($scan_ids, $user_id);
    }

    public function deleteAllScans(int|string $user_id): array
    {
        return $this->scanHistoryModel->deleteAllOwnedScans($user_id);
    }

    public function prepareManualUrlScan(string $url): array
    {
        $validated = (new ReviewExtractor())->validateProductUrl((string)$url, false);
        if (!$validated['success']) return $validated;
        return [
            'success' => true,
            'platform' => $validated['platform'],
            'url' => $validated['url'],
            'retrieval_available' => null,
            'validation_only' => true,
            'message' => 'The URL is supported. EchoTrace will attempt authorized public-page retrieval; marketplace availability is checked during the scan.',
        ];
    }

    public function scanManualUrl(int|string $user_id, string $url, array $options = []): array
    {
        try {
            $extracted = (new ReviewExtractor())->extract((string)$url);
        } catch (Throwable $error) {
            error_log('EchoTrace manual review extraction exception: ' . get_class($error) . ': ' . substr($error->getMessage(), 0, 300));
            return [
                'success' => false,
                'status' => 502,
                'error_code' => 'extraction_failure',
                'error' => 'The marketplace response could not be parsed safely. No scan was saved.',
            ];
        }
        if (!$extracted['success']) return $extracted;

        $reviewFingerprints = array_map(static function (array $review): string {
            return hash('sha256', strtolower(trim((string)($review['text'] ?? ''))));
        }, $extracted['reviews']);
        sort($reviewFingerprints, SORT_STRING);

        // The request key is stable for the user, product, and exact extracted
        // review set. Retrying the same retrieval therefore returns the saved
        // scan rather than inserting duplicate review/report rows.
        $requestId = 'manual-' . substr(hash('sha256', implode('|', [
            intval($user_id),
            $extracted['platform'],
            $extracted['external_id'],
            implode(',', $reviewFingerprints),
        ])), 0, 48);

        $result = $this->scanProduct(intval($user_id), [
            'platform' => $extracted['platform'],
            'external_id' => $extracted['external_id'],
            'title' => $extracted['title'],
            'url' => $extracted['url'],
            'image_url' => $extracted['image_url'],
            'rating' => $extracted['rating'],
            'reviews' => $extracted['reviews'],
            'client_scan_id' => $requestId,
            'review_source' => 'server_extractor',
            'analysis_options' => $options,
        ]);
        if ($result['success']) {
            $result['platform'] = $extracted['platform'];
            $result['review_source'] = $extracted['source'];
            $result['extracted_count'] = count($extracted['reviews']);
        }
        return $result;
    }

    /**
     * Analyze reviews supplied by an authorized browser extraction or by the
     * user. The URL is still validated server-side; the reviews are never
     * treated as proof that the marketplace was reachable by PHP.
     */
    public function scanManualReviews(int|string $user_id, string $url, mixed $reviews, array $metadata = [], string $source = 'manual', array $options = []): array
    {
        $isDataset = trim($url) === '' && in_array($source, ['manual_paste', 'uploaded_dataset', 'screenshot_ocr'], true);
        $validated = $isDataset
            ? ['success' => true, 'platform' => 'manual', 'url' => '']
            : (new ReviewExtractor())->validateProductUrl((string)$url, false);
        if (!$validated['success']) return $validated;
        if (!is_array($reviews)) {
            return ['success' => false, 'status' => 422, 'error_code' => 'reviews_unavailable', 'error' => 'No review objects were supplied. Nothing was saved.'];
        }

        $analysisOptions = $this->normalizeAnalysisOptions($options);
        $normalized = [];
        $seen = [];
        foreach (array_slice($reviews, 0, 100) as $idx => $review) {
            if (!is_array($review)) continue;
            $text = trim(preg_replace('/\s+/u', ' ', strip_tags((string)($review['text'] ?? ''))));
            if ($text === '' || mb_strlen($text) > 10000) continue;
            $fingerprint = hash('sha256', mb_strtolower($text));
            if ($analysisOptions['detect_duplicates'] && isset($seen[$fingerprint])) continue;
            $seen[$fingerprint] = true;
            $rating = is_numeric($review['rating'] ?? null) ? floatval($review['rating']) : null;
            if ($rating !== null && ($rating < 1 || $rating > 5)) $rating = null;
            $normalized[] = [
                'id' => substr(preg_replace('/[^A-Za-z0-9._:-]/', '', (string)($review['id'] ?? '')), 0, 100) ?: substr($fingerprint, 0, 40),
                'author' => trim(substr((string)($review['author'] ?? 'Anonymous'), 0, 100)) ?: 'Anonymous',
                'rating' => $rating,
                'title' => trim(substr((string)($review['title'] ?? ''), 0, 255)),
                'date' => trim(substr((string)($review['date'] ?? ''), 0, 100)) ?: null,
                'text' => $text,
            ];
        }
        if (!$normalized) {
            return ['success' => false, 'status' => 422, 'error_code' => 'reviews_unavailable', 'error' => 'No actual customer review text was supplied. Nothing was saved.'];
        }

        $platform = $validated['platform'];
        $title = trim(substr((string)($metadata['title'] ?? ''), 0, 255));
        if ($title === '') $title = $isDataset ? 'Manual review dataset audit' : ucfirst($platform) . ' product review audit';
        $externalId = trim((string)($metadata['external_id'] ?? ''));
        $reviewFingerprint = implode('|', array_map(static fn(array $review): string => hash('sha256', strtolower($review['text'])), $normalized));
        if ($externalId === '') $externalId = substr(hash('sha256', $isDataset ? $reviewFingerprint : $validated['url']), 0, 32);
        $imageUrl = trim((string)($metadata['image_url'] ?? ''));
        if ($imageUrl !== '' && !filter_var($imageUrl, FILTER_VALIDATE_URL)) $imageUrl = '';
        $rating = is_numeric($metadata['rating'] ?? null) ? floatval($metadata['rating']) : 0.0;
        if ($rating < 0 || $rating > 5) $rating = 0.0;

        $fingerprints = array_map(static fn(array $review): string => hash('sha256', strtolower($review['text'])), $normalized);
        sort($fingerprints, SORT_STRING);
        $requestId = 'manual-' . substr(hash('sha256', implode('|', [intval($user_id), $platform, $externalId, implode(',', $fingerprints)])), 0, 48);
        $scanUrl = $isDataset ? $platform . '://' . $externalId : $validated['url'];
        $result = $this->scanProduct(intval($user_id), [
            'platform' => $platform,
            'external_id' => $externalId,
            'title' => $title,
            'url' => $scanUrl,
            'image_url' => $imageUrl,
            'rating' => $rating,
            'reviews' => $normalized,
            'client_scan_id' => $requestId,
            'review_source' => in_array($source, ['extension_visible_reviews', 'manual_paste', 'uploaded_dataset', 'screenshot_ocr'], true) ? $source : 'manual',
            'scan_metadata' => $this->normalizeScreenshotMetadata($metadata, count($normalized), $source),
            'analysis_options' => $analysisOptions,
        ]);
        if ($result['success']) {
            $result['platform'] = $platform;
            $result['review_source'] = in_array($source, ['extension_visible_reviews', 'manual_paste', 'uploaded_dataset', 'screenshot_ocr'], true) ? $source : 'manual';
            $result['extracted_count'] = count($normalized);
        }
        return $result;
    }

    /**
     * Import a user-supplied CSV/XLSX dataset. Preview never calls the AI
     * service and never writes a product, review, or scan row.
     */
    public function scanUploadedReviewFile(int|string $user_id, array $file, array $mapping = [], bool $preview = false, array $options = []): array
    {
        $parsed = (new ReviewDatasetImporter())->parseUploadedFile($file, $mapping);
        if (!$parsed['success']) return $parsed;

        if ($preview) {
            return [
                'success' => true,
                'format' => $parsed['format'],
                'columns' => $parsed['columns'],
                'preview' => $parsed['rows'],
                'total_valid' => $parsed['total_valid'],
                'duplicates_removed' => $parsed['duplicates_removed'],
            ];
        }

        $name = (string)($file['name'] ?? 'Uploaded review dataset');
        $externalId = substr(hash('sha256', implode('|', array_map(static fn(array $review): string => $review['text'], $parsed['reviews']))), 0, 32);
        return $this->scanManualReviews(
            $user_id,
            '',
            $parsed['reviews'],
            [
                'title' => pathinfo($name, PATHINFO_FILENAME) ?: 'Uploaded review dataset',
                'external_id' => $externalId,
            ],
            'uploaded_dataset',
            $options
        );
    }

    private function normalizeAnalysisOptions(array $options): array
    {
        return [
            'detect_duplicates' => ($options['detect_duplicates'] ?? true) !== false,
            'show_explanations' => ($options['show_explanations'] ?? true) !== false,
            'detect_language' => ($options['detect_language'] ?? true) !== false,
            'include_uncertain' => ($options['include_uncertain'] ?? true) !== false,
            'show_confidence' => ($options['show_confidence'] ?? true) !== false,
        ];
    }

    private function normalizeScreenshotMetadata(array $metadata, int $confirmedCount, string $source): ?array
    {
        if ($source !== 'screenshot_ocr') return null;
        $candidateCount = max($confirmedCount, min(100, max(0, intval($metadata['ocr_candidate_count'] ?? $confirmedCount))));
        $screenshotCount = min(5, max(0, intval($metadata['screenshot_count'] ?? 0)));
        $duplicatesRemoved = min(100, max(0, intval($metadata['ocr_duplicates_removed'] ?? max(0, $candidateCount - $confirmedCount))));
        $warnings = [];
        if (is_array($metadata['ocr_warnings'] ?? null)) {
            foreach (array_slice($metadata['ocr_warnings'], 0, 10) as $warning) {
                $warning = trim(substr((string)$warning, 0, 500));
                if ($warning !== '') $warnings[] = $warning;
            }
        }
        return [
            'uploaded_screenshot_count' => $screenshotCount,
            'ocr_candidate_count' => $candidateCount,
            'confirmed_review_count' => $confirmedCount,
            'ocr_duplicates_removed' => $duplicatesRemoved,
            'ocr_warnings' => $warnings,
            'limitations' => [
                'This score represents only the submitted screenshot review sample.',
                'OCR boundaries and text may require user correction.',
                'Model classifications are probabilistic and do not prove deception.'
            ],
        ];
    }

    public function getReport(int|string $scan_id, int|string $user_id, bool $is_admin = false): array
    {
        $report = $this->scanHistoryModel->getReportByScanId($scan_id, $user_id, $is_admin);
        if (!$report) {
            return ["success" => false, "error" => "Report not found or you do not have permission to view it."];
        }

        // Decode strengths/weaknesses
        $strengths  = is_array($report['summary_strengths'])  ? $report['summary_strengths']  : json_decode($report['summary_strengths']  ?? '[]', true);
        $weaknesses = is_array($report['summary_weaknesses']) ? $report['summary_weaknesses'] : json_decode($report['summary_weaknesses'] ?? '[]', true);
        $report['summary_strengths']  = is_array($strengths)  ? $strengths  : (!empty($report['summary_strengths'])  ? [$report['summary_strengths']]  : []);
        $report['summary_weaknesses'] = is_array($weaknesses) ? $weaknesses : (!empty($report['summary_weaknesses']) ? [$report['summary_weaknesses']] : []);
        $scanMetadata = json_decode((string)($report['scan_metadata'] ?? ''), true);
        $report['scan_metadata'] = is_array($scanMetadata) ? $scanMetadata : null;

        // Retrieve review IDs scoped to this scan
        $review_ids = null;
        if (!empty($report['review_ids_json'])) {
            $decoded = json_decode($report['review_ids_json'], true);
            if (is_array($decoded) && !empty($decoded)) {
                $review_ids = $decoded;
            }
        }

        // Never return reviews from other scans when a legacy report has no
        // persisted scan-to-review association.
        $reviews = $review_ids === null
            ? []
            : $this->reviewModel->getReviewsWithAnalysis($report['product_id'], $review_ids);

        $metrics = [
            "analyzed_count" => 0,
            "potentially_fake_count" => 0,
            "likely_genuine_count" => 0,
            "uncertain_count" => 0,
            "incomplete_count" => 0,
            "review_count" => count($reviews),
            "average_fake_probability" => null,
            "confidence_distribution" => [
                "low" => 0,
                "uncertain" => 0,
                "high" => 0,
                "missing" => 0
            ],
            "language_distribution" => [],
            "analysis_coverage_percent" => null
        ];
        $confidenceTotal = 0.0;
        $confidenceCount = 0;
        foreach ($reviews as $review) {
            $language = trim((string)($review['language'] ?? '')) ?: 'Unknown';
            $metrics['language_distribution'][$language] = ($metrics['language_distribution'][$language] ?? 0) + 1;
            if (empty($review['analysis_id'])) {
                $metrics['incomplete_count']++;
                $metrics['confidence_distribution']['missing']++;
                continue;
            }
            $metrics['analyzed_count']++;
            $confidence = is_numeric($review['confidence_score'] ?? null)
                ? floatval($review['confidence_score'])
                : null;
            if ($confidence === null || $confidence < 0 || $confidence > 100) {
                $metrics['confidence_distribution']['missing']++;
            } else {
                $confidenceTotal += $confidence;
                $confidenceCount++;
                if ($confidence < 40.0) {
                    $metrics['confidence_distribution']['low']++;
                } elseif ($confidence <= 60.0) {
                    $metrics['confidence_distribution']['uncertain']++;
                } else {
                    $metrics['confidence_distribution']['high']++;
                }
            }
            $classification = strtolower((string)($review['classification'] ?? ''));
            $is_uncertain_label = strpos($classification, 'uncertain') !== false
                || strpos($classification, 'inconclusive') !== false
                || strpos($classification, 'needs review') !== false;
            if ($is_uncertain_label || ($confidence !== null && $confidence >= 40.0 && $confidence <= 60.0)) {
                $metrics['uncertain_count']++;
            } elseif (intval($review['is_fake'] ?? 0) === 1) {
                $metrics['potentially_fake_count']++;
            } else {
                $metrics['likely_genuine_count']++;
            }
        }
        if ($metrics['review_count'] > 0) {
            $metrics['analysis_coverage_percent'] = round(($metrics['analyzed_count'] / $metrics['review_count']) * 100, 1);
        }
        if ($confidenceCount > 0) {
            $metrics['average_fake_probability'] = round($confidenceTotal / $confidenceCount, 1);
        }
        $trustDenominator = $metrics['likely_genuine_count'] + $metrics['potentially_fake_count'];
        $metrics['trust_score_available'] = $trustDenominator > 0;
        $metrics['trust_score_denominator'] = $trustDenominator;
        $metrics['sample_trust_score'] = $trustDenominator > 0
            ? round(($metrics['likely_genuine_count'] / $trustDenominator) * 100, 2)
            : null;
        if (is_array($report['scan_metadata'])) {
            $metrics['screenshot_count'] = intval($report['scan_metadata']['uploaded_screenshot_count'] ?? 0);
            $metrics['ocr_candidate_count'] = intval($report['scan_metadata']['ocr_candidate_count'] ?? $metrics['review_count']);
            $metrics['confirmed_review_count'] = intval($report['scan_metadata']['confirmed_review_count'] ?? $metrics['review_count']);
            $metrics['ocr_duplicates_removed'] = intval($report['scan_metadata']['ocr_duplicates_removed'] ?? 0);
            $metrics['ocr_warnings'] = $report['scan_metadata']['ocr_warnings'] ?? [];
            $metrics['limitations'] = $report['scan_metadata']['limitations'] ?? [];
        }

        return [
            "success" => true,
            "report"  => $report,
            "reviews" => $reviews,
            "metrics" => $metrics
        ];
    }

    public function scanProduct(int|string $user_id, array $data): array
    {
        $scanStartedAt = microtime(true);
        $platform = trim($data['platform'] ?? '');
        $external_id = trim($data['external_id'] ?? '');
        $title = trim($data['title'] ?? '');
        $url = trim($data['url'] ?? '');
        $image_url = trim($data['image_url'] ?? '');
        $rating = floatval($data['rating'] ?? 0.0);
        $reviews = $data['reviews'] ?? [];
        $request_id = trim((string)($data['client_scan_id'] ?? ''));
        $analysis_options = $this->normalizeAnalysisOptions(is_array($data['analysis_options'] ?? null) ? $data['analysis_options'] : []);
        $review_source = trim((string)($data['review_source'] ?? 'manual'));
        $scan_metadata = is_array($data['scan_metadata'] ?? null) ? $data['scan_metadata'] : null;
        if (!preg_match('/^[a-z_]{1,40}$/', $review_source)) $review_source = 'manual';

        if ($request_id !== '' && !preg_match('/^[A-Za-z0-9-]{16,64}$/', $request_id)) {
            return ["success" => false, "error" => "Invalid client scan request ID."];
        }
        if ($request_id === '') {
            $request_id = bin2hex(random_bytes(16));
        }
        $existing_scan = $this->scanHistoryModel->findByRequestId($user_id, $request_id);
        if ($existing_scan) {
            return [
                "success" => true,
                "scan_id" => intval($existing_scan['id']),
                "trust_score" => floatval($existing_scan['trust_score']),
                "trust_score_available" => ((intval($existing_scan['fake_count']) + intval($existing_scan['genuine_count'])) > 0),
                "overall_risk_level" => $existing_scan['risk_level'],
                "duplicate_request" => true,
                "persisted" => true,
                "results" => [],
                "metrics" => [
                    "total_scanned" => intval($existing_scan['fake_count']) + intval($existing_scan['genuine_count']) + intval($existing_scan['uncertain_count'] ?? 0),
                    "fake_detected" => intval($existing_scan['fake_count']),
                    "genuine_detected" => intval($existing_scan['genuine_count']),
                    "uncertain_detected" => intval($existing_scan['uncertain_count'] ?? 0)
                ]
            ];
        }

        if (empty($platform) || empty($external_id) || empty($title) || empty($url)) {
            return ["success" => false, "error" => "Product details (platform, external_id, title, url) are required."];
        }

        // If reviews array is empty, return error — never fabricate reviews
        if (empty($reviews) || !is_array($reviews)) {
            return ["success" => false, "error" => "No reviews were extracted from the product page. Scroll to the reviews section and scan again."];
        }
        if (count($reviews) > 100) {
            return ["success" => false, "error" => "A maximum of 100 reviews is allowed per scan."];
        }

        // Enforce scan-local identity before calling the AI service. The
        // browser extension and direct scan route are trusted data sources,
        // but neither should be able to persist the same review twice in one
        // report. This does not merge records across scans.
        $uniqueReviews = [];
        $seenReviewKeys = [];
        foreach ($reviews as $idx => $review) {
            if (!is_array($review)) {
                return ["success" => false, "error" => "Each review must be an object."];
            }
            $textKey = preg_replace('/\s+/u', ' ', trim(strip_tags((string)($review['text'] ?? ''))));
            $textKey = mb_strtolower((string)$textKey, 'UTF-8');
            $externalReviewId = trim((string)($review['id'] ?? ''));
            if ($textKey === '') continue;
            $reviewKeys = ['text:' . hash('sha256', $textKey)];
            if ($externalReviewId !== '') $reviewKeys[] = 'id:' . hash('sha256', $externalReviewId);
            if (array_intersect($reviewKeys, array_keys($seenReviewKeys))) continue;
            foreach ($reviewKeys as $reviewKey) $seenReviewKeys[$reviewKey] = true;
            $uniqueReviews[] = $review;
        }
        if (!$uniqueReviews) {
            return ["success" => false, "error" => "No unique customer reviews were available for analysis."];
        }
        $duplicateReviewsRemoved = count($reviews) - count($uniqueReviews);
        $reviews = $uniqueReviews;

        // Prepare the reviews payload before persistence. Product and scan
        // rows are created only after AI returns a complete result set.
        $ai_payload = ["reviews" => [], "options" => $analysis_options, "title" => $title, "product_title" => $title];
        foreach ($reviews as $idx => $rev) {
            if (!is_array($rev)) {
                return ["success" => false, "error" => "Each review must be an object."];
            }
            $review_text = trim((string)($rev['text'] ?? ''));
            if ($review_text === '') {
                return ["success" => false, "error" => "Review {$idx} has empty text."];
            }
            if (strlen($review_text) > 10000) {
                return ["success" => false, "error" => "Review {$idx} exceeds 10000 characters."];
            }
            $ai_payload["reviews"][] = [
                "id" => $rev['id'] ?? $idx,
                "text" => $review_text,
                // OCR and pasted reviews may not contain a verified rating.
                // Send 0 to the model for “not captured” instead of inventing
                // a five-star value.
                "rating" => is_numeric($rev['rating'] ?? null) ? intval($rev['rating']) : 0,
                "author" => $rev['author'] ?? 'Anonymous'
            ];
        }

        // 3. Request Analysis from Python Flask AI service
        $python_url = "http://127.0.0.1:5000/analyze";
        $ch = curl_init($python_url);

        $payload_json = json_encode($ai_payload);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload_json);
        $serviceKey = echotrace_env('ECHOTRACE_SERVICE_KEY', '');
        if (strlen($serviceKey) < 32) {
            curl_close($ch);
            return ["success" => false, "error_code" => "ai_service_unavailable", "error" => "AI service is not configured. Contact the system administrator."];
        }
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json', 'X-EchoTrace-Service-Key: ' . $serviceKey]);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        $connectTimeout = max(1, min(10, (int)(echotrace_env('ECHOTRACE_AI_CONNECT_TIMEOUT', 3))));
        $requestTimeout = max($connectTimeout + 1, min(60, (int)(echotrace_env('ECHOTRACE_AI_TIMEOUT', 30))));
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, $connectTimeout);
        curl_setopt($ch, CURLOPT_TIMEOUT, $requestTimeout);

        $start_time = microtime(true);
        $response = curl_exec($ch);
        $err = curl_error($ch);
        $curl_errno = curl_errno($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $duration_ms = intval((microtime(true) - $start_time) * 1000);

        $ai_response = null;
        $fallback_used = false;

        if ($err || $http_code !== 200) {
            // Do not fabricate rule-based predictions when the trained model is unavailable.
            $diagnostic = [
                "http_code" => $http_code,
                "curl_errno" => $curl_errno,
                "curl_error" => $err === '' ? null : substr($err, 0, 180),
                "duration_ms" => $duration_ms,
                "response_bytes" => is_string($response) ? strlen($response) : 0,
            ];
            $this->logAiCall($python_url, $ai_payload, $diagnostic, $duration_ms);

            if ($curl_errno === CURLE_OPERATION_TIMEDOUT) {
                return [
                    "success" => false,
                    "error_code" => "ai_service_timeout",
                    "error" => "The AI service timed out before returning predictions. No scan was saved."
                ];
            }
            if ($curl_errno !== 0) {
                return [
                    "success" => false,
                    "error_code" => "ai_service_unavailable",
                    "error" => "The AI service could not be reached. No scan was saved."
                ];
            }
            if ($http_code === 401 || $http_code === 403) {
                return [
                    "success" => false,
                    "error_code" => "ai_service_authentication_failed",
                    "error" => "The AI service authentication is misconfigured. Restart EchoTrace services and try again. No scan was saved."
                ];
            }
            if ($http_code === 503) {
                return [
                    "success" => false,
                    "error_code" => "ai_model_unavailable",
                    "error" => "The AI model is unavailable. Verify the trained model files and restart Flask. No scan was saved."
                ];
            }
            return [
                "success" => false,
                "error_code" => "ai_service_http_error",
                "error" => "The AI service returned an unexpected HTTP response. No scan was saved."
            ];
        } else {
            $ai_response = json_decode($response, true);
            $this->logAiCall($python_url, $ai_payload, $ai_response, $duration_ms);
        }

        if (!$ai_response || !isset($ai_response['success']) || !$ai_response['success']) {
            return ["success" => false, "error_code" => "ai_service_error", "error" => "AI service analysis failed."];
        }
        if (!isset($ai_response['results']) || !is_array($ai_response['results']) || count($ai_response['results']) !== count($reviews)) {
            return ["success" => false, "error_code" => "ai_service_error", "error" => "AI service returned an incomplete result set. Nothing was saved."];
        }
        foreach ($ai_response['results'] as $resultIndex => $aiResult) {
            $rawIsFake = is_array($aiResult) ? ($aiResult['is_fake'] ?? null) : null;
            $isFakeValid = is_int($rawIsFake)
                || is_bool($rawIsFake)
                || $rawIsFake === '0'
                || $rawIsFake === '1';
            if (
                !is_array($aiResult)
                || !array_key_exists('is_fake', $aiResult)
                || !is_numeric($aiResult['confidence_score'] ?? null)
                || !in_array((string)($aiResult['classification'] ?? ''), ['Genuine Review', 'Suspicious Review', 'Uncertain Review'], true)
                || !$isFakeValid
            ) {
                return ["success" => false, "error_code" => "ai_service_error", "error" => "AI service returned an invalid result for review " . ($resultIndex + 1) . ". Nothing was saved."];
            }
            $confidence = floatval($aiResult['confidence_score']);
            $classification = (string)$aiResult['classification'];
            $expectedClassification = $confidence >= 40.0 && $confidence <= 60.0
                ? 'Uncertain Review'
                : ($confidence > 60.0 ? 'Suspicious Review' : 'Genuine Review');
            if ($confidence < 0 || $confidence > 100 || $classification !== $expectedClassification) {
                return ["success" => false, "error_code" => "ai_service_error", "error" => "AI service returned an invalid probability for review " . ($resultIndex + 1) . ". Nothing was saved."];
            }
            if (($confidence > 60.0 && intval($rawIsFake) !== 1) || ($confidence < 40.0 && intval($rawIsFake) !== 0)) {
                return ["success" => false, "error_code" => "ai_service_error", "error" => "AI service returned an inconsistent class probability for review " . ($resultIndex + 1) . ". Nothing was saved."];
            }
        }

        // 4. Save Reviews & Analysis results to database
        $this->db->beginTransaction();
        try {
            // Keep product, reviews, analysis, scan history, and report creation
            // in one transaction. A failed model or report write cannot leave an
            // orphaned product or a scan that appears successful.
            $product = $this->productModel->getOrInsert($platform, $external_id, $title, $url, $image_url, $rating);
            if (!$product) {
                throw new RuntimeException("Failed to log product details.");
            }
            $product_id = $product['id'];
            $fake_count = 0;
            $genuine_count = 0;
            $uncertain_count = 0;
            $results = $ai_response['results'];
            $inserted_review_ids = []; // track IDs inserted THIS scan only
            $reviewInsertStatement = $this->reviewModel->prepareReviewInsert();
            $analysisInsertStatement = $this->reviewModel->prepareAnalysisInsert();

            foreach ($results as $idx => $res) {
                $orig_rev = $reviews[$idx];

                // Insert Review
                $review_id = $this->reviewModel->insertReview(
                    $product_id,
                    $orig_rev['author'] ?? 'Anonymous',
                    isset($orig_rev['rating']) && $orig_rev['rating'] !== '' ? intval($orig_rev['rating']) : null,
                    $orig_rev['text'] ?? '',
                    $orig_rev['title'] ?? '',
                    $orig_rev['date'] ?? null,
                    $orig_rev['id'] ?? null,
                    $reviewInsertStatement
                );

                if (!$review_id) {
                    throw new RuntimeException("Failed to save an analyzed review.");
                }
                $inserted_review_ids[] = (int)$review_id;

                // Insert Analysis
                $analysis_saved = $this->reviewModel->insertAnalysis(
                    $review_id,
                    $res['is_fake'],
                    $res['confidence_score'],
                    $res['sentiment'],
                    $res['emotion'],
                    $res['toxicity'],
                    $res['duplicate_group_id'],
                    $res['fake_reasons'],
                    $res['keywords'] ?? null,
                    $res['intent'] ?? 'Feedback',
                    $res['grammar_score'] ?? 100.00,
                    $res['classification'] ?? ($res['is_fake'] ? 'Suspicious Review' : 'Genuine Review'),
                    $res['risk_level'] ?? ($res['is_fake'] ? 'Medium Risk' : 'Low Risk'),
                    $res['language'] ?? null,
                    $analysisInsertStatement
                );
                if (!$analysis_saved) {
                    throw new RuntimeException("Failed to save review analysis.");
                }

                $classification = strtolower((string)($res['classification'] ?? ''));
                if (str_contains($classification, 'uncertain')) {
                    $uncertain_count++;
                } elseif ($res['is_fake']) {
                    $fake_count++;
                } else {
                    $genuine_count++;
                }
            }

            // 5. Create Scan History
            $trust_score = $ai_response['trust_score'];
            $overall_risk_level = $ai_response['overall_risk_level'] ?? 'Low Risk';
            $scanDurationMs = max(0, (int)round((microtime(true) - $scanStartedAt) * 1000));
            $scan_history_id = $this->scanHistoryModel->createScan(
                $user_id,
                $product_id,
                $trust_score,
                $fake_count,
                $genuine_count,
                $uncertain_count,
                $overall_risk_level,
                $request_id,
                $scanDurationMs,
                $review_source,
                $scan_metadata
            );

            if (!$scan_history_id) {
                throw new RuntimeException("Failed to save scan history.");
            }

            // 6. Save Report summary — include inserted review IDs for scan-scoped retrieval
            $summary = $ai_response['summary'];
            $report_saved = $this->scanHistoryModel->saveReport(
                $product_id,
                $scan_history_id,
                $summary['strengths'],
                $summary['weaknesses'],
                $summary['recommendation'],
                $summary['overall_quality'] ?? 'Good',
                $summary['genuine_summary'] ?? 'Genuine reviews profile is generally positive.',
                $inserted_review_ids
            );
            if (!$report_saved) {
                throw new RuntimeException("Analysis completed, but the scan report could not be saved.");
            }

            $this->db->commit();

            // 7. Add notification after the audit transaction; a notification
            // failure must not erase a successfully persisted scan.
            if ($user_id) {
                try {
                    $notificationModel = new Notification($this->db);
                    $analyzedCount = $fake_count + $genuine_count + $uncertain_count;
                    $notificationModel->create($user_id, 'scan_completed', 'Scan Completed', $analyzedCount . ' customer reviews were analyzed successfully.', $scan_history_id, 'scan-completed-' . $scan_history_id);
                    if ($fake_count > 0) {
                        $notificationModel->create($user_id, 'fake_reviews_detected', 'Potentially Fake Reviews Detected', $fake_count . ' potentially fake reviews were identified in your latest scan.', $scan_history_id, 'fake-reviews-' . $scan_history_id);
                    }
                } catch (Throwable $notification_error) {
                    error_log('EchoTrace notification save failed: ' . $notification_error->getMessage());
                }
            }

            return [
                "success" => true,
                "scan_id" => $scan_history_id,
                "product" => $product,
                "trust_score" => $trust_score,
                "trust_score_available" => (($genuine_count + $fake_count) > 0),
                "overall_risk_level" => $overall_risk_level,
                "summary" => $summary,
                "fallback_active" => $fallback_used,
                "persisted" => true,
                "client_scan_id" => $request_id,
                "results" => $results,
                "metrics" => [
                    "total_scanned" => count($reviews),
                    "fake_detected" => $fake_count,
                    "genuine_detected" => $genuine_count,
                    "uncertain_detected" => $uncertain_count,
                    "sample_warning" => $ai_response['metrics']['sample_warning'] ?? false,
                    "score_note" => $ai_response['metrics']['score_note'] ?? '',
                    "duration_ms" => $ai_response['metrics']['duration_ms'] ?? null,
                    "trust_score_available" => (($genuine_count + $fake_count) > 0),
                    "scan_duration_ms" => $scanDurationMs,
                    "scan_metadata" => $scan_metadata,
                    "prediction_cache_hits" => $ai_response['metrics']['prediction_cache_hits'] ?? null,
                    "prediction_cache_misses" => $ai_response['metrics']['prediction_cache_misses'] ?? null,
                    "duplicates_removed" => $duplicateReviewsRemoved
                ]
            ];
        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            error_log('EchoTrace scan persistence failed: ' . $e->getMessage());
            $existing_scan = $this->scanHistoryModel->findByRequestId($user_id, $request_id);
            if ($existing_scan) {
                return [
                    "success" => true,
                    "scan_id" => intval($existing_scan['id']),
                    "trust_score" => floatval($existing_scan['trust_score']),
                    "trust_score_available" => ((intval($existing_scan['fake_count']) + intval($existing_scan['genuine_count'])) > 0),
                    "overall_risk_level" => $existing_scan['risk_level'],
                    "duplicate_request" => true,
                    "persisted" => true,
                    "results" => [],
                    "metrics" => [
                        "total_scanned" => intval($existing_scan['fake_count']) + intval($existing_scan['genuine_count']) + intval($existing_scan['uncertain_count'] ?? 0),
                        "fake_detected" => intval($existing_scan['fake_count']),
                        "genuine_detected" => intval($existing_scan['genuine_count']),
                        "uncertain_detected" => intval($existing_scan['uncertain_count'] ?? 0)
                    ]
                ];
            }
            return ["success" => false, "error_code" => "persistence_failure", "error" => "The scan was analyzed but could not be saved. No partial audit was recorded."];
        }
    }

    private function runLocalFallbackAnalysis(array $payload): array
    {
        // Fallback rule-based analyzer when Python microservice is down.
        $results = [];
        $fake_count = 0;
        $total = count($payload['reviews']);

        $spam_keywords = ['buy now', 'click here', 'scam', 'free product', 'paid review', 'discount code', 'gift card'];

        foreach ($payload['reviews'] as $rev) {
            $text = strtolower($rev['text']);
            $is_fake = 0;
            $confidence = 10.0;
            $reasons = [];

            // Simple checks
            if (strlen($text) < 15) {
                $is_fake = 1;
                $confidence = 65.0;
                $reasons[] = "Review text is suspiciously short";
            }

            foreach ($spam_keywords as $kw) {
                if (strpos($text, $kw) !== false) {
                    $is_fake = 1;
                    $confidence = max($confidence, 75.0);
                    $reasons[] = "Contains spam keyword: '$kw'";
                }
            }

            // Exclamations check
            if (substr_count($text, '!') >= 3) {
                $is_fake = 1;
                $confidence = max($confidence, 70.0);
                $reasons[] = "Excessive exclamation marks";
            }

            if ($is_fake) {
                $fake_count++;
            }

            // Simple sentiment
            $pos_words = ['good', 'great', 'love', 'perfect', 'amazing', 'happy'];
            $neg_words = ['bad', 'worst', 'hate', 'terrible', 'useless', 'broke'];

            $pos_hits = 0;
            $neg_hits = 0;
            foreach ($pos_words as $pw) {
                if (strpos($text, $pw) !== false) $pos_hits++;
            }
            foreach ($neg_words as $nw) {
                if (strpos($text, $nw) !== false) $neg_hits++;
            }

            $sentiment = 'neutral';
            if ($pos_hits > $neg_hits) $sentiment = 'positive';
            elseif ($neg_hits > $pos_hits) $sentiment = 'negative';

            $results[] = [
                "id" => $rev['id'],
                "author" => $rev['author'],
                "text" => $rev['text'],
                "rating" => $rev['rating'],
                "cleaned_text" => $text,
                "is_fake" => $is_fake,
                "confidence_score" => $confidence,
                "sentiment" => $sentiment,
                "emotion" => ($sentiment === 'positive' ? 'joy' : ($sentiment === 'negative' ? 'anger' : 'neutral')),
                "toxicity" => ($sentiment === 'negative' ? 30.00 : 0.00),
                "duplicate_group_id" => null,
                "keywords" => [],
                "intent" => "Feedback",
                "grammar_score" => 100.00,
                "classification" => $is_fake ? "Suspicious Review" : "Genuine Review",
                "risk_level" => $is_fake ? ($confidence >= 75.0 ? "High Risk" : "Medium Risk") : "Low Risk",
                "fake_reasons" => $reasons
            ];
        }

        $fake_pct = $total > 0 ? ($fake_count / $total) : 0;
        $trust_score = round(100.0 - ($fake_pct * 80.0), 2);

        $overall_risk = "Low Risk";
        if ($trust_score < 50.0) $overall_risk = "High Risk";
        elseif ($trust_score < 80.0) $overall_risk = "Medium Risk";

        return [
            "success" => true,
            "results" => $results,
            "trust_score" => $trust_score,
            "overall_risk_level" => $overall_risk,
            "summary" => [
                "strengths" => ["Acceptable features detected"],
                "weaknesses" => ["Some suspicious entries identified"],
                "recommendation" => "Trust score evaluated using local fallback analysis.",
                "overall_quality" => "Good",
                "genuine_summary" => "Local fallback analysis indicates that genuine feedback shows acceptable product metrics."
            ]
        ];
    }

    // --- RAG Machine Learning Controller Proxy Methods ---

    public function ragQuery(array $data): array
    {
        return $this->callPythonAi('/rag/query', $data, 'POST');
    }

    public function ragKnowledge(): array
    {
        return $this->callPythonAi('/rag/knowledge', [], 'GET');
    }

    public function ragAddKnowledge(array $data): array
    {
        return $this->callPythonAi('/rag/knowledge/add', $data, 'POST');
    }

    public function ragDeleteKnowledge(array $data): array
    {
        return $this->callPythonAi('/rag/knowledge/delete', $data, 'POST');
    }

    public function ragReindex(): array
    {
        return $this->callPythonAi('/rag/knowledge/reindex', [], 'POST');
    }

    public function ragStats(): array
    {
        return $this->callPythonAi('/rag/stats', [], 'GET');
    }

    private function callPythonAi(string $endpoint, array $payload = [], string $method = 'POST'): array
    {
        $python_url = "http://127.0.0.1:5000" . $endpoint;
        $ch = curl_init($python_url);
        $serviceKey = echotrace_env('ECHOTRACE_SERVICE_KEY', '');
        if (strlen($serviceKey) < 32) {
            return ["success" => false, "error" => "AI service is not configured. Contact the system administrator."];
        }

        // Every AI endpoint is protected by the service key, including GET
        // requests such as /rag/knowledge and /rag/stats.
        $headers = ['X-EchoTrace-Service-Key: ' . $serviceKey];

        if ($method === 'POST') {
            $payload_json = json_encode($payload);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $payload_json);
            $headers[] = 'Content-Type: application/json';
            curl_setopt($ch, CURLOPT_POST, true);
        }

        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);

        $response = curl_exec($ch);
        $err = curl_error($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($err || $http_code !== 200) {
            return [
                "success" => false,
                "error" => "RAG AI service is currently unavailable. Please try again later."
            ];
        }

        $decoded = json_decode($response, true);
        return $decoded ?: ["success" => false, "error" => "Invalid response format from RAG microservice"];
    }
}
