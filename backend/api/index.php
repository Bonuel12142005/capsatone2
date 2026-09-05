<?php
// backend/api/index.php

// 1. CORS Headers - MUST be set before ANY output
$origin = $_SERVER['HTTP_ORIGIN'] ?? 'http://localhost';

// Only allow requests from localhost origins
$allowed_origins = [
    'http://localhost',
    'http://127.0.0.1',
    'http://localhost:80',
    'http://127.0.0.1:80',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
];
if (!in_array($origin, $allowed_origins)) {
    $origin = 'http://localhost';
}

header("Access-Control-Allow-Origin: $origin");
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
ini_set('display_errors', 1);

// 3. Include Database & Middleware
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';

// 4. Include Models
require_once __DIR__ . '/../models/User.php';
require_once __DIR__ . '/../models/Product.php';
require_once __DIR__ . '/../models/Review.php';
require_once __DIR__ . '/../models/ScanHistory.php';

// 5. Include Controllers
require_once __DIR__ . '/../controllers/AuthController.php';
require_once __DIR__ . '/../controllers/ProductController.php';
require_once __DIR__ . '/../controllers/ScanController.php';
require_once __DIR__ . '/../controllers/AdminController.php';

// 6. Connect Database
$database = new Database();
$db = $database->getConnection();

// 7. Parse Route Parameter
$route = $_GET['route'] ?? '';
$request_method = $_SERVER['REQUEST_METHOD'];

// Helper to get POST JSON input
$input_data = [];
if ($request_method === 'POST' || $request_method === 'PUT') {
    $raw_input = file_get_contents('php://input');
    $decoded = json_decode($raw_input, true);
    if (is_array($decoded)) {
        $input_data = $decoded;
    } else {
        $input_data = $_POST;
    }
}

// 8. Router Implementation
try {
    switch ($route) {
        
        // --- Authentication Routes ---
        case 'auth/register':
            if ($request_method !== 'POST') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
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
            $authController = new AuthController($db);
            $response = $authController->login($input_data);
            echo json_encode($response);
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

        // --- Scan & Reviews Routes ---
        case 'scan':
            if ($request_method !== 'POST') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            // Optional auth (extension can scan anonymously or logged in)
            $currentUser = AuthMiddleware::authenticate();
            $userId = $currentUser ? $currentUser['id'] : null;

            $scanController = new ScanController($db);
            $response = $scanController->scanProduct($userId, $input_data);
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

        case 'scan/report':
            if ($request_method !== 'GET') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
            $scan_id = $_GET['scan_id'] ?? null;
            if (!$scan_id) {
                http_response_code(400);
                echo json_encode(["success" => false, "error" => "scan_id parameter is required."]);
                break;
            }
            $scanController = new ScanController($db);
            $response = $scanController->getReport($scan_id);
            echo json_encode($response);
            break;

        // --- RAG Machine Learning Routes ---
        case 'rag/query':
            if ($request_method !== 'POST') {
                http_response_code(405);
                echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
                break;
            }
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
            $dashboard = [
                "total_users" => $stats['total_users'] ?? 0,
                "ai_accuracy" => 92.5, 
                "fake_reviews" => $stats['fake_reviews'] ?? 0,
                "active_users" => $stats['total_users'] ?? 0,
                "total_products" => $stats['total_scans'] ?? 0
            ];
            
            echo json_encode([
                "success" => true,
                "dashboard" => $dashboard,
                "stats" => $stats,
                "recent_scans" => $response['recent_scans'] ?? [],
                "platforms" => $response['platforms'] ?? []
            ]);
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

        default:
            http_response_code(404);
            echo json_encode(["success" => false, "error" => "Route not found: '$route'"]);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Server exception: " . $e->getMessage()]);
}
