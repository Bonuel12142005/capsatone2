<?php
/**
 * Admin Panel Integration Test
 * Verifies all fixes are working correctly
 */

require_once __DIR__ . '/../backend/config/env.php';
require_once __DIR__ . '/../backend/config/database.php';
require_once __DIR__ . '/../backend/controllers/AdminController.php';
require_once __DIR__ . '/../backend/models/User.php';

echo "=== ADMIN PANEL INTEGRATION TEST ===\n\n";

try {
    $database = new Database();
    $db = $database->getConnection();
    $admin = new AdminController($db);
    
    $passed = 0;
    $failed = 0;
    
    // Test 1: User Accounts API
    echo "Test 1: User Accounts API (Fixed getAllUsers)... ";
    $users_result = $admin->getUsers();
    if ($users_result['success'] && count($users_result['users']) > 0) {
        echo "✓ PASS\n";
        echo "  - User count: " . count($users_result['users']) . "\n";
        echo "  - First user: " . $users_result['users'][0]['username'] . "\n";
        $passed++;
    } else {
        echo "✗ FAIL\n";
        $failed++;
    }
    
    // Test 2: Community Reports API
    echo "\nTest 2: Community Reports API... ";
    $feedback_result = $admin->getCommunityReports();
    if ($feedback_result['success']) {
        echo "✓ PASS\n";
        echo "  - Report count: " . count($feedback_result['reports']) . "\n";
        $passed++;
    } else {
        echo "✗ FAIL\n";
        $failed++;
    }
    
    // Test 3: Analytics API
    echo "\nTest 3: Scan Analytics API (Phase 2)... ";
    $analytics_result = $admin->getScanAnalytics(['period' => '30']);
    if ($analytics_result['success'] && isset($analytics_result['summary'])) {
        echo "✓ PASS\n";
        echo "  - Total scans: " . $analytics_result['summary']['total_scans'] . "\n";
        echo "  - Total reviews: " . $analytics_result['summary']['total_reviews'] . "\n";
        echo "  - Avg trust score: " . $analytics_result['summary']['avg_trust_score'] . "%\n";
        $passed++;
    } else {
        echo "✗ FAIL\n";
        $failed++;
    }
    
    // Test 4: Products API
    echo "\nTest 4: Products API... ";
    $products_result = $admin->getProducts();
    if ($products_result['success'] && count($products_result['products']) > 0) {
        echo "✓ PASS\n";
        echo "  - Product count: " . count($products_result['products']) . "\n";
        $passed++;
    } else {
        echo "✗ FAIL\n";
        $failed++;
    }
    
    // Test 5: System Logs API
    echo "\nTest 5: System Logs API... ";
    $logs_result = $admin->getSystemLogs();
    if ($logs_result['success'] && isset($logs_result['ai_logs'])) {
        echo "✓ PASS\n";
        echo "  - AI logs: " . count($logs_result['ai_logs']) . "\n";
        echo "  - Login logs: " . count($logs_result['login_logs']) . "\n";
        $passed++;
    } else {
        echo "✗ FAIL\n";
        $failed++;
    }
    
    // Test 6: Dashboard Stats API
    echo "\nTest 6: Dashboard Stats API... ";
    $dashboard_result = $admin->getDashboardStats();
    if ($dashboard_result['success'] && isset($dashboard_result['dashboard'])) {
        echo "✓ PASS\n";
        echo "  - Total users: " . $dashboard_result['dashboard']['total_users'] . "\n";
        echo "  - Total products: " . $dashboard_result['dashboard']['total_products'] . "\n";
        $passed++;
    } else {
        echo "✗ FAIL\n";
        $failed++;
    }
    
    // Test 7: Verify User model methods exist
    echo "\nTest 7: User Model Methods (getAllUsers vs getAll)... ";
    $user = new User($db);
    $all_users = $user->getAllUsers();
    if (is_array($all_users) && count($all_users) > 0) {
        echo "✓ PASS\n";
        echo "  - getAllUsers() returns: " . count($all_users) . " users\n";
        $passed++;
    } else {
        echo "✗ FAIL\n";
        $failed++;
    }
    
    echo "\n=== TEST SUMMARY ===\n";
    echo "Passed: $passed / 7\n";
    echo "Failed: $failed / 7\n\n";
    
    if ($failed === 0) {
        echo "✓ ALL TESTS PASSED - Admin Panel is fully functional!\n";
    } else {
        echo "✗ Some tests failed - Review the issues above\n";
    }
    
} catch (Exception $e) {
    echo "\n✗ FATAL ERROR: " . $e->getMessage() . "\n";
    echo "Stack: " . $e->getTraceAsString() . "\n";
}
?>
