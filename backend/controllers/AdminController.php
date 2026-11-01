<?php
// backend/controllers/AdminController.php

require_once __DIR__ . '/../config/env.php';

class AdminController
{
    private \PDO $db;
    private User $userModel;

    public function __construct(\PDO $db)
    {
        $this->db = $db;
        $this->userModel = new User($db);
    }

    /**
     * Read the latest persisted evaluation for the model currently on disk.
     * The legacy `accuracy` field was always computed from y_test; new training
     * runs also persist the explicit `test_accuracy` field.
     */
    public function getModelEvaluation(): array
    {
        $modelsDir = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'python_ai' . DIRECTORY_SEPARATOR . 'models';
        $metricsPath = $modelsDir . DIRECTORY_SEPARATOR . 'training_metrics.json';
        $modelPath = $modelsDir . DIRECTORY_SEPARATOR . 'fake_review_model.pkl';
        $vectorizerPath = $modelsDir . DIRECTORY_SEPARATOR . 'tfidf_vectorizer.pkl';
        $notEvaluated = [
            'status' => 'not_evaluated',
            'test_accuracy' => null,
            'validation_accuracy' => null,
            'model_version' => null,
            'evaluated_at' => null,
            'evaluation_split' => null,
            'test_size' => null,
            'validation_size' => null,
            'dataset_versions' => [],
            'dataset_scope' => null,
            'split_strategy' => null,
            'note' => 'No valid held-out test evaluation is available.'
        ];

        try {
            if (!is_file($metricsPath) || !is_file($modelPath) || !is_file($vectorizerPath)) {
                return $notEvaluated;
            }

            $raw = file_get_contents($metricsPath);
            $metrics = $raw === false ? null : json_decode($raw, true);
            $accuracy = $metrics['test_accuracy'] ?? $metrics['accuracy'] ?? null;
            $testSize = filter_var($metrics['test_size'] ?? null, FILTER_VALIDATE_INT);
            $evaluatedAt = $metrics['evaluated_at'] ?? $metrics['trained_at'] ?? null;

            // A metrics file older than the model can describe a different artifact.
            $metricsMtime = filemtime($metricsPath);
            $artifactMtime = max((int) filemtime($modelPath), (int) filemtime($vectorizerPath));
            $isCurrentArtifact = $metricsMtime !== false && $metricsMtime + 2 >= $artifactMtime;
            $isValidDate = is_string($evaluatedAt) && strtotime($evaluatedAt) !== false;
            if (
                !is_array($metrics) || !is_numeric($accuracy) || (float) $accuracy < 0 || (float) $accuracy > 100
                || $testSize === false || $testSize < 1 || !$isValidDate || !$isCurrentArtifact
            ) {
                error_log('[EchoTrace] Model evaluation artifact is missing, stale, or invalid.');
                return $notEvaluated;
            }

            $datasets = array_values(array_filter(
                is_array($metrics['dataset_versions'] ?? null) ? $metrics['dataset_versions'] : [],
                'is_string'
            ));
            $syntheticOnly = !empty($datasets) && count(array_filter(
                $datasets,
                static fn($name) => str_starts_with(strtolower($name), 'synthetic')
            )) === count($datasets);

            return [
                'status' => 'evaluated',
                'test_accuracy' => round((float) $accuracy, 2),
                'validation_accuracy' => isset($metrics['validation_accuracy']) && is_numeric($metrics['validation_accuracy'])
                    ? round((float) $metrics['validation_accuracy'], 2) : null,
                'model_version' => (string) ($metrics['pipeline_version'] ?? 'Unknown'),
                'evaluated_at' => $evaluatedAt,
                'evaluation_split' => (string) ($metrics['evaluation_split'] ?? 'held_out_test'),
                'test_size' => (int) $testSize,
                'validation_size' => isset($metrics['validation_size']) ? (int) $metrics['validation_size'] : null,
                'dataset_versions' => $datasets,
                'dataset_scope' => (string) ($metrics['dataset_scope'] ?? ($syntheticOnly ? 'synthetic_labeled_data' : 'labeled_data')),
                'split_strategy' => (string) ($metrics['split_strategy'] ?? 'group_aware'),
                'note' => (string) ($metrics['note'] ?? '')
            ];
        } catch (\Throwable $error) {
            error_log('[EchoTrace] Could not read model evaluation: ' . $error->getMessage());
            return $notEvaluated;
        }
    }

    public function getDashboardStats()
    {
        // 1. Total Scans
        $scans_q = "SELECT COUNT(*) as count FROM scan_history";
        $scans_stmt = $this->db->query($scans_q);
        $total_scans = $scans_stmt->fetch()['count'];

        // 2. Total Users
        $users_q = "SELECT COUNT(*) as count FROM users";
        $users_stmt = $this->db->query($users_q);
        $total_users = $users_stmt->fetch()['count'];

        // 3. Fake vs Genuine
        $fake_q = "SELECT SUM(fake_count) as fake, SUM(genuine_count) as genuine, SUM(uncertain_count) as uncertain FROM scan_history";
        $fake_stmt = $this->db->query($fake_q);
        $res = $fake_stmt->fetch();
        $fake_reviews = $res['fake'] ?? 0;
        $genuine_reviews = $res['genuine'] ?? 0;
        $uncertain_reviews = $res['uncertain'] ?? 0;

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
                "uncertain_reviews" => $uncertain_reviews,
                "avg_trust" => $avg_trust,
                "reported_reviews" => $reported_reviews
            ],
            "model_evaluation" => $this->getModelEvaluation(),
            "recent_scans" => array_reverse($recent_scans),
            "platforms" => $platforms
        ];
    }

    public function getAnalytics(array $filters): array
    {
        $days = intval($filters['days'] ?? 30);
        if (!in_array($days, [7, 30, 90], true)) $days = 30;
        $start = $filters['start'] ?? date('Y-m-d', strtotime("-$days days"));
        $end = $filters['end'] ?? date('Y-m-d');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $start) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $end) || $start > $end) return ['success' => false, 'error' => 'Invalid analytics date range.'];
        $params = [':start' => $start . ' 00:00:00', ':end' => date('Y-m-d 00:00:00', strtotime($end . ' +1 day'))];
        $overview = $this->db->prepare("SELECT COUNT(*) scans, COALESCE(SUM(fake_count),0) fake_reviews, COALESCE(SUM(genuine_count),0) genuine_reviews, COALESCE(SUM(uncertain_count),0) uncertain_reviews FROM scan_history WHERE scan_date >= :start AND scan_date < :end");
        $overview->execute($params);
        $summary = $overview->fetch(PDO::FETCH_ASSOC);
        $summary['analyzed_reviews'] = intval($summary['fake_reviews']) + intval($summary['genuine_reviews']) + intval($summary['uncertain_reviews']);
        $summary['fake_rate'] = $summary['analyzed_reviews'] ? round(100 * $summary['fake_reviews'] / $summary['analyzed_reviews'], 2) : null;
        $summary['genuine_rate'] = $summary['analyzed_reviews'] ? round(100 * $summary['genuine_reviews'] / $summary['analyzed_reviews'], 2) : null;
        $users = $this->db->prepare("SELECT COUNT(*) FROM users WHERE created_at >= :start AND created_at < :end");
        $users->execute($params);
        $summary['new_users'] = intval($users->fetchColumn());
        $summary['total_users'] = intval($this->db->query('SELECT COUNT(*) FROM users')->fetchColumn());
        $trend = $this->db->prepare("SELECT DATE(scan_date) date, COUNT(*) scans, COALESCE(SUM(fake_count),0) fake_reviews, COALESCE(SUM(genuine_count),0) genuine_reviews, COALESCE(SUM(uncertain_count),0) uncertain_reviews FROM scan_history WHERE scan_date >= :start AND scan_date < :end GROUP BY DATE(scan_date) ORDER BY date");
        $trend->execute($params);
        $distribution = [['label' => 'Suspicious', 'value' => intval($summary['fake_reviews'])], ['label' => 'Genuine', 'value' => intval($summary['genuine_reviews'])], ['label' => 'Uncertain', 'value' => intval($summary['uncertain_reviews'])]];
        $products = $this->db->prepare("SELECT p.id, p.title, COUNT(sh.id) scan_count, COALESCE(SUM(sh.fake_count),0) fake_reviews, COALESCE(SUM(sh.fake_count)+SUM(sh.genuine_count)+SUM(sh.uncertain_count),0) analyzed_reviews FROM scan_history sh JOIN products p ON p.id=sh.product_id WHERE sh.scan_date >= :start AND sh.scan_date < :end GROUP BY p.id,p.title HAVING analyzed_reviews > 0 ORDER BY fake_reviews DESC, scan_count DESC LIMIT 8");
        $products->execute($params);
        return ['success' => true, 'range' => ['start' => $start, 'end' => $end], 'summary' => $summary, 'trend' => $trend->fetchAll(PDO::FETCH_ASSOC), 'distribution' => $distribution, 'products' => $products->fetchAll(PDO::FETCH_ASSOC), 'model_evaluation' => $this->getModelEvaluation()];
    }

    public function getUsers()
    {
        $users = $this->userModel->getAllUsers();
        return ["success" => true, "users" => $users];
    }

    public function toggleUserStatus(array $data): array
    {
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

    public function changeUserRole(array $data): array
    {
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

    public function deleteUser(?string $id): array
    {
        if (!$id) {
            return ["success" => false, "error" => "User ID is required."];
        }
        if ($this->userModel->deleteUser($id)) {
            return ["success" => true, "message" => "User deleted successfully."];
        }
        return ["success" => false, "error" => "Failed to delete user."];
    }

    public function getSystemLogs()
    {
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

    public function getCommunityReports()
    {
        try {
            $query = "SELECT id, name, email, subject, message, created_at, 'New' AS status 
                      FROM support_messages 
                      ORDER BY created_at DESC";
            $stmt = $this->db->query($query);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            return [
                "success" => true,
                "reports" => $rows
            ];
        } catch (\Exception $e) {
            return [
                "success" => false,
                "error" => $e->getMessage(),
                "reports" => []
            ];
        }
    }

    public function getReports()
    {
        $query = "SELECT r.id, r.generated_at, r.summary_strengths, r.summary_weaknesses,
                         r.summary_recommendation, r.overall_quality, r.genuine_summary,
                         sh.trust_score, sh.fake_count, sh.genuine_count, sh.uncertain_count, sh.risk_level, sh.scan_date,
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

    public function getProducts()
    {
        $query = "SELECT p.id, p.title, p.platform, p.url, p.image_url, p.rating, p.created_at,
                         COUNT(sh.id) as scan_count,
                         ROUND(AVG(sh.fake_count / NULLIF(sh.fake_count + sh.genuine_count + sh.uncertain_count, 0)) * 100, 1) as avg_fake_pct,
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

    public function triggerRetrain()
    {
        // Call the full retraining pipeline on the Python AI microservice
        $python_url = "http://127.0.0.1:5000/admin/ai/retrain";
        $ch = curl_init($python_url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([]));
        $serviceKey = echotrace_env('ECHOTRACE_SERVICE_KEY', '');
        if (strlen($serviceKey) < 32) {
            return ["success" => false, "error" => "AI service is not configured."];
        }
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json', 'X-EchoTrace-Service-Key: ' . $serviceKey]);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 120); // Training can take a while

        $response = curl_exec($ch);
        $err = curl_error($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($err) {
            return ["success" => false, "error" => "AI Service unreachable: $err"];
        }

        $decoded = json_decode($response, true);
        if ($http_code !== 200 || !($decoded['success'] ?? false)) {
            return ["success" => false, "error" => $decoded['error'] ?? "Retraining failed (HTTP $http_code)"];
        }

        return ["success" => true, "message" => $decoded['message'] ?? "Model retrained successfully!", "metrics" => $decoded['metrics'] ?? []];
    }
}
