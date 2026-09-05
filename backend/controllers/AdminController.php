<?php
// backend/controllers/AdminController.php

class AdminController {
    private $db;
    private $userModel;

    public function __construct($db) {
        $this->db = $db;
        $this->userModel = new User($db);
    }

    public function getDashboardStats() {
        // 1. Total Scans
        $scans_q = "SELECT COUNT(*) as count FROM scan_history";
        $scans_stmt = $this->db->query($scans_q);
        $total_scans = $scans_stmt->fetch()['count'];

        // 2. Total Users
        $users_q = "SELECT COUNT(*) as count FROM users";
        $users_stmt = $this->db->query($users_q);
        $total_users = $users_stmt->fetch()['count'];

        // 3. Fake vs Genuine
        $fake_q = "SELECT SUM(fake_count) as fake, SUM(genuine_count) as genuine FROM scan_history";
        $fake_stmt = $this->db->query($fake_q);
        $res = $fake_stmt->fetch();
        $fake_reviews = $res['fake'] ?? 0;
        $genuine_reviews = $res['genuine'] ?? 0;

        // 4. Avg Trust Score
        $trust_q = "SELECT AVG(trust_score) as avg_trust FROM scan_history";
        $trust_stmt = $this->db->query($trust_q);
        $avg_trust = round($trust_stmt->fetch()['avg_trust'] ?? 0, 2);

        // 5. Scan history over past 7 entries (for chart)
        $history_q = "SELECT sh.trust_score, sh.scan_date, p.title as product_title 
                      FROM scan_history sh 
                      JOIN products p ON sh.product_id = p.id 
                      ORDER BY sh.scan_date DESC LIMIT 7";
        $history_stmt = $this->db->query($history_q);
        $recent_scans = $history_stmt->fetchAll();

        // 6. Platform distribution
        $platform_q = "SELECT p.platform, COUNT(sh.id) as count 
                        FROM scan_history sh 
                        JOIN products p ON sh.product_id = p.id 
                        GROUP BY p.platform";
        $platform_stmt = $this->db->query($platform_q);
        $platforms = $platform_stmt->fetchAll();

        // 7. Feedback / reported reviews count
        $feedback_q = "SELECT COUNT(*) as count FROM feedback";
        $feedback_stmt = $this->db->query($feedback_q);
        $reported_reviews = $feedback_stmt->fetch()['count'];

        return [
            "success" => true,
            "stats" => [
                "total_scans" => $total_scans,
                "total_users" => $total_users,
                "fake_reviews" => $fake_reviews,
                "genuine_reviews" => $genuine_reviews,
                "avg_trust" => $avg_trust,
                "reported_reviews" => $reported_reviews
            ],
            "recent_scans" => array_reverse($recent_scans),
            "platforms" => $platforms
        ];
    }

    public function getUsers() {
        $users = $this->userModel->getAllUsers();
        return ["success" => true, "users" => $users];
    }

    public function toggleUserStatus($data) {
        $id = $data['id'] ?? null;
        $status = $data['status'] ?? null;

        if (!$id || !$status || !in_array($status, ['active', 'blocked'])) {
            return ["success" => false, "error" => "Invalid ID or Status."];
        }

        if ($this->userModel->toggleStatus($id, $status)) {
            return ["success" => true, "message" => "User status updated to '$status'."];
        }
        return ["success" => false, "error" => "Failed to update user status."];
    }

    public function changeUserRole($data) {
        $id = $data['id'] ?? null;
        $role = $data['role'] ?? null;

        if (!$id || !$role || !in_array($role, ['user', 'admin'])) {
            return ["success" => false, "error" => "Invalid ID or Role."];
        }

        if ($this->userModel->changeRole($id, $role)) {
            return ["success" => true, "message" => "User role updated to '$role'."];
        }
        return ["success" => false, "error" => "Failed to update user role."];
    }

    public function deleteUser($id) {
        if (!$id) {
            return ["success" => false, "error" => "User ID is required."];
        }
        if ($this->userModel->deleteUser($id)) {
            return ["success" => true, "message" => "User deleted successfully."];
        }
        return ["success" => false, "error" => "Failed to delete user."];
    }

    public function getSystemLogs() {
        // Fetch AI Logs
        $ai_q = "SELECT * FROM ai_logs ORDER BY id DESC LIMIT 50";
        $ai_stmt = $this->db->query($ai_q);
        $ai_logs = $ai_stmt->fetchAll();

        // Fetch Login Logs
        $login_q = "SELECT ll.*, u.username 
                    FROM login_logs ll 
                    LEFT JOIN users u ON ll.user_id = u.id 
                    ORDER BY ll.id DESC LIMIT 50";
        $login_stmt = $this->db->query($login_q);
        $login_logs = $login_stmt->fetchAll();

        return [
            "success" => true,
            "ai_logs" => $ai_logs,
            "login_logs" => $login_logs
        ];
    }

    public function getCommunityReports() {
        $query = "SELECT f.*, r.review_text, r.author, r.rating, p.title as product_title, u.username as reporter 
                  FROM feedback f 
                  JOIN reviews r ON f.review_id = r.id 
                  JOIN products p ON r.product_id = p.id 
                  JOIN users u ON f.user_id = u.id 
                  ORDER BY f.created_at DESC";
        $stmt = $this->db->query($query);
        return [
            "success" => true,
            "reports" => $stmt->fetchAll()
        ];
    }

    public function getReports() {
        $query = "SELECT r.id, r.generated_at, r.summary_strengths, r.summary_weaknesses,
                         r.summary_recommendation, r.overall_quality, r.genuine_summary,
                         sh.trust_score, sh.fake_count, sh.genuine_count, sh.risk_level, sh.scan_date,
                         p.title as product_title, p.platform, p.url as product_url,
                         u.username as scanned_by
                  FROM reports r
                  JOIN scan_history sh ON r.scan_history_id = sh.id
                  JOIN products p ON r.product_id = p.id
                  LEFT JOIN users u ON sh.user_id = u.id
                  ORDER BY r.generated_at DESC
                  LIMIT 100";
        $stmt = $this->db->query($query);
        $reports = $stmt->fetchAll();

        return [
            "success" => true,
            "reports" => $reports
        ];
    }

    public function getProducts() {
        $query = "SELECT p.id, p.title, p.platform, p.url, p.image_url, p.rating, p.created_at,
                         COUNT(sh.id) as scan_count,
                         ROUND(AVG(sh.fake_count / NULLIF(sh.fake_count + sh.genuine_count, 0)) * 100, 1) as avg_fake_pct,
                         MAX(sh.scan_date) as last_scanned
                  FROM products p
                  LEFT JOIN scan_history sh ON p.id = sh.product_id
                  GROUP BY p.id
                  ORDER BY last_scanned DESC
                  LIMIT 100";
        $stmt = $this->db->query($query);
        $products = $stmt->fetchAll();

        return [
            "success" => true,
            "products" => $products
        ];
    }

    public function triggerRetrain() {
        // 1. Gather all community feedback to train the AI
        $query = "SELECT r.review_text, f.reported_label 
                  FROM feedback f 
                  JOIN reviews r ON f.review_id = r.id";
        $stmt = $this->db->query($query);
        $feedback_list = $stmt->fetchAll();

        if (empty($feedback_list)) {
            return ["success" => false, "error" => "No community reports available for retraining yet."];
        }

        $payload = ["data" => []];
        foreach ($feedback_list as $row) {
            $payload["data"][] = [
                "text" => $row['review_text'],
                "label" => ($row['reported_label'] === 'fake') ? 1 : 0
            ];
        }

        // 2. Call retrain endpoint on Python AI microservice
        $python_url = "http://127.0.0.1:5000/retrain";
        $ch = curl_init($python_url);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 15);
        
        $response = curl_exec($ch);
        $err = curl_error($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($err || $http_code !== 200) {
            return ["success" => false, "error" => "AI Service offline or returned error: $err (Code: $http_code)"];
        }

        $res_data = json_decode($response, true);
        return [
            "success" => true,
            "message" => $res_data['message'] ?? "AI model successfully retrained."
        ];
    }
}
