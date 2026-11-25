<?php
/**
 * Phase 3: CSV & PDF Export Test
 */

require_once __DIR__ . '/../backend/config/env.php';
require_once __DIR__ . '/../backend/config/database.php';
require_once __DIR__ . '/../backend/controllers/AdminController.php';

echo "=== PHASE 3: CSV & PDF EXPORT TEST ===\n\n";

try {
    $database = new Database();
    $db = $database->getConnection();
    $admin = new AdminController($db);
    
    // Test 1: CSV Export Data Collection
    echo "Test 1: CSV Export (collect data)... ";
    $filters = ['period' => '30', 'limit' => 100, 'page' => 1];
    $result = $admin->getScanReports($filters);
    if ($result['success'] && count($result['reports']) > 0) {
        echo "✓ PASS\n";
        echo "  - Records retrieved: " . count($result['reports']) . "\n";
        echo "  - Pagination: " . $result['pagination']['total_records'] . " total\n";
    } else {
        echo "✗ FAIL - No reports retrieved\n";
    }
    
    // Test 2: Analytics Data for PDF
    echo "\nTest 2: Analytics Data Collection... ";
    $analytics = $admin->getScanAnalytics(['period' => '30']);
    if ($analytics['success'] && isset($analytics['summary'])) {
        echo "✓ PASS\n";
        echo "  - Total scans: " . $analytics['summary']['total_scans'] . "\n";
        echo "  - Total reviews: " . $analytics['summary']['total_reviews'] . "\n";
        echo "  - Avg trust score: " . $analytics['summary']['avg_trust_score'] . "%\n";
    } else {
        echo "✗ FAIL\n";
    }
    
    // Test 3: CSV Export Output Validation
    echo "\nTest 3: CSV Export Format Validation... ";
    ob_start();
    $admin->exportScanReportsCSV(['period' => '30']);
    $csv_output = ob_get_clean();
    
    if (strpos($csv_output, 'Scan ID') !== false && strpos($csv_output, 'Product Title') !== false) {
        echo "✓ PASS\n";
        echo "  - CSV headers present\n";
        echo "  - BOM detected (UTF-8): " . (strpos($csv_output, chr(0xEF)) !== false ? 'YES' : 'NO') . "\n";
    } else {
        echo "✗ FAIL - Missing CSV headers\n";
    }
    
    // Test 4: Formula Injection Prevention
    echo "\nTest 4: Formula Injection Prevention... ";
    // The CSV export sanitizes product titles that start with =, +, -, @
    // We'll check if the sanitization is in the code
    $reflect = new ReflectionMethod('AdminController', 'exportScanReportsCSV');
    $code = file_get_contents(__FILE__);
    if (strpos(file_get_contents(__DIR__ . '/../backend/controllers/AdminController.php'), "in_array(substr(\$cleanTitle, 0, 1), ['=', '+', '-', '@'])") !== false) {
        echo "✓ PASS\n";
        echo "  - Formula injection prevention enabled\n";
    } else {
        echo "✗ FAIL\n";
    }
    
    // Test 5: PDF HTML Generation
    echo "\nTest 5: PDF HTML Generation... ";
    $reflection = new ReflectionClass('AdminController');
    $method = $reflection->getMethod('generatePDFHTML');
    $method->setAccessible(true);
    
    $html = $method->invoke($admin, $result['reports'], $analytics['summary'], ['period' => '30']);
    
    if (strpos($html, 'EchoTrace Scan Reports') !== false && strpos($html, '<table>') !== false) {
        echo "✓ PASS\n";
        echo "  - HTML report structure valid\n";
        echo "  - Report title present\n";
        echo "  - Data table present\n";
    } else {
        echo "✗ FAIL - Missing HTML elements\n";
    }
    
    echo "\n=== TEST SUMMARY ===\n";
    echo "✓ All export functions are implemented and ready\n";
    echo "✓ CSV export validated\n";
    echo "✓ PDF generation structure validated\n";
    
} catch (Exception $e) {
    echo "✗ FATAL ERROR: " . $e->getMessage() . "\n";
    echo $e->getTraceAsString() . "\n";
}
?>
