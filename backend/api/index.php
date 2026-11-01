<?php
require_once __DIR__ . '/../config/env.php';
// backend/api/index.php

// Anti-cache headers for development
header("Cache-Control: no-cache, no-store, must-revalidate");
header("Pragma: no-cache");
header("Expires: 0");

// 1. CORS Headers - MUST be set before ANY output
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed_origins = array_filter(array_map('trim', explode(',', echotrace_env('ECHOTRACE_ALLOWED_ORIGINS', 'http://localhost:8000,http://127.0.0.1:8000,http://localhost,http://127.0.0.1'))));
if ($origin !== '' && in_array($origin, $allowed_origins, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Vary: Origin');
}
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, PATCH");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept");
header("Access-Control-Max-Age: 86400");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

// 2. Error Reporting
error_reporting(E_ALL);
ini_set('display_errors', echotrace_env('ECHOTRACE_DEBUG', '0') === '1' ? '1' : '0');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header('Permissions-Policy: camera=(), microphone=(), geolocation=()');

// 3. Include Database & Middleware
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';

// 4. Include Models
require_once __DIR__ . '/../models/User.php';
require_once __DIR__ . '/../models/Product.php';
require_once __DIR__ . '/../models/Review.php';
require_once __DIR__ . '/../models/ScanHistory.php';
require_once __DIR__ . '/../models/Notification.php';

// 5. Include Controllers
require_once __DIR__ . '/../controllers/AuthController.php';
require_once __DIR__ . '/../controllers/ProductController.php';
require_once __DIR__ . '/../controllers/ScanController.php';
require_once __DIR__ . '/../controllers/AdminController.php';
require_once __DIR__ . '/../services/RateLimiter.php';
require_once __DIR__ . '/../services/ReviewDatasetImporter.php';

// 6. Connect Database
$database = new Database();
$db = $database->getConnection();
AuthMiddleware::setDatabase($db);

// 7. Parse Route Parameter
$route = $_GET['route'] ?? '';
$request_method = $_SERVER['REQUEST_METHOD'];
$content_type = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? ''));
$is_multipart = str_starts_with($content_type, 'multipart/form-data');
$max_request_bytes = in_array($route, ['scan/screenshot-ocr', 'scan/uploaded-reviews'], true)
    ? 26 * 1024 * 1024
    : 2 * 1024 * 1024;

// Helper to get POST JSON input
$input_data = [];
if (intval($_SERVER['CONTENT_LENGTH'] ?? 0) > $max_request_bytes) {
    http_response_code(413);
    echo json_encode(["success" => false, "error" => "Request body is too large."]);
    exit;
}
if ($request_method === 'POST' || $request_method === 'PUT' || $request_method === 'PATCH' || $request_method === 'DELETE') {
    if ($is_multipart) {
        $input_data = $_POST;
    } else {
        $raw_input = file_get_contents('php://input');
        if (is_string($raw_input) && strlen($raw_input) > $max_request_bytes) {
            http_response_code(413);
            echo json_encode(["success" => false, "error" => "Request body is too large."]);
            exit;
        }
        $decoded = json_decode($raw_input, true);
        if (is_array($decoded)) {
            $input_data = $decoded;
        } else {
            $input_data = $_POST;
        }
    }
}

// 8. Router Implementation
try {
    switch ($route) {
        case 'notifications':
            if ($request_method !== 'GET') {
                http_response_code(405);
                echo json_encode(['success' => false, 'error' => 'Method Not Allowed']);
                break;
            }
            $user = AuthMiddleware::demandAuth();
            $limit = min(50, max(1, intval($_GET['limit'] ?? 20)));
            $offset = max(0, intval($_GET['offset'] ?? 0));
            $model = new Notification($db);
            echo json_encode(['success' => true, 'notifications' => $model->listForUser($user['id'], $limit, $offset), 'unread_count' => $model->unreadCount($user['id'])]);
            break;
        case 'notifications/unread-count':
            if ($request_method !== 'GET') {
                http_response_code(405);
                echo json_encode(['success' => false, 'error' => 'Method Not Allowed']);
                break;
            }
            $user = AuthMiddleware::demandAuth();
            echo json_encode(['success' => true, 'unread_count' => (new Notification($db))->unreadCount($user['id'])]);
            break;
        case 'notifications/read':
            if ($request_method !== 'PATCH') {
                http_response_code(405);
                echo json_encode(['success' => false, 'error' => 'Method Not Allowed']);
                break;
            }
            $user = AuthMiddleware::demandAuth();
            $id = intval($input_data['id'] ?? 0);
            $ok = (new Notification($db))->markRead($id, $user['id']);
            if (!$ok) http_response_code(404);
            echo json_encode(['success' => $ok, 'error' => $ok ? null : 'Notification not found.']);
            break;
        case 'notifications/read-all':
            if ($request_method !== 'PATCH') {
                http_response_code(405);
                echo json_encode(['success' => false, 'error' => 'Method Not Allowed']);
                break;
            }
            $user = AuthMiddleware::demandAuth();
            $count = (new Notification($db))->markAllRead($user['id']);
            echo json_encode(['success' => true, 'updated_count' => $count]);
            break;
        case 'notifications/delete':
            if ($request_method !== 'DELETE') {
                http_response_code(405);
                echo json_encode(['success' => false, 'error' => 'Method Not Allowed']);
                break;
            }
            $user = AuthMiddleware::demandAuth();
            $ok = (new Notification($db))->delete(intval($input_data['id'] ?? 0), $user['id']);
            if (!$ok) http_response_code(404);
            echo json_encode(['success' => $ok, 'error' => $ok ? null : 'Notification not found.']);
            break;
        case 'notifications/clear':
            if ($request_method !== 'DELETE') {
                http_response_code(405);
                echo json_encode(['success' => false, 'error' => 'Method Not Allowed']);
                break;
            }
            $user = AuthMiddleware::demandAuth();
            $count = (new Notification($db))->clear($user['id']);
            echo json_encode(['success' => true, 'deleted_count' => $count]);
            break;

        // --- System Health Route ---
        case 'system/health':
            if ($request_method !== 'GET') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            echo json_encode([
                "success" => true,
                "status" => "online",
                "service" => "EchoTrace API Engine",
                "timestamp" => time()
            ]);
            break;

        // --- Authentication Routes ---
        case 'auth/register':
            if ($request_method !== 'POST') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            if (!RateLimiter::allow('auth-register', (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 5, 600)) {
                http_response_code(429);
                echo json_encode(['success' => false, 'error' => 'Too many registration attempts. Please try again later.']);
                break;
            }
            $authController = new AuthController($db);
            $response = $authController->register($input_data);
            echo json_encode($response);
            break;

        case 'auth/login':
            if ($request_method !== 'POST') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            if (!RateLimiter::allow('auth-login', (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 10, 60)) {
                http_response_code(429);
                echo json_encode(['success' => false, 'error' => 'Too many login attempts. Please wait and try again.']);
                break;
            }
            $authController = new AuthController($db);
            $response = $authController->login($input_data);
            if (!$response['success']) {
                http_response_code(intval($response['status'] ?? 401));
            }
            unset($response['status']);
            echo json_encode($response);
            break;

        case 'auth/google-login':
            if ($request_method !== 'POST') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            if (!RateLimiter::allow('auth-google-login', (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 15, 60)) {
                http_response_code(429);
                echo json_encode(['success' => false, 'error' => 'Too many sign-in attempts. Please wait and try again.']);
                break;
            }
            $authController = new AuthController($db);
            $response = $authController->googleLogin($input_data);
            if (!$response['success']) {
                http_response_code(intval($response['status'] ?? 400));
            }
            unset($response['status']);
            echo json_encode($response);
            break;

        case 'auth/google-client-id':
            if ($request_method !== 'GET') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            require_once __DIR__ . '/../services/GoogleAuthService.php';
            $cid = GoogleAuthService::getClientId();
            echo json_encode([
                "success" => true,
                "client_id" => $cid,
                "configured" => ($cid !== '')
            ]);
            break;

        case 'auth/verify-email':
            if ($request_method !== 'POST') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            if (!RateLimiter::allow('auth-verify-email', (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 10, 60)) {
                http_response_code(429);
                echo json_encode(['success' => false, 'error' => 'Too many verification attempts. Please wait.']);
                break;
            }
            $authController = new AuthController($db);
            $response = $authController->verifyEmail($input_data);
            if (!$response['success']) {
                http_response_code(intval($response['status'] ?? 400));
            }
            unset($response['status']);
            echo json_encode($response);
            break;

        case 'auth/resend-otp':
            if ($request_method !== 'POST') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            if (!RateLimiter::allow('auth-resend-otp', (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 5, 300)) {
                http_response_code(429);
                echo json_encode(['success' => false, 'error' => 'Too many requests. Please wait a few minutes before resending.']);
                break;
            }
            $authController = new AuthController($db);
            $response = $authController->resendOtp($input_data);
            if (!$response['success']) {
                http_response_code(intval($response['status'] ?? 400));
            }
            unset($response['status']);
            echo json_encode($response);
            break;

        case 'auth/logout':
            $isSecure = (echotrace_env('ECHOTRACE_COOKIE_SECURE', '0') === '1');
            setcookie('echotrace_token', '', [
                'expires' => time() - 3600,
                'path' => '/',
                'secure' => $isSecure,
                'httponly' => true,
                'samesite' => 'Lax'
            ]);
            echo json_encode(["success" => true, "message" => "Logged out successfully."]);
            break;

        case 'auth/session':
            if ($request_method !== 'GET') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            $currentUser = AuthMiddleware::authenticate();
            if ($currentUser && is_array($currentUser) && !empty($currentUser['id'])) {
                $authController = new AuthController($db);
                $response = $authController->getProfile($currentUser['id']);
                echo json_encode($response);
            } else {
                echo json_encode(["success" => false, "authenticated" => false, "user" => null]);
            }
            break;

        case 'auth/profile':
            $currentUser = AuthMiddleware::demandAuth();
            $authController = new AuthController($db);
            if ($request_method === 'GET') {
                $response = $authController->getProfile($currentUser['id']);
                echo json_encode($response);
            } else {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
            }
            break;

        case 'auth/profile/update':
            if ($request_method !== 'POST') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            $currentUser = AuthMiddleware::demandAuth();
            $authController = new AuthController($db);
            $response = $authController->updateProfile($currentUser['id'], $input_data);
            echo json_encode($response);
            break;

        case 'auth/profile/password':
            if ($request_method !== 'POST') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            $currentUser = AuthMiddleware::demandAuth();
            $authController = new AuthController($db);
            $response = $authController->changePassword($currentUser['id'], $input_data);
            echo json_encode($response);
            break;

        case 'auth/forgot-password':
            if ($request_method !== 'POST') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            if (!RateLimiter::allow('forgot-password', (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 5, 300)) {
                http_response_code(429);
                echo json_encode(['success' => false, 'error' => 'Too many password reset requests. Please try again later.']);
                break;
            }
            $authController = new AuthController($db);
            $response = $authController->forgotPassword($input_data);
            echo json_encode($response);
            break;

        case 'auth/reset-password':
            if ($request_method !== 'POST') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            if (!RateLimiter::allow('reset-password', (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 10, 300)) {
                http_response_code(429);
                echo json_encode(['success' => false, 'error' => 'Too many password reset attempts. Please try again later.']);
                break;
            }
            $authController = new AuthController($db);
            $response = $authController->resetPassword($input_data);
            echo json_encode($response);
            break;

        // --- Scan & Reviews Routes ---
        case 'scan':
            if ($request_method !== 'POST') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            $currentUser = AuthMiddleware::demandAuth();
            $scanController = new ScanController($db);
            $response = $scanController->scanProduct(intval($currentUser['id']), $input_data);
            if (!$response['success']) http_response_code(422);
            echo json_encode($response);
            break;

        case 'scan/history':
            if ($request_method !== 'GET') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            $currentUser = AuthMiddleware::demandAuth();
            $scanController = new ScanController($db);
            $response = $scanController->getHistory($currentUser['id']);
            echo json_encode($response);
            break;

        case 'scan/model-accuracy':
            if ($request_method !== 'GET') {
                http_response_code(405);
                echo json_encode(['success' => false, 'error' => 'Method Not Allowed']);
                break;
            }
            AuthMiddleware::demandAuth();
            $adminController = new AdminController($db);
            $eval = $adminController->getModelEvaluation();
            echo json_encode(['success' => true, 'model_evaluation' => $eval]);
            break;

        case 'scan/manual-prepare':
            if ($request_method !== 'POST') {
                http_response_code(405);
                echo json_encode(['success' => false, 'error' => 'Method Not Allowed']);
                break;
            }
            AuthMiddleware::demandAuth();
            $response = (new ScanController($db))->prepareManualUrlScan($input_data['url'] ?? '');
            if (!$response['success']) http_response_code(intval($response['status'] ?? 422));
            unset($response['status']);
            echo json_encode($response);
            break;

        case 'scan/manual':
            if ($request_method !== 'POST') {
                http_response_code(405);
                echo json_encode(['success' => false, 'error' => 'Method Not Allowed']);
                break;
            }
            $currentUser = AuthMiddleware::demandAuth();
            if (!RateLimiter::allow('scan-manual', (string)$currentUser['id'], 10, 60)) {
                http_response_code(429);
                echo json_encode(['success' => false, 'error_code' => 'scan_rate_limited', 'error' => 'Too many manual scans were requested. Wait a minute and retry.']);
                break;
            }
            $response = (new ScanController($db))->scanManualUrl(intval($currentUser['id']), $input_data['url'] ?? '', is_array($input_data['options'] ?? null) ? $input_data['options'] : []);
            if (!$response['success']) http_response_code(intval($response['status'] ?? 422));
            unset($response['status']);
            echo json_encode($response);
            break;

        case 'scan/manual-reviews':
            if ($request_method !== 'POST') {
                http_response_code(405);
                echo json_encode(['success' => false, 'error' => 'Method Not Allowed']);
                break;
            }
            $currentUser = AuthMiddleware::demandAuth();
            if (!RateLimiter::allow('scan-manual-reviews', (string)$currentUser['id'], 10, 60)) {
                http_response_code(429);
                echo json_encode(['success' => false, 'error_code' => 'scan_rate_limited', 'error' => 'Too many manual review submissions were requested. Wait a minute and retry.']);
                break;
            }
            $response = (new ScanController($db))->scanManualReviews(
                intval($currentUser['id']),
                $input_data['url'] ?? '',
                $input_data['reviews'] ?? [],
                is_array($input_data['metadata'] ?? null) ? $input_data['metadata'] : [],
                (string)($input_data['source'] ?? 'manual'),
                is_array($input_data['options'] ?? null) ? $input_data['options'] : []
            );
            if (!$response['success']) http_response_code(intval($response['status'] ?? 422));
            unset($response['status']);
            echo json_encode($response);
            break;

        case 'scan/screenshot-ocr':
            if ($request_method !== 'POST') {
                http_response_code(405);
                echo json_encode(['success' => false, 'error' => 'Method Not Allowed']);
                break;
            }
            $currentUser = AuthMiddleware::demandAuth();
            if (!RateLimiter::allow('scan-screenshot-ocr', (string)$currentUser['id'], 10, 60)) {
                http_response_code(429);
                echo json_encode(['success' => false, 'error_code' => 'scan_rate_limited', 'error' => 'Too many OCR requests were made. Wait a minute and retry.']);
                break;
            }
            $response = (new ScanController($db))->extractScreenshotReviews(
                is_array($_FILES['screenshots'] ?? null) ? $_FILES['screenshots'] : [],
                (string)($_POST['platform'] ?? 'auto'),
                (string)($_POST['title'] ?? '')
            );
            if (!$response['success']) http_response_code(intval($response['status'] ?? 422));
            unset($response['status']);
            echo json_encode($response);
            break;

        case 'scan/uploaded-reviews':
            if ($request_method !== 'POST') {
                http_response_code(405);
                echo json_encode(['success' => false, 'error' => 'Method Not Allowed']);
                break;
            }
            $currentUser = AuthMiddleware::demandAuth();
            if (!RateLimiter::allow('scan-uploaded-reviews', (string)$currentUser['id'], 10, 60)) {
                http_response_code(429);
                echo json_encode(['success' => false, 'error_code' => 'scan_rate_limited', 'error' => 'Too many uploaded review scans were requested. Wait a minute and retry.']);
                break;
            }
            $mapping = [];
            if (!empty($_POST['mapping'])) {
                $decodedMapping = json_decode((string)$_POST['mapping'], true);
                if (is_array($decodedMapping)) $mapping = $decodedMapping;
            }
            $options = [];
            if (!empty($_POST['options'])) {
                $decodedOptions = json_decode((string)$_POST['options'], true);
                if (is_array($decodedOptions)) $options = $decodedOptions;
            }
            $response = (new ScanController($db))->scanUploadedReviewFile(
                intval($currentUser['id']),
                is_array($_FILES['file'] ?? null) ? $_FILES['file'] : [],
                $mapping,
                filter_var($_POST['preview'] ?? false, FILTER_VALIDATE_BOOLEAN),
                $options
            );
            if (!$response['success']) http_response_code(intval($response['status'] ?? 422));
            unset($response['status']);
            echo json_encode($response);
            break;

        case 'scan/delete':
            if ($request_method !== 'DELETE') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            $currentUser = AuthMiddleware::demandAuth();
            $scan_id = filter_input(INPUT_GET, 'scan_id', FILTER_VALIDATE_INT);
            if (!$scan_id || $scan_id < 1) {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "A valid scan_id parameter is required."]);
                break;
            }
            $scanController = new ScanController($db);
            $response = $scanController->deleteScan($scan_id, intval($currentUser['id']));
            if (!$response['success']) {
                http_response_code(intval($response['status'] ?? 500));
            } else {
                $response['message'] = "Scan record deleted successfully.";
            }
            unset($response['status']);
            echo json_encode($response);
            break;

        case 'scan/delete-selected':
            if ($request_method !== 'DELETE') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            $currentUser = AuthMiddleware::demandAuth();
            $scanIds = $input_data['scan_ids'] ?? [];
            $scanController = new ScanController($db);
            $response = $scanController->deleteScans($scanIds, intval($currentUser['id']));
            if (!$response['success']) http_response_code(intval($response['status'] ?? 500));
            else $response['message'] = $response['deleted_count'] . " audit record(s) deleted successfully.";
            unset($response['status']);
            echo json_encode($response);
            break;

        case 'scan/delete-all':
            if ($request_method !== 'DELETE') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            $currentUser = AuthMiddleware::demandAuth();
            $scanController = new ScanController($db);
            $response = $scanController->deleteAllScans(intval($currentUser['id']));
            if (!$response['success']) http_response_code(intval($response['status'] ?? 500));
            else $response['message'] = $response['deleted_count'] . " audit record(s) deleted successfully.";
            unset($response['status']);
            echo json_encode($response);
            break;

        case 'scan/report':
            if ($request_method !== 'GET') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            $currentUser = AuthMiddleware::demandAuth();
            $scan_id = filter_input(INPUT_GET, 'scan_id', FILTER_VALIDATE_INT);
            if (!$scan_id || $scan_id < 1) {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "scan_id parameter is required."]);
                break;
            }
            $scanController = new ScanController($db);
            $response = $scanController->getReport(
                $scan_id,
                intval($currentUser['id']),
                ($currentUser['role'] ?? '') === 'admin'
            );
            if (!$response['success']) {
                http_response_code(404);
            }
            echo json_encode($response);
            break;

        // --- RAG Machine Learning Routes ---
        case 'rag/query':
            if ($request_method !== 'POST') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            AuthMiddleware::demandAuth();
            $scanController = new ScanController($db);
            $response = $scanController->ragQuery($input_data);
            echo json_encode($response);
            break;

        case 'rag/knowledge':
            if ($request_method !== 'GET') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            AuthMiddleware::demandAdmin();
            $scanController = new ScanController($db);
            $response = $scanController->ragKnowledge();
            echo json_encode($response);
            break;

        case 'rag/knowledge/add':
            if ($request_method !== 'POST') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            AuthMiddleware::demandAdmin();
            $scanController = new ScanController($db);
            $response = $scanController->ragAddKnowledge($input_data);
            echo json_encode($response);
            break;

        case 'rag/knowledge/delete':
            if ($request_method !== 'POST') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            AuthMiddleware::demandAdmin();
            $scanController = new ScanController($db);
            $response = $scanController->ragDeleteKnowledge($input_data);
            echo json_encode($response);
            break;

        case 'rag/knowledge/reindex':
            if ($request_method !== 'POST') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            AuthMiddleware::demandAdmin();
            $scanController = new ScanController($db);
            $response = $scanController->ragReindex();
            echo json_encode($response);
            break;

        case 'rag/stats':
            if ($request_method !== 'GET') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            AuthMiddleware::demandAdmin();
            $scanController = new ScanController($db);
            $response = $scanController->ragStats();
            echo json_encode($response);
            break;

        // --- Community Feedback Route ---
        case 'review/report':
            if ($request_method !== 'POST') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            $currentUser = AuthMiddleware::demandAuth();
            $review_id = $input_data['review_id'] ?? null;
            $reported_label = $input_data['reported_label'] ?? null; // 'fake' or 'genuine'
            $comments = $input_data['comments'] ?? '';

            if (!$review_id || !$reported_label || !in_array($reported_label, ['fake', 'genuine'])) {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "review_id and valid reported_label are required."]);
                break;
            }

            $query = "INSERT INTO feedback (review_id, user_id, reported_label, comments) 
                      VALUES (:review_id, :user_id, :reported_label, :comments)";
            $stmt = $db->prepare($query);
            $stmt->bindParam(':review_id', $review_id);
            $stmt->bindParam(':user_id', $currentUser['id']);
            $stmt->bindParam(':reported_label', $reported_label);
            $stmt->bindParam(':comments', $comments);

            if ($stmt->execute()) {
                echo json_encode(["success" => true, "message" => "Thank you! Your feedback has been logged."]);
            } else {
                echo json_encode(["success" => false, "error" => "Failed to submit feedback."]);
            }
            break;

        // --- Admin Dashboard & Operations Routes ---
        case 'admin/stats':
        case 'admin/dashboard':
            AuthMiddleware::demandAdmin();
            $adminController = new AdminController($db);
            $response = $adminController->getDashboardStats();

            // Adapt the response keys to match what the frontend expects for dashboard
            $stats = $response['stats'] ?? [];
            $modelEvaluation = $response['model_evaluation'] ?? ['status' => 'not_evaluated', 'test_accuracy' => null];
            $dashboard = [
                "total_users" => $stats['total_users'] ?? 0,
                "ai_accuracy" => $modelEvaluation['test_accuracy'] ?? null,
                "fake_reviews" => $stats['fake_reviews'] ?? 0,
                "active_users" => $stats['total_users'] ?? 0,
                "total_products" => $stats['total_scans'] ?? 0
            ];

            echo json_encode([
                "success" => true,
                "dashboard" => $dashboard,
                "model_evaluation" => $modelEvaluation,
                "stats" => $stats,
                "recent_scans" => $response['recent_scans'] ?? [],
                "platforms" => $response['platforms'] ?? []
            ]);
            break;

        case 'admin/analytics':
            if ($request_method !== 'GET') {
                http_response_code(405);
                echo json_encode(['success' => false, 'error' => 'Method Not Allowed']);
                break;
            }
            AuthMiddleware::demandAdmin();
            echo json_encode((new AdminController($db))->getAnalytics($_GET));
            break;

        case 'admin/users':
            AuthMiddleware::demandAdmin();
            $adminController = new AdminController($db);
            $response = $adminController->getUsers();
            echo json_encode($response);
            break;

        case 'admin/users/toggle':
            if ($request_method !== 'POST') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            AuthMiddleware::demandAdmin();
            $adminController = new AdminController($db);
            $response = $adminController->toggleUserStatus($input_data);
            echo json_encode($response);
            break;

        case 'admin/users/role':
            if ($request_method !== 'POST') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            AuthMiddleware::demandAdmin();
            $adminController = new AdminController($db);
            $response = $adminController->changeUserRole($input_data);
            echo json_encode($response);
            break;

        case 'admin/users/delete':
            if ($request_method !== 'DELETE') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            AuthMiddleware::demandAdmin();
            $id = $_GET['id'] ?? null;
            $adminController = new AdminController($db);
            $response = $adminController->deleteUser($id);
            echo json_encode($response);
            break;

        case 'admin/logs':
            AuthMiddleware::demandAdmin();
            $adminController = new AdminController($db);
            $response = $adminController->getSystemLogs();
            echo json_encode($response);
            break;

        case 'admin/reports':
            AuthMiddleware::demandAdmin();
            $adminController = new AdminController($db);
            $response = $adminController->getReports();
            echo json_encode($response);
            break;

        case 'admin/products':
            AuthMiddleware::demandAdmin();
            $adminController = new AdminController($db);
            $response = $adminController->getProducts();
            echo json_encode($response);
            break;

        case 'admin/feedback':
            AuthMiddleware::demandAdmin();
            $adminController = new AdminController($db);
            $response = $adminController->getCommunityReports();
            echo json_encode($response);
            break;

        case 'admin/retrain':
        case 'admin/ai/retrain':
            if ($request_method !== 'POST') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            AuthMiddleware::demandAdmin();
            $adminController = new AdminController($db);
            $response = $adminController->triggerRetrain();
            echo json_encode($response);
            break;

        case 'support/contact':
            if ($request_method !== 'POST') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            $name = trim($input_data['name'] ?? '');
            $email = trim($input_data['email'] ?? '');
            $subject = trim($input_data['subject'] ?? '');
            $message = trim($input_data['message'] ?? '');

            if (empty($name) || empty($email) || empty($subject) || empty($message)) {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "All fields (name, email, subject, message) are required."]);
                break;
            }

            $query = "INSERT INTO support_messages (name, email, subject, message) 
                      VALUES (:name, :email, :subject, :message)";
            $stmt = $db->prepare($query);
            $stmt->bindParam(':name', $name);
            $stmt->bindParam(':email', $email);
            $stmt->bindParam(':subject', $subject);
            $stmt->bindParam(':message', $message);

            if ($stmt->execute()) {
                // Also write to login_logs or simple logs if we want it visible
                echo json_encode(["success" => true, "message" => "Thank you! Your message has been sent successfully."]);
            } else {
                echo json_encode(["success" => false, "error" => "Failed to log contact message."]);
            }
            break;

        case 'extension/download':
            // Stream the chrome_extension folder as a ZIP file
            $extDir = __DIR__ . '/../../chrome_extension';
            if (!is_dir($extDir)) {
                http_response_code(404);
                echo json_encode(["success" => false, "error" => "Extension directory not found."]);
                break;
            }

            $zipFile = sys_get_temp_dir() . '/echotrace-extension.zip';

            if (file_exists($zipFile)) {
                unlink($zipFile);
            }

            $zip = new ZipArchive();
            if ($zip->open($zipFile, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
                http_response_code(500);
                echo json_encode(["success" => false, "error" => "Could not create ZIP file."]);
                break;
            }

            // Recursively add all files from chrome_extension folder
            $iterator = new RecursiveIteratorIterator(
                new RecursiveDirectoryIterator($extDir, RecursiveDirectoryIterator::SKIP_DOTS),
                RecursiveIteratorIterator::SELF_FIRST
            );

            foreach ($iterator as $file) {
                $filePath  = $file->getRealPath();
                $relativePath = 'echotrace-extension/' . substr($filePath, strlen($extDir) + 1);
                $relativePath = str_replace('\\', '/', $relativePath);

                if ($file->isDir()) {
                    $zip->addEmptyDir($relativePath);
                } else {
                    $zip->addFile($filePath, $relativePath);
                }
            }

            $zip->close();

            // Clear JSON header and send ZIP
            header_remove('Content-Type');
            header('Content-Type: application/zip');
            header('Content-Disposition: attachment; filename="echotrace-extension.zip"');
            header('Content-Length: ' . filesize($zipFile));
            header('Pragma: no-cache');
            header('Expires: 0');

            readfile($zipFile);
            unlink($zipFile);
            exit;

        default:
            http_response_code(404);
            echo json_encode(["success" => false, "error" => "Route not found: '$route'"]);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    error_log('EchoTrace API server exception on route ' . ($route ?: 'unknown') . ': ' . $e->getMessage());
    echo json_encode(["success" => false, "error" => "The server could not complete that request. Please try again later."]);
}
