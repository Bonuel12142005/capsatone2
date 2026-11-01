<?php
// backend/models/ScanHistory.php

class ScanHistory {
    private $conn;

    public function __construct($db) {
        $this->conn = $db;
    }

    public function createScan($user_id, $product_id, $trust_score, $fake_count, $genuine_count, $uncertain_count = 0, $risk_level = 'Low Risk', $request_id = null, $duration_ms = null, $review_source = null, $scan_metadata = null) {
        $query = "INSERT INTO scan_history (user_id, product_id, trust_score, fake_count, genuine_count, uncertain_count, risk_level, request_id, duration_ms, review_source, scan_metadata) 
                  VALUES (:user_id, :product_id, :trust_score, :fake_count, :genuine_count, :uncertain_count, :risk_level, :request_id, :duration_ms, :review_source, :scan_metadata)";
        $stmt = $this->conn->prepare($query);
        
        $u_id = $user_id ? $user_id : null;
        $stmt->bindParam(':user_id', $u_id);
        $stmt->bindParam(':product_id', $product_id);
        $stmt->bindParam(':trust_score', $trust_score);
        $stmt->bindParam(':fake_count', $fake_count);
        $stmt->bindParam(':genuine_count', $genuine_count);
        $stmt->bindParam(':uncertain_count', $uncertain_count);
        $stmt->bindParam(':risk_level', $risk_level);
        $stmt->bindParam(':request_id', $request_id);
        $stmt->bindParam(':duration_ms', $duration_ms);
        $stmt->bindParam(':review_source', $review_source);
        $metadataJson = is_array($scan_metadata) ? json_encode($scan_metadata, JSON_UNESCAPED_UNICODE) : $scan_metadata;
        $stmt->bindParam(':scan_metadata', $metadataJson);

        if ($stmt->execute()) {
            return $this->conn->lastInsertId();
        }
        return false;
    }

    public function findByRequestId($user_id, $request_id) {
        $query = "SELECT id, trust_score, fake_count, genuine_count, uncertain_count, risk_level, duration_ms, review_source, scan_date
                  FROM scan_history
                  WHERE user_id = :user_id AND request_id = :request_id
                  LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->bindValue(':user_id', intval($user_id), PDO::PARAM_INT);
        $stmt->bindValue(':request_id', $request_id);
        $stmt->execute();
        return $stmt->fetch();
    }

    public function saveReport($product_id, $scan_history_id, $strengths, $weaknesses, $recommendation, $overall_quality = null, $genuine_summary = null, $review_ids = []) {
        $query = "INSERT INTO reports (product_id, scan_history_id, summary_strengths, summary_weaknesses, summary_recommendation, overall_quality, genuine_summary) 
                  VALUES (:product_id, :scan_history_id, :strengths, :weaknesses, :recommendation, :overall_quality, :genuine_summary)";
        $stmt = $this->conn->prepare($query);
        
        $strengths_json  = json_encode($strengths);
        $weaknesses_json = json_encode($weaknesses);

        $stmt->bindParam(':product_id', $product_id);
        $stmt->bindParam(':scan_history_id', $scan_history_id);
        $stmt->bindParam(':strengths', $strengths_json);
        $stmt->bindParam(':weaknesses', $weaknesses_json);
        $stmt->bindParam(':recommendation', $recommendation);
        $stmt->bindParam(':overall_quality', $overall_quality);
        $stmt->bindParam(':genuine_summary', $genuine_summary);

        if ($stmt->execute()) {
            // Store review IDs as a separate record in scan_history for fast retrieval
            if (!empty($review_ids)) {
                $ids_json = json_encode($review_ids);
                $upd = "UPDATE scan_history SET review_ids_json = :ids WHERE id = :sid";
                try {
                    $s = $this->conn->prepare($upd);
                    $s->bindParam(':ids', $ids_json);
                    $s->bindParam(':sid', $scan_history_id);
                    $s->execute();
                } catch (Exception $e) {
                    error_log('Failed to associate reviews with scan ' . $scan_history_id . ': ' . $e->getMessage());
                    return false;
                }
            }
            return true;
        }
        return false;
    }

    public function getUserHistory($user_id) {
        $query = "SELECT sh.id, sh.trust_score, sh.fake_count, sh.genuine_count, sh.uncertain_count, sh.risk_level, sh.scan_date,
                         p.title as product_title, p.platform, p.image_url, p.url as product_url 
                  FROM scan_history sh 
                  JOIN products p ON sh.product_id = p.id 
                  WHERE sh.user_id = :user_id
                  ORDER BY sh.scan_date DESC"; 
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':user_id', $user_id, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function deleteOwnedScan($scan_id, $user_id) {
        return $this->deleteOwnedScans([intval($scan_id)], $user_id);
    }

    public function deleteOwnedScans($scan_ids, $user_id) {
        $scan_ids = array_values(array_unique(array_map('intval', is_array($scan_ids) ? $scan_ids : [])));
        if (!$scan_ids || count($scan_ids) > 1000 || min($scan_ids) < 1) {
            return ["success" => false, "status" => 400, "error" => "Provide between one and 1000 valid scan IDs."];
        }
        return $this->deleteScansForUser($scan_ids, $user_id, true);
    }

    public function deleteAllOwnedScans($user_id) {
        return $this->deleteScansForUser([], $user_id, false);
    }

    private function deleteScansForUser($scanIds, $userId, $requireAllIds) {
        $this->conn->beginTransaction();
        try {
            $where = 'user_id = ?';
            $params = [intval($userId)];
            if ($requireAllIds) {
                $idPlaceholders = implode(',', array_fill(0, count($scanIds), '?'));
                $where .= " AND id IN ($idPlaceholders)";
                $params = array_merge($params, $scanIds);
            }
            $scanStmt = $this->conn->prepare("SELECT id, review_ids_json FROM scan_history WHERE $where FOR UPDATE");
            $scanStmt->execute($params);
            $scans = $scanStmt->fetchAll(PDO::FETCH_ASSOC);
            if (!$scans || ($requireAllIds && count($scans) !== count($scanIds))) {
                $this->conn->rollBack();
                return ["success" => false, "status" => 404, "error" => "Scan record not found or you do not have permission to delete it."];
            }

            $reviewIds = [];
            foreach ($scans as $scan) {
                $decoded = json_decode($scan['review_ids_json'] ?? '', true);
                if (is_array($decoded)) {
                    $reviewIds = array_merge($reviewIds, array_filter($decoded, static function ($id) {
                        return filter_var($id, FILTER_VALIDATE_INT) !== false && intval($id) > 0;
                    }));
                }
            }
            $reviewIds = array_values(array_unique(array_map('intval', $reviewIds)));

            if ($reviewIds) {
                $placeholders = implode(',', array_fill(0, count($reviewIds), '?'));
                // Review rows are created per scan and these IDs are persisted with
                // the scan. Delete the dependent analysis first for databases where
                // the foreign-key cascade was not created.
                $analysisStmt = $this->conn->prepare("DELETE FROM review_analysis WHERE review_id IN ($placeholders)");
                $analysisStmt->execute($reviewIds);
                $reviewsStmt = $this->conn->prepare("DELETE FROM reviews WHERE id IN ($placeholders)");
                $reviewsStmt->execute($reviewIds);
            }

            // reports rows are deleted by the verified ON DELETE CASCADE relation.
            $deletedIds = array_column($scans, 'id');
            $scanPlaceholders = implode(',', array_fill(0, count($deletedIds), '?'));
            // Older databases may not yet have the ON DELETE SET NULL foreign
            // key on notifications, so retain the notification safely without
            // leaving a stale link to the removed scan.
            $notificationStmt = $this->conn->prepare("UPDATE notifications SET scan_id = NULL WHERE scan_id IN ($scanPlaceholders)");
            $notificationStmt->execute($deletedIds);
            $deleteStmt = $this->conn->prepare("DELETE FROM scan_history WHERE user_id = ? AND id IN ($scanPlaceholders)");
            $deleteStmt->execute(array_merge([intval($userId)], $deletedIds));
            if ($deleteStmt->rowCount() !== count($deletedIds)) {
                throw new RuntimeException('The scan record was not deleted.');
            }

            $this->conn->commit();
            return ["success" => true, "deleted_count" => count($deletedIds), "scan_ids" => array_map('intval', $deletedIds)];
        } catch (Throwable $error) {
            if ($this->conn->inTransaction()) $this->conn->rollBack();
            error_log('EchoTrace scan deletion failed: ' . $error->getMessage());
            return ["success" => false, "status" => 500, "error" => "Unable to delete the scan record. Please try again."];
        }
    }

    public function getLatestScans($limit = 10) {
        $query = "SELECT sh.id, sh.trust_score, sh.fake_count, sh.genuine_count, sh.uncertain_count, sh.risk_level, sh.scan_date,
                         p.title as product_title, p.platform, p.image_url, u.username 
                  FROM scan_history sh 
                  JOIN products p ON sh.product_id = p.id 
                  LEFT JOIN users u ON sh.user_id = u.id 
                  ORDER BY sh.scan_date DESC 
                  LIMIT :limit";
        $stmt = $this->conn->prepare($query);
        $stmt->bindValue(':limit', (int)$limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getReportByScanId($scan_id, $user_id, $allow_all = false) {
            $query = "SELECT r.*, sh.trust_score, sh.fake_count, sh.genuine_count, sh.uncertain_count, sh.risk_level, sh.duration_ms, sh.review_source, sh.scan_metadata, sh.scan_date,
                          sh.review_ids_json,
                          p.title as product_title, p.external_id, p.url as product_url, p.image_url, p.platform, p.rating as product_rating 
                   FROM reports r 
                   JOIN scan_history sh ON r.scan_history_id = sh.id 
                   JOIN products p ON r.product_id = p.id 
                   WHERE r.scan_history_id = :scan_id
                     AND (:allow_all = 1 OR sh.user_id = :user_id)
                   LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->bindValue(':scan_id', intval($scan_id), PDO::PARAM_INT);
        $stmt->bindValue(':user_id', intval($user_id), PDO::PARAM_INT);
        $stmt->bindValue(':allow_all', $allow_all ? 1 : 0, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetch();
    }
}
