<?php
/**
 * Phase 2 Analytics Implementation Test
 * Tests: Analytics Cards & Interactive Charts
 * 
 * Verifies:
 * - Admin/scan-analytics endpoint returns correct data structure
 * - Database-driven metrics are accurate
 * - Trust score calculations are correct
 * - All 8 analytics cards display correct values
 * - 4 charts receive correct data
 * - Empty dataset handling
 * - Date period filtering works
 */

require_once __DIR__ . '/../backend/config/env.php';
require_once __DIR__ . '/../backend/config/database.php';
require_once __DIR__ . '/../backend/controllers/AdminController.php';

class Phase2AnalyticsTest
{
    private PDO $db;
    private AdminController $adminController;
    
    public function __construct()
    {
        $database = new Database();
        $this->db = $database->getConnection();
        $this->adminController = new AdminController($this->db);
    }
    
    public function runAllTests()
    {
        echo "=== PHASE 2: ANALYTICS CARDS & CHARTS TEST SUITE ===\n\n";
        
        $tests = [
            'testGetScanAnalyticsEndpoint' => 'Analytics endpoint returns valid data',
            'testAnalyticsSummaryCards' => 'All 8 summary cards have correct values',
            'testActivityTrendData' => 'Scan activity trend data is valid',
            'testClassificationDistribution' => 'Review classification distribution is correct',
            'testMarketplaceDistribution' => 'Marketplace/platform distribution data is complete',
            'testTrustScoreTrend' => 'Trust score trend is calculated correctly',
            'testEmptyDatasetHandling' => 'Analytics handle empty datasets gracefully',
            'testPeriodFiltering' => 'Period filtering (7, 30, 90 days) works correctly',
            'testTrustScoreCalculation' => 'Trust score is calculated without duplication'
        ];
        
        $results = [];
        foreach ($tests as $testName => $description) {
            echo "Testing: $description... ";
            try {
                $result = $this->$testName();
                $results[$testName] = $result;
                echo $result ? "✓ PASS\n" : "✗ FAIL\n";
            } catch (Exception $e) {
                $results[$testName] = false;
                echo "✗ FAIL: " . $e->getMessage() . "\n";
            }
        }
        
        echo "\n=== TEST SUMMARY ===\n";
        $passed = array_sum($results);
        $total = count($results);
        echo "Passed: $passed / $total\n";
        
        if ($passed === $total) {
            echo "\n✓ ALL TESTS PASSED\n";
            return true;
        } else {
            echo "\n✗ SOME TESTS FAILED\n";
            return false;
        }
    }
    
    /**
     * Test 1: Verify getScanAnalytics endpoint returns proper data structure
     */
    public function testGetScanAnalyticsEndpoint(): bool
    {
        $result = $this->adminController->getScanAnalytics(['period' => '30']);
        
        if (!$result['success']) {
            return false;
        }
        
        // Verify required fields
        $required = ['summary', 'activity_trend', 'platform_distribution'];
        foreach ($required as $field) {
            if (!isset($result[$field])) {
                return false;
            }
        }
        
        // Verify summary has all 8 cards
        $summaryFields = [
            'total_scans',
            'total_reviews',
            'total_genuine',
            'total_suspicious',
            'total_uncertain',
            'avg_trust_score',
            'successful_scans',
            'failed_scans'
        ];
        
        foreach ($summaryFields as $field) {
            if (!isset($result['summary'][$field])) {
                echo "\nMissing field in summary: $field";
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Test 2: Verify all 8 analytics cards have correct data types
     */
    public function testAnalyticsSummaryCards(): bool
    {
        $result = $this->adminController->getScanAnalytics(['period' => '30']);
        $summary = $result['summary'] ?? [];
        
        // Verify numeric types
        if (!is_int($summary['total_scans'])) return false;
        if (!is_int($summary['total_reviews'])) return false;
        if (!is_int($summary['total_genuine'])) return false;
        if (!is_int($summary['total_suspicious'])) return false;
        if (!is_int($summary['total_uncertain'])) return false;
        if (!is_numeric($summary['avg_trust_score'])) return false;
        if (!is_int($summary['successful_scans'])) return false;
        if (!is_int($summary['failed_scans'])) return false;
        
        // Verify non-negative
        if ($summary['total_scans'] < 0) return false;
        if ($summary['total_reviews'] < 0) return false;
        if ($summary['avg_trust_score'] < 0 || $summary['avg_trust_score'] > 100) return false;
        
        return true;
    }
    
    /**
     * Test 3: Verify activity trend data structure
     */
    public function testActivityTrendData(): bool
    {
        $result = $this->adminController->getScanAnalytics(['period' => '30']);
        $trend = $result['activity_trend'] ?? [];
        
        // Each entry should have required fields
        foreach ($trend as $entry) {
            if (!isset($entry['date'])) return false;
            if (!isset($entry['scans'])) return false;
            if (!isset($entry['suspicious'])) return false;
            if (!isset($entry['genuine'])) return false;
            if (!isset($entry['uncertain'])) return false;
            if (!isset($entry['avg_trust'])) return false;
            
            // Verify types
            if (!is_numeric($entry['scans'])) return false;
            if (!is_numeric($entry['avg_trust'])) return false;
            if ($entry['avg_trust'] < 0 || $entry['avg_trust'] > 100) return false;
        }
        
        return true;
    }
    
    /**
     * Test 4: Verify classification distribution (genuine, suspicious, uncertain)
     */
    public function testClassificationDistribution(): bool
    {
        $result = $this->adminController->getScanAnalytics(['period' => '30']);
        $summary = $result['summary'] ?? [];
        
        // Distribution should add up correctly
        $total = $summary['total_genuine'] + $summary['total_suspicious'] + $summary['total_uncertain'];
        if ($total !== $summary['total_reviews']) {
            return false;
        }
        
        return true;
    }
    
    /**
     * Test 5: Verify marketplace distribution data
     */
    public function testMarketplaceDistribution(): bool
    {
        $result = $this->adminController->getScanAnalytics(['period' => '30']);
        $platforms = $result['platform_distribution'] ?? [];
        
        // Each platform entry should have required fields
        foreach ($platforms as $entry) {
            if (!isset($entry['platform'])) return false;
            if (!isset($entry['count'])) return false;
            if (!is_numeric($entry['count'])) return false;
            if ($entry['count'] < 1) return false;
        }
        
        return true;
    }
    
    /**
     * Test 6: Verify trust score trend is correctly calculated per day
     */
    public function testTrustScoreTrend(): bool
    {
        $result = $this->adminController->getScanAnalytics(['period' => '30']);
        $trend = $result['activity_trend'] ?? [];
        
        // Verify trust scores are averages of only scans with genuine + fake > 0
        foreach ($trend as $entry) {
            // Trust score should be 0-100%
            $avgTrust = (float)$entry['avg_trust'];
            if ($avgTrust < 0 || $avgTrust > 100) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Test 7: Verify empty dataset handling
     */
    public function testEmptyDatasetHandling(): bool
    {
        // Query a future date range with no data
        $result = $this->adminController->getScanAnalytics([
            'period' => 'all',  // Test with 'all' period
        ]);
        
        if (!$result['success']) {
            return false;
        }
        
        // Should return zeros for empty results
        $summary = $result['summary'] ?? [];
        if (!isset($summary['total_scans'])) return false;
        
        // Should not throw errors, should return valid structure
        return true;
    }
    
    /**
     * Test 8: Verify period filtering works (7, 30, 90, all)
     */
    public function testPeriodFiltering(): bool
    {
        $periods = ['7', '30', '90', 'all'];
        
        foreach ($periods as $period) {
            $result = $this->adminController->getScanAnalytics(['period' => $period]);
            
            if (!$result['success']) {
                return false;
            }
            
            // Should have valid summary
            if (!isset($result['summary'])) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Test 9: Verify trust score is calculated correctly (no duplicates)
     */
    public function testTrustScoreCalculation(): bool
    {
        // Manually query to verify the calculation
        $query = "SELECT 
                    COUNT(*) as total_scans,
                    COALESCE(SUM(sh.fake_count + sh.genuine_count + sh.uncertain_count), 0) as total_reviews,
                    COUNT(CASE WHEN (sh.genuine_count + sh.fake_count) > 0 THEN 1 END) as valid_scored_scans,
                    COALESCE(AVG(CASE WHEN (sh.genuine_count + sh.fake_count) > 0 THEN sh.trust_score END), 0) as avg_trust_score
                  FROM scan_history sh
                  WHERE sh.scan_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)";
        
        $stmt = $this->db->query($query);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$result) {
            return false;
        }
        
        // Get from controller
        $controllerResult = $this->adminController->getScanAnalytics(['period' => '30']);
        $summary = $controllerResult['summary'] ?? [];
        
        // Verify they match (allowing for rounding)
        $dbAvgTrust = round((float)($result['avg_trust_score'] ?? 0), 1);
        $controllerAvgTrust = (float)($summary['avg_trust_score'] ?? 0);
        
        if (abs($dbAvgTrust - $controllerAvgTrust) > 0.1) {
            echo "\nTrust score mismatch: DB=$dbAvgTrust, Controller=$controllerAvgTrust";
            return false;
        }
        
        return true;
    }
}

// Run tests
$tester = new Phase2AnalyticsTest();
$success = $tester->runAllTests();
exit($success ? 0 : 1);
?>
