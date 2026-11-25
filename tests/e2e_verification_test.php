<?php
// tests/e2e_verification_test.php
require_once __DIR__ . '/../backend/config/database.php';
require_once __DIR__ . '/../backend/models/Product.php';
require_once __DIR__ . '/../backend/models/Review.php';
require_once __DIR__ . '/../backend/models/ScanHistory.php';
require_once __DIR__ . '/../backend/models/Notification.php';
require_once __DIR__ . '/../backend/services/ReviewExtractor.php';
require_once __DIR__ . '/../backend/controllers/ScanController.php';
require_once __DIR__ . '/../backend/models/User.php';

echo "=== EchoTrace Paste Reviews Scanner - End-to-End Verification ===\n\n";

$passed = 0;
$failed = 0;

function assertTest($name, $fn) {
    global $passed, $failed;
    try {
        $fn();
        echo "  [PASS] $name\n";
        $passed++;
    } catch (Throwable $e) {
        echo "  [FAIL] $name\n    Error: " . $e->getMessage() . "\n";
        $failed++;
    }
}

$database = new Database();
$db = $database->getConnection();
if (!$db) {
    echo "Database connection failed.\n";
    exit(1);
}

// Ensure test user
$userStmt = $db->query("SELECT id, email, username FROM users WHERE role = 'user' LIMIT 1");
$testUser = $userStmt->fetch(PDO::FETCH_ASSOC);
if (!$testUser) {
    $userStmt = $db->query("SELECT id, email, username FROM users LIMIT 1");
    $testUser = $userStmt->fetch(PDO::FETCH_ASSOC);
}
echo "Using test user ID: " . $testUser['id'] . " (" . $testUser['email'] . ")\n\n";

$scanController = new ScanController($db);

// -------------------------------------------------------------
// Test 1: Python AI Service is LIVE and returns real classifications (no mock)
// -------------------------------------------------------------
assertTest('Python AI Service is alive and responds to /health', function() {
    $ch = curl_init('http://127.0.0.1:5000/health');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 3);
    $response = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code !== 200) {
        throw new Exception("Python AI service not responding on 127.0.0.1:5000/health (code $code)");
    }
    $data = json_decode($response, true);
    if (!$data || !isset($data['status'])) {
        throw new Exception("Unexpected health payload from AI service: " . substr($response, 0, 100));
    }
});

// -------------------------------------------------------------
// Test 2: Scan with real customer reviews -> sends to Python AI -> classifies -> persists to DB
// -------------------------------------------------------------
$createdScanId = null;
assertTest('End-to-end Paste Reviews scan executes with real AI classification and persists to DB', function() use ($scanController, $testUser, &$createdScanId, $db) {
    $pastedReviews = [
        ['id' => 'p1', 'text' => 'The item arrived quickly, securely wrapped in bubble wrap, and worked straight out of the box. Highly recommended!', 'author' => 'Reviewer 1', 'rating' => 5],
        ['id' => 'p2', 'text' => 'Fake item! DO NOT BUY! Terrible quality, completely broken when opened and seller refused refund.', 'author' => 'Reviewer 2', 'rating' => 1],
        ['id' => 'p3', 'text' => 'Very satisfied with this purchase, battery lasts all day and sound is clear for the price.', 'author' => 'Reviewer 3', 'rating' => 4],
        ['id' => 'p4', 'text' => 'Fast delivery, good packaging, hope it lasts long. Will order again if durable.', 'author' => 'Reviewer 4', 'rating' => 5],
    ];

    $result = $scanController->scanManualReviews(
        $testUser['id'],
        '', // empty URL for manual paste
        $pastedReviews,
        [
            'title' => 'E2E Test Bluetooth Earbuds',
            'external_id' => 'e2e-paste-test-' . time(),
            'marketplace' => 'Shopee'
        ],
        'manual_paste',
        ['detect_duplicates' => true, 'show_explanations' => true, 'detect_language' => true, 'include_uncertain' => true]
    );

    if (!$result['success']) {
        throw new Exception("scanManualReviews returned failure: " . ($result['error'] ?? 'Unknown error'));
    }

    if (empty($result['scan_id'])) {
        throw new Exception("No scan_id returned from scanManualReviews");
    }
    $createdScanId = $result['scan_id'];

    if (!isset($result['trust_score']) || $result['trust_score'] === null) {
        throw new Exception("Trust score was not calculated in response");
    }

    if ($result['review_source'] !== 'manual_paste') {
        throw new Exception("Expected review_source 'manual_paste', got " . var_export($result['review_source'], true));
    }

    // Verify AI produced actual classification objects in results
    if (empty($result['results']) || count($result['results']) !== 4) {
        throw new Exception("Expected 4 classified reviews in results from AI, got " . count($result['results'] ?? []));
    }

    foreach ($result['results'] as $rev) {
        if (!isset($rev['classification']) || !in_array($rev['classification'], ['Genuine Review', 'Suspicious Review', 'Uncertain Review'], true)) {
            throw new Exception("Invalid or missing classification from AI: " . var_export($rev['classification'] ?? null, true));
        }
    }

    // Verify DB persistence in scan_history
    $stmt = $db->prepare("SELECT * FROM scan_history WHERE id = ?");
    $stmt->execute([$createdScanId]);
    $scanRow = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$scanRow) {
        throw new Exception("scan_history record #$createdScanId not found in database");
    }
    if ($scanRow['review_source'] !== 'manual_paste') {
        throw new Exception("scan_history.review_source mismatch: " . $scanRow['review_source']);
    }
    if ($scanRow['user_id'] != $testUser['id']) {
        throw new Exception("scan_history.user_id mismatch");
    }

    // Verify reviews persisted in reviews table
    $stmt = $db->prepare("SELECT COUNT(*) FROM reviews WHERE product_id = ?");
    $stmt->execute([$scanRow['product_id']]);
    $reviewCount = (int)$stmt->fetchColumn();
    if ($reviewCount < 4) {
        throw new Exception("Expected at least 4 reviews in reviews table for product, found $reviewCount");
    }

    // Verify review_analysis records
    $stmt = $db->prepare("
        SELECT COUNT(*) FROM review_analysis ra
        JOIN reviews r ON ra.review_id = r.id
        WHERE r.product_id = ?
    ");
    $stmt->execute([$scanRow['product_id']]);
    $analysisCount = (int)$stmt->fetchColumn();
    if ($analysisCount < 4) {
        throw new Exception("Expected at least 4 analysis records in review_analysis table, found $analysisCount");
    }
});

// -------------------------------------------------------------
// Test 3: Duplicate review handling does NOT inflate trust score
// -------------------------------------------------------------
assertTest('Duplicate reviews are deduped server-side and cannot inflate trust score', function() use ($scanController, $testUser) {
    // 1 genuine review repeated 5 times + 1 bad review
    $reviewsWithDups = [
        ['id' => 'd1', 'text' => 'Exceptional quality, super clear sound, perfect product!', 'author' => 'User A', 'rating' => 5],
        ['id' => 'd2', 'text' => 'Exceptional quality, super clear sound, perfect product!', 'author' => 'User B', 'rating' => 5],
        ['id' => 'd3', 'text' => 'exceptional quality,   super clear sound, perfect product!  ', 'author' => 'User C', 'rating' => 5],
        ['id' => 'd4', 'text' => 'Completely fake broken product do not waste money.', 'author' => 'User D', 'rating' => 1]
    ];

    $result = $scanController->scanManualReviews(
        $testUser['id'],
        '',
        $reviewsWithDups,
        ['title' => 'Dup Test Product', 'external_id' => 'dup-test-' . time()],
        'manual_paste',
        ['detect_duplicates' => true]
    );

    if (!$result['success']) {
        throw new Exception("Scan failed: " . ($result['error'] ?? ''));
    }

    // Should have only 2 unique reviews analyzed
    if ($result['extracted_count'] !== 2) {
        throw new Exception("Expected 2 extracted reviews after dedup, got " . $result['extracted_count']);
    }
});

// -------------------------------------------------------------
// Test 4: Backend enforces max 100 review limit strictly
// -------------------------------------------------------------
assertTest('Backend rejects batch exceeding 100 reviews with 422 error', function() use ($scanController, $testUser) {
    $oversized = [];
    for ($i = 1; $i <= 101; $i++) {
        $oversized[] = ['id' => "r$i", 'text' => "Review number $i with unique content to avoid deduplication.", 'author' => "User $i"];
    }

    $result = $scanController->scanManualReviews(
        $testUser['id'],
        '',
        $oversized,
        ['title' => 'Oversized Test'],
        'manual_paste'
    );

    if ($result['success']) {
        throw new Exception("Server accepted 101 reviews when limit is 100");
    }
    if (($result['status'] ?? 0) !== 422 || ($result['error_code'] ?? '') !== 'too_many_reviews') {
        throw new Exception("Expected status 422 with too_many_reviews, got " . json_encode($result));
    }
});

// -------------------------------------------------------------
// Test 5: Empty input / whitespace-only input handling
// -------------------------------------------------------------
assertTest('Backend rejects empty or whitespace-only reviews', function() use ($scanController, $testUser) {
    $empty = [
        ['id' => 'e1', 'text' => '   '],
        ['id' => 'e2', 'text' => '']
    ];

    $result = $scanController->scanManualReviews(
        $testUser['id'],
        '',
        $empty,
        ['title' => 'Empty Test'],
        'manual_paste'
    );

    if ($result['success']) {
        throw new Exception("Server accepted whitespace-only reviews");
    }
    if (($result['status'] ?? 0) !== 422) {
        throw new Exception("Expected status 422, got " . json_encode($result));
    }
});

// -------------------------------------------------------------
// Test 6: Verify manual_paste scan appears in Audit History query
// -------------------------------------------------------------
assertTest('Audit history queries return manual_paste scans with all required metadata', function() use ($db, $testUser, &$createdScanId) {
    if (!$createdScanId) {
        throw new Exception("No created scan id available for audit test");
    }

    $stmt = $db->prepare("
        SELECT sh.id, sh.review_source, sh.trust_score, sh.scan_date, p.title as product_title, p.platform
        FROM scan_history sh
        LEFT JOIN products p ON sh.product_id = p.id
        WHERE sh.user_id = ? AND sh.id = ?
    ");
    $stmt->execute([$testUser['id'], $createdScanId]);
    $historyRow = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$historyRow) {
        throw new Exception("Scan #$createdScanId not found in user audit history");
    }
    if ($historyRow['review_source'] !== 'manual_paste') {
        throw new Exception("Expected review_source 'manual_paste', got " . $historyRow['review_source']);
    }
    if (empty($historyRow['product_title'])) {
        throw new Exception("Product title is empty in history row");
    }
});

// -------------------------------------------------------------
// Test 7: Full Interactive Audit Report retrieval for manual_paste scan
// -------------------------------------------------------------
assertTest('ReportController / scan report generation works for manual_paste scan', function() use ($scanController, $testUser, &$createdScanId) {
    if (!$createdScanId) {
        throw new Exception("No created scan id available");
    }

    $res = $scanController->getReport((int)$createdScanId, (int)$testUser['id']);
    if (!$res['success']) {
        throw new Exception("getReport failed: " . ($res['error'] ?? ''));
    }
    if (!isset($res['report'])) {
        throw new Exception("Missing report payload in response");
    }
    $r = $res['report'];
    if (!isset($r['trust_score'])) {
        throw new Exception("Report does not contain trust_score");
    }
    if (!isset($res['reviews']) || count($res['reviews']) === 0) {
        throw new Exception("Report does not include classified reviews list");
    }
});

// -------------------------------------------------------------
// Test 8: Unauthenticated access to scan/manual-reviews is blocked
// -------------------------------------------------------------
assertTest('Unauthenticated API calls to scan/manual-reviews are rejected with 401', function() {
    $ch = curl_init('http://localhost:8000/backend/api/index.php?route=scan/manual-reviews');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['reviews' => [['id' => '1', 'text' => 'sample']]]));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_TIMEOUT, 3);
    $response = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code !== 401 && $code !== 403) {
        throw new Exception("Expected 401/403 for unauthenticated request, got HTTP $code");
    }
});

echo "\n============================================\n";
echo "E2E Verification Results: $passed passed, $failed failed\n";
echo "============================================\n";

if ($failed > 0) exit(1);
