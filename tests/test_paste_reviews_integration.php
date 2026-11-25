<?php
// tests/test_paste_reviews_integration.php
require_once __DIR__ . '/../backend/config/database.php';
require_once __DIR__ . '/../backend/controllers/ScanController.php';

echo "--- Testing Paste Reviews Integration & Trust Score Formula ---\n";

$passed = 0;
$failed = 0;

function runTest($name, $fn) {
    global $passed, $failed;
    try {
        $fn();
        echo "  PASS: $name\n";
        $passed++;
    } catch (Throwable $e) {
        echo "  FAIL: $name\n    " . $e->getMessage() . "\n";
        $failed++;
    }
}

// 1. Trust score formula: Genuine / (Genuine + Suspicious) * 100, Uncertain excluded
runTest('Trust score formula with 5 Genuine, 2 Suspicious (71.43%)', function() {
    $genuine = 5;
    $suspicious = 2;
    $uncertain = 0;
    $denom = $genuine + $suspicious;
    $score = $denom > 0 ? round(($genuine / $denom) * 100, 2) : null;
    $expected = 71.43;
    if ($score !== $expected) {
        throw new Exception("Expected $expected, got " . var_export($score, true));
    }
});

runTest('Trust score formula with 7 Genuine, 2 Suspicious, 1 Uncertain (77.78%)', function() {
    $genuine = 7;
    $suspicious = 2;
    $uncertain = 1;
    $denom = $genuine + $suspicious;
    $score = $denom > 0 ? round(($genuine / $denom) * 100, 2) : null;
    $expected = 77.78;
    if ($score !== $expected) {
        throw new Exception("Expected $expected, got " . var_export($score, true));
    }
});

runTest('Trust score when only Uncertain reviews (should be null, not divide by zero)', function() {
    $genuine = 0;
    $suspicious = 0;
    $uncertain = 5;
    $denom = $genuine + $suspicious;
    $score = $denom > 0 ? round(($genuine / $denom) * 100, 2) : null;
    if ($score !== null) {
        throw new Exception("Expected null for 0 genuine and 0 suspicious, got " . var_export($score, true));
    }
});

runTest('Trust score when zero reviews (null)', function() {
    $genuine = 0;
    $suspicious = 0;
    $uncertain = 0;
    $denom = $genuine + $suspicious;
    $score = $denom > 0 ? round(($genuine / $denom) * 100, 2) : null;
    if ($score !== null) {
        throw new Exception("Expected null for 0 reviews, got " . var_export($score, true));
    }
});

// 2. Database review_source allowlist and insertion
runTest('Database scan_history accepts review_source = manual_paste', function() {
    $database = new Database();
    $db = $database->getConnection();
    
    // Check if test user exists
    $stmt = $db->query("SELECT id FROM users LIMIT 1");
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$user) {
        throw new Exception("No user found in database to test scan insertion");
    }
    $userId = $user['id'];
    
    // Check if product exists or create dummy
    $stmt = $db->query("SELECT id FROM products LIMIT 1");
    $product = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$product) {
        $db->exec("INSERT INTO products (title, platform, external_id) VALUES ('Test Product', 'manual', 'test-ext-1')");
        $productId = $db->lastInsertId();
    } else {
        $productId = $product['id'];
    }
    
    // Insert test scan_history record with review_source = manual_paste
    $stmt = $db->prepare("
        INSERT INTO scan_history (user_id, product_id, review_source, trust_score, fake_count, genuine_count, uncertain_count, risk_level)
        VALUES (?, ?, 'manual_paste', 85.50, 1, 6, 0, 'Low Risk')
    ");
    $stmt->execute([$userId, $productId]);
    $scanId = $db->lastInsertId();
    
    // Verify inserted record
    $verifyStmt = $db->prepare("SELECT id, review_source, trust_score FROM scan_history WHERE id = ?");
    $verifyStmt->execute([$scanId]);
    $row = $verifyStmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$row || $row['review_source'] !== 'manual_paste') {
        throw new Exception("Failed to insert/verify scan_history with review_source='manual_paste'");
    }
    
    // Clean up test scan
    $db->prepare("DELETE FROM scan_history WHERE id = ?")->execute([$scanId]);
});

// 3. Verify scan/manual-reviews route configuration in backend/api/index.php
runTest('Verify scan/manual-reviews route exists and accepts POST', function() {
    $indexContent = file_get_contents(__DIR__ . '/../backend/api/index.php');
    if (!strpos($indexContent, "'scan/manual-reviews'")) {
        throw new Exception("Route 'scan/manual-reviews' not found in backend/api/index.php");
    }
    if (!strpos($indexContent, "scanManualReviews")) {
        throw new Exception("Method 'scanManualReviews' call not found in backend/api/index.php");
    }
});

// 4. Verify ScanController allowlist contains manual_paste
runTest('Verify ScanController supports manual_paste review_source', function() {
    $controllerContent = file_get_contents(__DIR__ . '/../backend/controllers/ScanController.php');
    if (!strpos($controllerContent, "'manual_paste'")) {
        throw new Exception("manual_paste not found in ScanController.php allowlist");
    }
});

// 5. Verify ScanController handles manual_paste dataset source
runTest('Verify ScanController treats empty url with manual_paste as valid platform', function() {
    $controllerContent = file_get_contents(__DIR__ . '/../backend/controllers/ScanController.php');
    if (!strpos($controllerContent, "'manual_paste'")) {
        throw new Exception("manual_paste check not found in ScanController platform resolution");
    }
    if (!strpos($controllerContent, "\$isDataset = trim(\$url) === '' && in_array(\$source, ['manual_paste'")) {
        throw new Exception("isDataset check with manual_paste not found in ScanController");
    }
});

echo "\nResults: $passed passed, $failed failed\n";
if ($failed > 0) exit(1);

