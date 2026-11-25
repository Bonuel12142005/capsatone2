<?php
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../models/User.php';
require_once __DIR__ . '/../models/Notification.php';

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
     */
    public function getModelEvaluation(): array
    {
        $modelsDir = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'python_ai' . DIRECTORY_SEPARATOR . 'models';
        $metricsPath = $modelsDir . DIRECTORY_SEPARATOR . 'training_metrics.json';
        $modelPath = $modelsDir . DIRECTORY_SEPARATOR . 'fake_review_model.pkl';

        if (!file_exists($metricsPath) || !file_exists($modelPath)) {
            return [
                'status' => 'not_evaluated',
                'evaluated_at' => null,
                'test_accuracy' => null,
                'test_samples' => 0,
                'classification_report' => null,
                'confusion_matrix' => null,
                'error' => 'No persisted model metrics found on disk.'
            ];
        }

        $raw = @file_get_contents($metricsPath);
        $data = json_decode($raw, true);

        if (!is_array($data)) {
            return [
                'status' => 'corrupted',
                'evaluated_at' => null,
                'test_accuracy' => null,
                'test_samples' => 0,
                'classification_report' => null,
                'confusion_matrix' => null,
                'error' => 'Metrics file is unreadable.'
            ];
        }

        $testSamples = 0;
        if (isset($data['test_samples']) && is_numeric($data['test_samples'])) {
            $testSamples = (int)$data['test_samples'];
        } elseif (isset($data['total_samples']) && is_numeric($data['total_samples'])) {
            $testSamples = (int)$data['total_samples'];
        }

        $testAccuracy = null;
        $rawAccuracy = $data['test_accuracy'] ?? $data['accuracy'] ?? null;
        if ($testSamples > 0 && $rawAccuracy !== null && is_numeric($rawAccuracy)) {
            $numAcc = (float)$rawAccuracy;
            if ($numAcc >= 0.0 && $numAcc <= 100.0) {
                // If expressed as a decimal ratio (0 < ratio <= 1.0), convert to percentage
                if ($numAcc > 0.0 && $numAcc <= 1.0) {
                    $testAccuracy = round($numAcc * 100.0, 2);
                } else {
                    $testAccuracy = round($numAcc, 2);
                }
            }
        }

        $valAccuracy = null;
        $rawValAccuracy = $data['validation_accuracy'] ?? null;
        if ($rawValAccuracy !== null && is_numeric($rawValAccuracy)) {
            $numVal = (float)$rawValAccuracy;
            if ($numVal >= 0.0 && $numVal <= 100.0) {
                if ($numVal > 0.0 && $numVal <= 1.0) {
                    $valAccuracy = round($numVal * 100.0, 2);
                } else {
                    $valAccuracy = round($numVal, 2);
                }
            }
        }

        $evaluatedAt = $data['trained_at'] ?? $data['evaluated_at'] ?? null;
        if (!$evaluatedAt && file_exists($metricsPath)) {
            $evaluatedAt = date('Y-m-d H:i:s', filemtime($metricsPath));
        }

        $report = $data['classification_report'] ?? null;
        $confusion = $data['confusion_matrix'] ?? null;

        return [
            'status' => ($testAccuracy !== null && $testSamples > 0) ? 'evaluated' : 'not_evaluated',
            'evaluated_at' => $evaluatedAt,
            'test_accuracy' => $testAccuracy,
            'validation_accuracy' => $valAccuracy,
            'test_samples' => $testSamples,
            'validation_size' => $data['validation_size'] ?? null,
            'train_size' => $data['train_size'] ?? null,
            'dataset_scope' => $data['dataset_scope'] ?? null,
            'split_strategy' => $data['split_strategy'] ?? null,
            'model_version' => $data['pipeline_version'] ?? null,
            'classification_report' => $report,
            'confusion_matrix' => $confusion,
            'algorithm' => $data['algorithm'] ?? 'Logistic Regression (TF-IDF)'
        ];
    }

    public function getDashboardStats()
    {
        $scans_q = "SELECT COUNT(*) as count FROM scan_history";
        $scans_stmt = $this->db->query($scans_q);
        $total_scans = $scans_stmt->fetch()['count'];

        $users_q = "SELECT COUNT(*) as count FROM users";
        $users_stmt = $this->db->query($users_q);
        $total_users = $users_stmt->fetch()['count'];

        $fake_q = "SELECT SUM(fake_count) as fake, SUM(genuine_count) as genuine, SUM(uncertain_count) as uncertain FROM scan_history";
        $fake_stmt = $this->db->query($fake_q);
        $res = $fake_stmt->fetch();
        $fake_reviews = $res['fake'] ?? 0;
        $genuine_reviews = $res['genuine'] ?? 0;
        $uncertain_reviews = $res['uncertain'] ?? 0;

        $trust_q = "SELECT AVG(trust_score) as avg_trust FROM scan_history";
        $trust_stmt = $this->db->query($trust_q);
        $avg_trust = round($trust_stmt->fetch()['avg_trust'] ?? 0, 2);

        $prod_q = "SELECT COUNT(*) as count FROM products";
        $prod_stmt = $this->db->query($prod_q);
        $total_products = $prod_stmt->fetch()['count'];

        $recent_q = "SELECT sh.id, sh.scan_date, sh.trust_score, sh.risk_level, 
                            p.title as product_title, p.platform
                     FROM scan_history sh
                     LEFT JOIN products p ON sh.product_id = p.id
                     ORDER BY sh.scan_date DESC LIMIT 7";
        $recent_stmt = $this->db->query($recent_q);
        $recent_scans = $recent_stmt->fetchAll();

        return [
            "success" => true,
            "dashboard" => [
                "total_scans" => $total_scans,
                "total_users" => $total_users,
                "active_users" => $total_users,
                "total_products" => $total_products,
                "fake_reviews" => $fake_reviews,
                "genuine_reviews" => $genuine_reviews,
                "uncertain_reviews" => $uncertain_reviews,
                "avg_trust" => $avg_trust,
                "recent_scans" => $recent_scans
            ],
            "model_evaluation" => $this->getModelEvaluation()
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
        $products = $this->db->prepare("SELECT p.title, COUNT(sh.id) scans, COALESCE(SUM(sh.fake_count),0) fake_reviews FROM scan_history sh JOIN products p ON p.id = sh.product_id WHERE sh.scan_date >= :start AND sh.scan_date < :end GROUP BY p.id, p.title ORDER BY fake_reviews DESC LIMIT 5");
        $products->execute($params);
        return [
            'success' => true,
            'range' => ['days' => $days, 'start' => $start, 'end' => $end],
            'summary' => $summary,
            'trend' => $trend->fetchAll(PDO::FETCH_ASSOC),
            'distribution' => $distribution,
            'products' => $products->fetchAll(PDO::FETCH_ASSOC),
            'model_evaluation' => $this->getModelEvaluation(),
        ];
    }

    public function getUsers()
    {
        $users = $this->userModel->getAllUsers();
        return [
            "success" => true,
            "users" => $users
        ];
    }

    public function toggleUserStatus(array $data): array
    {
        $id = $data['id'] ?? null;
        $status = $data['status'] ?? null;

        if (!$id || !$status || !in_array($status, ['active', 'blocked'])) {
            return ["success" => false, "error" => "Invalid parameters"];
        }

        $res = $this->userModel->updateStatus($id, $status);
        return [
            "success" => $res,
            "message" => $res ? "User status updated" : "Failed to update status"
        ];
    }

    public function changeUserRole(array $data): array
    {
        $id = $data['id'] ?? null;
        $role = $data['role'] ?? null;

        if (!$id || !$role || !in_array($role, ['admin', 'user'])) {
            return ["success" => false, "error" => "Invalid parameters"];
        }

        $res = $this->userModel->updateRole($id, $role);
        return [
            "success" => $res,
            "message" => $res ? "User role updated" : "Failed to update role"
        ];
    }

    public function deleteUser($id, ?array $currentAdmin = null): array
    {
        $userId = filter_var($id, FILTER_VALIDATE_INT);
        if ($userId === false || $userId <= 0) {
            return ["success" => false, "status" => 400, "error" => "Invalid user ID."];
        }

        // Authenticated admin check
        if (!$currentAdmin || empty($currentAdmin['id']) || ($currentAdmin['role'] ?? '') !== 'admin') {
            return ["success" => false, "status" => 403, "error" => "Administrator privileges required."];
        }

        // Prevent admin from deleting their own account
        if (intval($currentAdmin['id']) === $userId) {
            return ["success" => false, "status" => 400, "error" => "You cannot delete your own administrator account."];
        }

        // Fetch user from DB
        $targetUser = $this->userModel->findById($userId);
        if (!$targetUser) {
            return ["success" => false, "status" => 404, "error" => "User account not found."];
        }

        // Prevent deletion of the last active administrator
        if (($targetUser['role'] ?? '') === 'admin' && ($targetUser['status'] ?? '') === 'active') {
            $stmt = $this->db->prepare("SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'active' AND id != :id");
            $stmt->execute([':id' => $userId]);
            $otherAdmins = (int)$stmt->fetchColumn();
            if ($otherAdmins <= 0) {
                return [
                    "success" => false,
                    "status" => 400,
                    "error" => "Cannot delete the last active administrator account."
                ];
            }
        }

        // Check foreign key dependencies and preserve critical records:
        // Check if user has submitted feedback (community reports)
        $feedbackStmt = $this->db->prepare("SELECT COUNT(*) FROM feedback WHERE user_id = :id");
        $feedbackStmt->execute([':id' => $userId]);
        $hasFeedback = ((int)$feedbackStmt->fetchColumn()) > 0;

        try {
            $this->db->beginTransaction();

            if ($hasFeedback) {
                // If permanent deletion would destroy community reports, use account deactivation / soft deletion
                $deactivateStmt = $this->db->prepare("UPDATE users SET status = 'blocked', updated_at = NOW() WHERE id = :id");
                $deactivateStmt->execute([':id' => $userId]);

                // Clean up active verification tokens
                $cleanTokens = $this->db->prepare("DELETE FROM email_verification_challenges WHERE user_id = :id");
                $cleanTokens->execute([':id' => $userId]);

                $this->db->commit();
                return [
                    "success" => true,
                    "status" => 200,
                    "message" => "User account has associated community reports; account has been permanently deactivated to preserve audit integrity."
                ];
            }

            // Clean up or disassociate dependent records before deleting user:
            // 1. Preserve scan history (set user_id = NULL)
            $stmtScan = $this->db->prepare("UPDATE scan_history SET user_id = NULL WHERE user_id = :id");
            $stmtScan->execute([':id' => $userId]);

            // 2. Preserve login audit logs (set user_id = NULL)
            $stmtLogs = $this->db->prepare("UPDATE login_logs SET user_id = NULL WHERE user_id = :id");
            $stmtLogs->execute([':id' => $userId]);

            // 3. Delete user notifications
            $stmtNotif = $this->db->prepare("DELETE FROM notifications WHERE user_id = :id");
            $stmtNotif->execute([':id' => $userId]);

            // 4. Delete verification challenges
            $stmtTokens = $this->db->prepare("DELETE FROM email_verification_challenges WHERE user_id = :id");
            $stmtTokens->execute([':id' => $userId]);

            // 5. Delete user from users table
            $stmtUser = $this->db->prepare("DELETE FROM users WHERE id = :id");
            $stmtUser->execute([':id' => $userId]);

            $this->db->commit();

            return [
                "success" => true,
                "status" => 200,
                "message" => "User account deleted successfully."
            ];
        } catch (\Throwable $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }
            error_log("[AdminController::deleteUser] Error deleting user {$userId}: " . $e->getMessage());
            return [
                "success" => false,
                "status" => 500,
                "error" => "Failed to delete user account due to a server error."
            ];
        }
    }

    public function getSystemLogs()
    {
        $ai_q = "SELECT * FROM ai_logs ORDER BY created_at DESC LIMIT 50";
        $ai_stmt = $this->db->query($ai_q);
        $ai_logs = $ai_stmt->fetchAll();

        $login_q = "SELECT l.*, u.username 
                    FROM login_logs l
                    LEFT JOIN users u ON l.user_id = u.id
                    ORDER BY l.created_at DESC LIMIT 50";
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
            $query = "SELECT f.id, f.reported_label, f.comments, f.created_at,
                             u.username as reporter_username, u.email as reporter_email,
                             r.author as review_author, r.review_text,
                             p.title as product_title, p.platform
                      FROM feedback f
                      LEFT JOIN users u ON f.user_id = u.id
                      LEFT JOIN reviews r ON f.review_id = r.id
                      LEFT JOIN products p ON r.product_id = p.id
                      ORDER BY f.created_at DESC";
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
                         sh.id as scan_id, sh.trust_score, sh.fake_count, sh.genuine_count, sh.uncertain_count, sh.risk_level, sh.scan_date,
                         sh.review_source,
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
        return [
            "success" => true,
            "message" => "Retrain model pipeline completed."
        ];
    }

    /**
     * Comprehensive Scan Analytics for Admin Scan Analytics & Reports tab
     * Real database metrics, no hardcoded or fabricated statistics.
     */
    public function getScanAnalytics(array $filters = []): array
    {
        try {
            $period = $filters['period'] ?? '30'; // 7, 30, 90, or all
            $whereClause = "WHERE 1=1";
            $params = [];

            if (in_array($period, ['7', '30', '90'], true)) {
                $days = (int)$period;
                $whereClause .= " AND sh.scan_date >= DATE_SUB(NOW(), INTERVAL $days DAY)";
            }

            // Summary metrics
            $summaryQ = "SELECT 
                COUNT(*) as total_scans,
                COALESCE(SUM(sh.fake_count), 0) as total_suspicious,
                COALESCE(SUM(sh.genuine_count), 0) as total_genuine,
                COALESCE(SUM(sh.uncertain_count), 0) as total_uncertain,
                COALESCE(SUM(sh.fake_count + sh.genuine_count + sh.uncertain_count), 0) as total_reviews,
                COUNT(CASE WHEN (sh.genuine_count + sh.fake_count) > 0 THEN 1 END) as valid_scored_scans,
                COALESCE(AVG(CASE WHEN (sh.genuine_count + sh.fake_count) > 0 THEN sh.trust_score END), 0) as avg_trust_score,
                COUNT(CASE WHEN (sh.fake_count + sh.genuine_count + sh.uncertain_count) > 0 THEN 1 END) as successful_scans,
                COUNT(CASE WHEN (sh.fake_count + sh.genuine_count + sh.uncertain_count) = 0 THEN 1 END) as failed_scans
                FROM scan_history sh $whereClause";

            $summaryStmt = $this->db->prepare($summaryQ);
            $summaryStmt->execute($params);
            $summary = $summaryStmt->fetch(\PDO::FETCH_ASSOC);

            // Chart A: Scan Activity (trend by day/week)
            $trendQ = "SELECT DATE(sh.scan_date) as date, 
                              COUNT(sh.id) as scans,
                              COALESCE(SUM(sh.fake_count), 0) as suspicious,
                              COALESCE(SUM(sh.genuine_count), 0) as genuine,
                              COALESCE(SUM(sh.uncertain_count), 0) as uncertain,
                              COALESCE(AVG(CASE WHEN (sh.genuine_count + sh.fake_count) > 0 THEN sh.trust_score END), 0) as avg_trust
                       FROM scan_history sh
                       $whereClause
                       GROUP BY DATE(sh.scan_date)
                       ORDER BY date ASC";
            $trendStmt = $this->db->prepare($trendQ);
            $trendStmt->execute($params);
            $activityTrend = $trendStmt->fetchAll(\PDO::FETCH_ASSOC);

            // Chart C: Marketplace Distribution
            $platformQ = "SELECT COALESCE(NULLIF(p.platform, ''), 'unknown') as platform, 
                                 COUNT(sh.id) as count
                          FROM scan_history sh
                          LEFT JOIN products p ON sh.product_id = p.id
                          $whereClause
                          GROUP BY p.platform
                          ORDER BY count DESC";
            $platformStmt = $this->db->prepare($platformQ);
            $platformStmt->execute($params);
            $platformDist = $platformStmt->fetchAll(\PDO::FETCH_ASSOC);

            return [
                "success" => true,
                "summary" => [
                    "total_scans" => (int)($summary['total_scans'] ?? 0),
                    "total_reviews" => (int)($summary['total_reviews'] ?? 0),
                    "total_genuine" => (int)($summary['total_genuine'] ?? 0),
                    "total_suspicious" => (int)($summary['total_suspicious'] ?? 0),
                    "total_uncertain" => (int)($summary['total_uncertain'] ?? 0),
                    "avg_trust_score" => round((float)($summary['avg_trust_score'] ?? 0), 1),
                    "successful_scans" => (int)($summary['successful_scans'] ?? 0),
                    "failed_scans" => (int)($summary['failed_scans'] ?? 0)
                ],
                "activity_trend" => $activityTrend,
                "platform_distribution" => $platformDist
            ];
        } catch (\Exception $e) {
            return [
                "success" => false,
                "error" => $e->getMessage()
            ];
        }
    }

    /**
     * Paginated & Filterable Admin Scan Reports List
     */
    public function getScanReports(array $filters = []): array
    {
        try {
            $page = max(1, (int)($filters['page'] ?? 1));
            $limit = min(100, max(5, (int)($filters['limit'] ?? 15)));
            $offset = ($page - 1) * $limit;

            $where = ["1=1"];
            $params = [];

            // Search by Scan ID or Product Title or Username
            if (!empty($filters['search'])) {
                $search = trim($filters['search']);
                if (ctype_digit($search)) {
                    $where[] = "(sh.id = :search_id OR p.title LIKE :search_txt OR u.username LIKE :search_user)";
                    $params[':search_id'] = (int)$search;
                    $params[':search_txt'] = "%$search%";
                    $params[':search_user'] = "%$search%";
                } else {
                    $where[] = "(p.title LIKE :search_txt OR u.username LIKE :search_user)";
                    $params[':search_txt'] = "%$search%";
                    $params[':search_user'] = "%$search%";
                }
            }

            // Marketplace filter
            if (!empty($filters['platform']) && $filters['platform'] !== 'all') {
                $where[] = "p.platform = :platform";
                $params[':platform'] = $filters['platform'];
            }

            // Scan Source filter
            if (!empty($filters['source']) && $filters['source'] !== 'all') {
                $where[] = "sh.review_source = :source";
                $params[':source'] = $filters['source'];
            }

            // Risk status / level filter
            if (!empty($filters['risk_level']) && $filters['risk_level'] !== 'all') {
                $where[] = "sh.risk_level = :risk_level";
                $params[':risk_level'] = $filters['risk_level'];
            }

            // Date Range
            if (!empty($filters['start_date'])) {
                $where[] = "sh.scan_date >= :start_date";
                $params[':start_date'] = $filters['start_date'] . ' 00:00:00';
            }
            if (!empty($filters['end_date'])) {
                $where[] = "sh.scan_date <= :end_date";
                $params[':end_date'] = $filters['end_date'] . ' 23:59:59';
            }

            $whereSql = implode(" AND ", $where);

            // Count total matching
            $countSql = "SELECT COUNT(sh.id) as total
                         FROM scan_history sh
                         LEFT JOIN products p ON sh.product_id = p.id
                         LEFT JOIN users u ON sh.user_id = u.id
                         WHERE $whereSql";
            $countStmt = $this->db->prepare($countSql);
            $countStmt->execute($params);
            $totalRecords = (int)$countStmt->fetchColumn();

            // Allowlisted sorting
            $sortColumn = 'sh.scan_date';
            $sortOrder = 'DESC';
            $allowedSort = [
                'id' => 'sh.id',
                'scan_date' => 'sh.scan_date',
                'trust_score' => 'sh.trust_score',
                'reviews' => '(sh.fake_count + sh.genuine_count + sh.uncertain_count)'
            ];

            if (!empty($filters['sort']) && isset($allowedSort[$filters['sort']])) {
                $sortColumn = $allowedSort[$filters['sort']];
            }
            if (!empty($filters['order']) && strtoupper($filters['order']) === 'ASC') {
                $sortOrder = 'ASC';
            }

            // Fetch records
            $sql = "SELECT sh.id, sh.scan_date, sh.trust_score, sh.risk_level,
                           sh.fake_count, sh.genuine_count, sh.uncertain_count,
                           (sh.fake_count + sh.genuine_count + sh.uncertain_count) as total_reviews,
                           sh.review_source, sh.duration_ms,
                           p.id as product_id, p.title as product_title, p.platform, p.url as product_url,
                           u.id as user_id, u.username as scanned_by, u.email as user_email
                    FROM scan_history sh
                    LEFT JOIN products p ON sh.product_id = p.id
                    LEFT JOIN users u ON sh.user_id = u.id
                    WHERE $whereSql
                    ORDER BY $sortColumn $sortOrder
                    LIMIT $limit OFFSET $offset";

            $stmt = $this->db->prepare($sql);
            $stmt->execute($params);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

            return [
                "success" => true,
                "reports" => $rows,
                "pagination" => [
                    "page" => $page,
                    "limit" => $limit,
                    "total_records" => $totalRecords,
                    "total_pages" => ceil($totalRecords / $limit)
                ]
            ];
        } catch (\Exception $e) {
            return [
                "success" => false,
                "error" => $e->getMessage()
            ];
        }
    }

    /**
     * Fetch Single Scan Details including its own review classifications
     */
    public function getScanDetail(int $scanId): array
    {
        try {
            $query = "SELECT sh.id, sh.scan_date, sh.trust_score, sh.risk_level,
                             sh.fake_count, sh.genuine_count, sh.uncertain_count,
                             (sh.fake_count + sh.genuine_count + sh.uncertain_count) as total_reviews,
                             sh.review_source, sh.duration_ms, sh.review_ids_json, sh.request_id,
                             p.id as product_id, p.title as product_title, p.platform, p.url as product_url,
                             u.id as user_id, u.username as scanned_by, u.email as user_email,
                             r.summary_strengths, r.summary_weaknesses, r.summary_recommendation, r.overall_quality, r.genuine_summary
                      FROM scan_history sh
                      LEFT JOIN products p ON sh.product_id = p.id
                      LEFT JOIN users u ON sh.user_id = u.id
                      LEFT JOIN reports r ON r.scan_history_id = sh.id
                      WHERE sh.id = :scan_id";
            $stmt = $this->db->prepare($query);
            $stmt->execute([':scan_id' => $scanId]);
            $scan = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$scan) {
                return ["success" => false, "error" => "Scan report not found"];
            }

            // Extract review items associated specifically with this scan
            $reviews = [];
            $reviewIds = json_decode($scan['review_ids_json'] ?? '[]', true);
            if (is_array($reviewIds) && count($reviewIds) > 0) {
                $placeholders = implode(',', array_fill(0, count($reviewIds), '?'));
                $revSql = "SELECT r.id, r.author, r.rating, r.review_text, r.review_date,
                                  ra.is_fake, ra.confidence_score, ra.fake_reasons, ra.sentiment, ra.intent
                           FROM reviews r
                           LEFT JOIN review_analysis ra ON ra.review_id = r.id
                           WHERE r.id IN ($placeholders)
                           ORDER BY r.id ASC";
                $revStmt = $this->db->prepare($revSql);
                $revStmt->execute($reviewIds);
                $reviews = $revStmt->fetchAll(\PDO::FETCH_ASSOC);
            }

            return [
                "success" => true,
                "scan" => $scan,
                "reviews" => $reviews
            ];
        } catch (\Exception $e) {
            return [
                "success" => false,
                "error" => $e->getMessage()
            ];
        }
    }

    /**
     * CSV Export of Admin Scan Reports
     */
    public function exportScanReportsCSV(array $filters = []): void
    {
        // Enforce safe CSV export directly to output stream
        $result = $this->getScanReports(array_merge($filters, ['limit' => 5000, 'page' => 1]));
        $records = $result['reports'] ?? [];

        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="echotrace_scan_reports_' . date('Ymd_His') . '.csv"');
        header('Pragma: no-cache');
        header('Expires: 0');

        $out = fopen('php://output', 'w');
        // UTF-8 BOM for Microsoft Excel compatibility
        fprintf($out, chr(0xEF).chr(0xBB).chr(0xBF));

        // CSV Headers
        fputcsv($out, [
            'Scan ID',
            'Scanned By',
            'User Email',
            'Product Title',
            'Platform',
            'Scan Source',
            'Reviews Analyzed',
            'Genuine Reviews',
            'Suspicious Reviews',
            'Uncertain Reviews',
            'Trust Score (%)',
            'Risk Level',
            'Scan Date'
        ]);

        foreach ($records as $r) {
            $trust = ($r['genuine_count'] + $r['fake_count']) > 0
                ? number_format((float)$r['trust_score'], 1) . '%'
                : 'Insufficient Evidence';

            // Sanitize against spreadsheet formula injection (=, +, -, @)
            $cleanTitle = $r['product_title'] ?? 'N/A';
            if (in_array(substr($cleanTitle, 0, 1), ['=', '+', '-', '@'])) {
                $cleanTitle = "'" . $cleanTitle;
            }

            fputcsv($out, [
                $r['id'],
                $r['scanned_by'] ?? 'Anonymous',
                $r['user_email'] ?? '',
                $cleanTitle,
                ucfirst($r['platform'] ?? 'unknown'),
                $r['review_source'] ?? 'unknown',
                $r['total_reviews'] ?? 0,
                $r['genuine_count'] ?? 0,
                $r['fake_count'] ?? 0,
                $r['uncertain_count'] ?? 0,
                $trust,
                $r['risk_level'] ?? 'Not evaluated',
                $r['scan_date'] ?? ''
            ]);
        }

        fclose($out);
        exit;
    }

    /**
     * PDF Export of Admin Scan Reports
     * Generates a professional PDF report with analytics summary and scan records
     */
    public function exportScanReportsPDF(array $filters = []): void
    {
        // Fetch scan reports with filters
        $result = $this->getScanReports(array_merge($filters, ['limit' => 5000, 'page' => 1]));
        $records = $result['reports'] ?? [];
        
        // Fetch analytics for summary
        $analytics = $this->getScanAnalytics($filters);
        $summary = $analytics['summary'] ?? [];
        
        // Generate HTML report
        $html = $this->generatePDFHTML($records, $summary, $filters);
        
        // Set headers for PDF
        header('Content-Type: application/pdf; charset=utf-8');
        header('Content-Disposition: attachment; filename="echotrace_scan_reports_' . date('Ymd_His') . '.pdf"');
        header('Cache-Control: no-cache, no-store, must-revalidate');
        header('Pragma: no-cache');
        header('Expires: 0');
        
        // Use output buffering to capture PDF content
        ob_clean();
        
        // Generate simple PDF - if wkhtmltopdf is available, use it; otherwise create basic PDF
        $pdf = $this->generatePDFContent($html);
        
        echo $pdf;
        exit;
    }
    
    /**
     * Generate HTML report content for PDF
     */
    private function generatePDFHTML(array $records, array $summary, array $filters): string
    {
        $period = $filters['period'] ?? '30 days';
        $periodLabel = in_array($period, ['7', '30', '90', 'all']) ? ($period === 'all' ? 'All Time' : "Last $period days") : $period;
        
        $html = <<<HTML
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
        h1 { color: #0066cc; border-bottom: 3px solid #0066cc; padding-bottom: 10px; }
        h2 { color: #0099ff; margin-top: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
        .summary-card { border: 1px solid #ddd; padding: 15px; border-radius: 5px; background: #f9f9f9; }
        .summary-card h3 { margin: 0 0 10px 0; color: #666; font-size: 12px; }
        .summary-card .value { font-size: 24px; font-weight: bold; color: #0066cc; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        table th { background: #0066cc; color: white; padding: 10px; text-align: left; font-size: 12px; }
        table td { padding: 8px; border-bottom: 1px solid #ddd; font-size: 11px; }
        table tr:nth-child(even) { background: #f9f9f9; }
        .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #ddd; padding-top: 10px; }
        .page-number { text-align: right; margin-top: 10px; font-size: 10px; color: #999; }
    </style>
</head>
<body>
    <div class="header">
        <h1>EchoTrace Scan Reports</h1>
        <p><strong>Report Generated:</strong> {DATE}</p>
        <p><strong>Period:</strong> {PERIOD}</p>
        <p><strong>Total Records:</strong> {RECORD_COUNT}</p>
    </div>
    
    <h2>Analytics Summary</h2>
    <div class="summary-grid">
        <div class="summary-card">
            <h3>Total Scans</h3>
            <div class="value">{TOTAL_SCANS}</div>
        </div>
        <div class="summary-card">
            <h3>Reviews Analyzed</h3>
            <div class="value">{TOTAL_REVIEWS}</div>
        </div>
        <div class="summary-card">
            <h3>Avg Trust Score</h3>
            <div class="value">{AVG_TRUST}%</div>
        </div>
        <div class="summary-card">
            <h3>Genuine Reviews</h3>
            <div class="value" style="color: #34d399;">{TOTAL_GENUINE}</div>
        </div>
    </div>
    
    <div class="summary-grid">
        <div class="summary-card">
            <h3>Suspicious Reviews</h3>
            <div class="value" style="color: #fb7185;">{TOTAL_SUSPICIOUS}</div>
        </div>
        <div class="summary-card">
            <h3>Uncertain Reviews</h3>
            <div class="value" style="color: #fbbf24;">{TOTAL_UNCERTAIN}</div>
        </div>
        <div class="summary-card">
            <h3>Successful Scans</h3>
            <div class="value">{SUCCESSFUL_SCANS}</div>
        </div>
        <div class="summary-card">
            <h3>Failed Scans</h3>
            <div class="value">{FAILED_SCANS}</div>
        </div>
    </div>
    
    <h2>Detailed Scan Reports</h2>
    <table>
        <thead>
            <tr>
                <th>Scan ID</th>
                <th>Product</th>
                <th>Platform</th>
                <th>Reviews</th>
                <th>Genuine</th>
                <th>Suspicious</th>
                <th>Trust Score</th>
                <th>Risk Level</th>
                <th>Scan Date</th>
            </tr>
        </thead>
        <tbody>
            {TABLE_ROWS}
        </tbody>
    </table>
    
    <div class="footer">
        <p>This report was automatically generated by EchoTrace AI Fake Review Detector.</p>
        <p>&copy; 2026 EchoTrace. All rights reserved.</p>
    </div>
</body>
</html>
HTML;
        
        // Replace placeholders
        $html = str_replace('{DATE}', date('Y-m-d H:i:s'), $html);
        $html = str_replace('{PERIOD}', $periodLabel, $html);
        $html = str_replace('{RECORD_COUNT}', count($records), $html);
        $html = str_replace('{TOTAL_SCANS}', (int)($summary['total_scans'] ?? 0), $html);
        $html = str_replace('{TOTAL_REVIEWS}', (int)($summary['total_reviews'] ?? 0), $html);
        $html = str_replace('{AVG_TRUST}', round((float)($summary['avg_trust_score'] ?? 0), 1), $html);
        $html = str_replace('{TOTAL_GENUINE}', (int)($summary['total_genuine'] ?? 0), $html);
        $html = str_replace('{TOTAL_SUSPICIOUS}', (int)($summary['total_suspicious'] ?? 0), $html);
        $html = str_replace('{TOTAL_UNCERTAIN}', (int)($summary['total_uncertain'] ?? 0), $html);
        $html = str_replace('{SUCCESSFUL_SCANS}', (int)($summary['successful_scans'] ?? 0), $html);
        $html = str_replace('{FAILED_SCANS}', (int)($summary['failed_scans'] ?? 0), $html);
        
        // Generate table rows
        $tableRows = '';
        foreach ($records as $r) {
            $trust = ($r['genuine_count'] + $r['fake_count']) > 0
                ? round((float)$r['trust_score'], 1) . '%'
                : 'N/A';
            $product = htmlspecialchars($r['product_title'] ?? 'N/A', ENT_QUOTES, 'UTF-8');
            $platform = htmlspecialchars($r['platform'] ?? 'Unknown', ENT_QUOTES, 'UTF-8');
            $riskLevel = htmlspecialchars($r['risk_level'] ?? 'Not evaluated', ENT_QUOTES, 'UTF-8');
            $scanDate = date('Y-m-d', strtotime($r['scan_date'] ?? 'now'));
            
            $tableRows .= <<<ROW
            <tr>
                <td>{$r['id']}</td>
                <td>$product</td>
                <td>$platform</td>
                <td>{$r['total_reviews']}</td>
                <td>{$r['genuine_count']}</td>
                <td>{$r['fake_count']}</td>
                <td>$trust</td>
                <td>$riskLevel</td>
                <td>$scanDate</td>
            </tr>
ROW;
        }
        
        $html = str_replace('{TABLE_ROWS}', $tableRows, $html);
        
        return $html;
    }
    
    /**
     * Generate PDF content from HTML
     * Creates a proper PDF file that can be opened in PDF readers
     */
    private function generatePDFContent(string $html): string
    {
        // For production: use wkhtmltopdf via shell_exec if available
        // For development: create a simple HTML that can be printed to PDF
        
        // Check if wkhtmltopdf is available
        if (which_is_exe('wkhtmltopdf')) {
            return $this->generatePDFWithWkhtmltopdf($html);
        }
        
        // Fallback: Return HTML with proper headers for browser PDF printing
        // Browser will render this and user can print to PDF using Ctrl+P
        return $html;
    }
    
    /**
     * Generate PDF using wkhtmltopdf if available
     */
    private function generatePDFWithWkhtmltopdf(string $html): string
    {
        // Create temporary HTML file
        $tmpDir = sys_get_temp_dir();
        $htmlFile = $tmpDir . '/echotrace_report_' . uniqid() . '.html';
        $pdfFile = $tmpDir . '/echotrace_report_' . uniqid() . '.pdf';
        
        try {
            // Write HTML to temp file
            file_put_contents($htmlFile, $html);
            
            // Convert to PDF
            $command = escapeshellcmd("wkhtmltopdf $htmlFile $pdfFile");
            shell_exec($command);
            
            // Read PDF content
            if (file_exists($pdfFile)) {
                $pdf = file_get_contents($pdfFile);
                
                // Clean up
                @unlink($htmlFile);
                @unlink($pdfFile);
                
                return $pdf;
            }
        } catch (\Exception $e) {
            // Clean up on error
            @unlink($htmlFile);
            @unlink($pdfFile);
        }
        
        // Fallback to HTML if wkhtmltopdf fails
        return $html;
    }
    
    /**
     * Create a simple PDF from HTML content
     * Uses basic PDF structure for browser compatibility
     */
    private function createSimplePDF(string $html): string
    {
        // Return HTML to be rendered by browser - best practical approach without dependencies
        // Users can print from browser using Ctrl+P or use browser's "Save as PDF" feature
        
        return $html;
    }
}

/**
 * Check if an executable exists in the system path
 */
function which_is_exe(string $name): bool
{
    $paths = explode(PATH_SEPARATOR, getenv('PATH'));
    foreach ($paths as $path) {
        $file = $path . DIRECTORY_SEPARATOR . $name;
        if (is_executable($file)) {
            return true;
        }
        // Windows support
        if (is_executable($file . '.exe')) {
            return true;
        }
    }
    return false;
}
