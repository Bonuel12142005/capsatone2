<?php
declare(strict_types=1);

require_once __DIR__ . '/../backend/config/env.php';
require_once __DIR__ . '/../backend/config/database.php';

$db = (new Database())->getConnection();

foreach ([
    'review_analysis.language',
    'scan_history.duration_ms',
    'scan_history.review_source',
] as $field) {
    [$table, $column] = explode('.', $field, 2);
    $stmt = $db->prepare("SHOW COLUMNS FROM `$table` LIKE :column");
    $stmt->execute([':column' => $column]);
    if (!$stmt->fetch()) throw new RuntimeException("Required schema field is missing: $field");
}

$duplicateRequests = $db->query(
    "SELECT user_id, request_id, COUNT(*) AS copies
     FROM scan_history
     WHERE request_id IS NOT NULL AND request_id <> ''
     GROUP BY user_id, request_id
     HAVING copies > 1"
)->fetchAll(PDO::FETCH_ASSOC);
if ($duplicateRequests) throw new RuntimeException('Duplicate scan request IDs were found.');

$duplicateProducts = $db->query(
    "SELECT platform, external_id, COUNT(*) AS copies
     FROM products
     GROUP BY platform, external_id
     HAVING copies > 1"
)->fetchAll(PDO::FETCH_ASSOC);
if ($duplicateProducts) throw new RuntimeException('Duplicate marketplace products were found.');

$duplicateAnalyses = $db->query(
    "SELECT review_id, COUNT(*) AS copies
     FROM review_analysis
     GROUP BY review_id
     HAVING copies > 1"
)->fetchAll(PDO::FETCH_ASSOC);
if ($duplicateAnalyses) throw new RuntimeException('A review has more than one analysis row.');

$orphanAnalysis = $db->query(
    "SELECT ra.id
     FROM review_analysis ra
     LEFT JOIN reviews r ON r.id = ra.review_id
     WHERE r.id IS NULL
     LIMIT 1"
)->fetch(PDO::FETCH_ASSOC);
if ($orphanAnalysis) throw new RuntimeException('An analysis row is not attached to a review.');

$orphanReports = $db->query(
    "SELECT r.id
     FROM reports r
     LEFT JOIN scan_history sh ON sh.id = r.scan_history_id
     WHERE sh.id IS NULL
     LIMIT 1"
)->fetch(PDO::FETCH_ASSOC);
if ($orphanReports) throw new RuntimeException('A report is not attached to a scan.');

$scans = $db->query(
    "SELECT sh.id, sh.product_id, sh.request_id, sh.review_ids_json,
            sh.fake_count, sh.genuine_count, sh.uncertain_count,
            (SELECT COUNT(*) FROM reports rp WHERE rp.scan_history_id = sh.id) AS report_count
     FROM scan_history sh
     ORDER BY sh.id"
)->fetchAll(PDO::FETCH_ASSOC);
$seenReviewIds = [];
$legacyScans = 0;

foreach ($scans as $scan) {
    if ((int)$scan['report_count'] !== 1) {
        throw new RuntimeException("Scan {$scan['id']} does not have exactly one report.");
    }
    $reviewIds = json_decode((string)($scan['review_ids_json'] ?? ''), true);
    if (!is_array($reviewIds) || !$reviewIds) {
        // Preserve pre-association legacy scans without guessing which reviews
        // belonged to them. New successful scans must always have an ID list.
        if (empty($scan['request_id'])) {
            $legacyScans++;
            continue;
        }
        throw new RuntimeException("Scan {$scan['id']} has no scan-scoped review association.");
    }
    $reviewIds = array_values(array_unique(array_map('intval', $reviewIds)));
    if (count($reviewIds) !== count(json_decode((string)$scan['review_ids_json'], true))) {
        throw new RuntimeException("Scan {$scan['id']} contains duplicate review IDs.");
    }
    foreach ($reviewIds as $reviewId) {
        if ($reviewId < 1) throw new RuntimeException("Scan {$scan['id']} contains an invalid review ID.");
        if (isset($seenReviewIds[$reviewId])) {
            throw new RuntimeException("Review {$reviewId} is associated with multiple scans.");
        }
        $seenReviewIds[$reviewId] = (int)$scan['id'];
    }

    $placeholders = implode(',', array_fill(0, count($reviewIds), '?'));
    $reviewStmt = $db->prepare("SELECT COUNT(*) FROM reviews WHERE product_id = ? AND id IN ($placeholders)");
    $reviewStmt->execute(array_merge([(int)$scan['product_id']], $reviewIds));
    if ((int)$reviewStmt->fetchColumn() !== count($reviewIds)) {
        throw new RuntimeException("Scan {$scan['id']} contains reviews from another product or missing reviews.");
    }

    $analysisStmt = $db->prepare("SELECT COUNT(*) FROM review_analysis WHERE review_id IN ($placeholders)");
    $analysisStmt->execute($reviewIds);
    if ((int)$analysisStmt->fetchColumn() !== count($reviewIds)) {
        throw new RuntimeException("Scan {$scan['id']} contains incomplete review analysis.");
    }

    $classified = (int)$scan['fake_count'] + (int)$scan['genuine_count'] + (int)$scan['uncertain_count'];
    if ($classified !== count($reviewIds)) {
        throw new RuntimeException("Scan {$scan['id']} summary counts do not match its reviews.");
    }
}

echo 'database-report-integrity-test: PASS (' . count($scans) . ' scans, ' . count($seenReviewIds) . ' reviews, ' . $legacyScans . ' legacy scans preserved)' . PHP_EOL;
