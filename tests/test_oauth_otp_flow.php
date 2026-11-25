<?php
// tests/test_oauth_otp_flow.php
require_once __DIR__ . '/../backend/config/env.php';
require_once __DIR__ . '/../backend/config/database.php';
require_once __DIR__ . '/../backend/models/User.php';
require_once __DIR__ . '/../backend/services/OtpService.php';
require_once __DIR__ . '/../backend/controllers/AuthController.php';

$db = (new Database())->getConnection();
$userModel = new User($db);
$otpService = new OtpService($db);
$authController = new AuthController($db);

$passed = 0;
$failed = 0;

function assertCondition($name, $condition) {
    global $passed, $failed;
    if ($condition) {
        echo "  [PASS] $name\n";
        $passed++;
    } else {
        echo "  [FAIL] $name\n";
        $failed++;
    }
}

echo "=== ECHOTRACE AUTHENTICATION & OTP TEST SUITE ===\n\n";

// Test 1: Verify 'purpose' column exists
$cols = $db->query("SHOW COLUMNS FROM email_verification_challenges LIKE 'purpose'")->fetchAll();
assertCondition("Database schema includes 'purpose' column", count($cols) === 1);

// Test 2: Find or create a test user
$testEmail = 'test_verify_user@echotrace.test';
$testUser = $userModel->findByEmail($testEmail);
if (!$testUser) {
    $uid = $userModel->create('test_user_otp', $testEmail, 'Password123!', 'user', null, false);
    $testUser = $userModel->findById($uid);
}
assertCondition("Test user exists", !empty($testUser));
$userId = (int)$testUser['id'];

// Test 3: Create 'registration' OTP challenge
$regOtp = $otpService->createChallenge($userId, 'registration');
assertCondition("Registration OTP is 6 numeric digits", strlen($regOtp) === 6 && ctype_digit($regOtp));

// Test 4: Cannot verify 'registration' OTP with 'login' purpose
$err = '';
$loginVerifyWithRegOtp = $otpService->verifyOtp($userId, $regOtp, 'login', $err);
assertCondition("Purpose isolation: 'login' verification rejects 'registration' OTP", $loginVerifyWithRegOtp === false);

// Test 5: Can verify 'registration' OTP with 'registration' purpose
$err = '';
$regVerifySuccess = $otpService->verifyOtp($userId, $regOtp, 'registration', $err);
assertCondition("Correct 'registration' OTP verifies successfully", $regVerifySuccess === true);

// Test 6: OTP cannot be replayed
$err = '';
$replayResult = $otpService->verifyOtp($userId, $regOtp, 'registration', $err);
assertCondition("Replay prevention: used OTP cannot be verified again", $replayResult === false);

// Test 7: Create 'login' OTP challenge
$loginOtp = $otpService->createChallenge($userId, 'login');
assertCondition("Login OTP is 6 numeric digits", strlen($loginOtp) === 6 && ctype_digit($loginOtp));

// Test 8: Purpose isolation: 'registration' verification rejects 'login' OTP
$err = '';
$regVerifyWithLoginOtp = $otpService->verifyOtp($userId, $loginOtp, 'registration', $err);
assertCondition("Purpose isolation: 'registration' verification rejects 'login' OTP", $regVerifyWithLoginOtp === false);

// Test 9: Incorrect OTP fails and decreases attempts
$err = '';
$wrongOtpResult = $otpService->verifyOtp($userId, '000000', 'login', $err);
assertCondition("Incorrect OTP is rejected with helpful error", $wrongOtpResult === false && str_contains($err, 'Incorrect code'));

// Test 10: Verify login OTP via AuthController::verifyEmail()
$verifyResponse = $authController->verifyEmail([
    'email' => $testEmail,
    'otp' => $loginOtp
]);
assertCondition("AuthController::verifyEmail() succeeds and issues JWT after valid OTP", 
    !empty($verifyResponse['success']) && !empty($verifyResponse['token']));

// Clean up test user
$db->prepare("DELETE FROM email_verification_challenges WHERE user_id = :uid")->execute([':uid' => $userId]);
$db->prepare("DELETE FROM users WHERE id = :uid")->execute([':uid' => $userId]);

echo "\nSummary: $passed passed, $failed failed.\n";
exit($failed > 0 ? 1 : 0);

