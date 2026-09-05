<?php
// backend/models/ScanHistory.php

class ScanHistory {
    private $conn;

    public function __construct($db) {
        $this->conn = $db;
    }

    public function createScan($user_id, $product_id, $trust_score, $fake_count, $genuine_count, $risk_level = 'Low Risk') {
        $query = "INSERT INTO scan_history (user_id, product_id, trust_score, fake_count, genuine_count, risk_level) 
                  VALUES (:user_id, :product_id, :trust_score, :fake_count, :genuine_count, :risk_level)";
        $stmt = $this->conn->prepare($query);
        
        $u_id = $user_id ? $user_id : null;
        $stmt->bindParam(':user_id', $u_id);
        $stmt->bindParam(':product_id', $product_id);
        $stmt->bindParam(':trust_score', $trust_score);
        $stmt->bindParam(':fake_count', $fake_count);
        $stmt->bindParam(':genuine_count', $genuine_count);
        $stmt->bindParam(':risk_level', $risk_level);

        if ($stmt->execute()) {
            return $this->conn->lastInsertId();
        }
        return false;
    }

    public function saveReport($product_id, $scan_history_id, $strengths, $weaknesses, $recommendation, $overall_quality = null, $genuine_summary = null) {
        $query = "INSERT INTO reports (product_id, scan_history_id, summary_strengths, summary_weaknesses, summary_recommendation, overall_quality, genuine_summary) 
                  VALUES (:product_id, :scan_history_id, :strengths, :weaknesses, :recommendation, :overall_quality, :genuine_summary)";
        $stmt = $this->conn->prepare($query);
        
        $strengths_json = json_encode($strengths);
        $weaknesses_json = json_encode($weaknesses);

        $stmt->bindParam(':product_id', $product_id);
        $stmt->bindParam(':scan_history_id', $scan_history_id);
        $stmt->bindParam(':strengths', $strengths_json);
        $stmt->bindParam(':weaknesses', $weaknesses_json);
        $stmt->bindParam(':recommendation', $recommendation);
        $stmt->bindParam(':overall_quality', $overall_quality);
        $stmt->bindParam(':genuine_summary', $genuine_summary);

        return $stmt->execute();
    }

    public function getUserHistory($user_id) {
        $query = "SELECT sh.*, p.title as product_title, p.platform, p.image_url, p.url as product_url 
                  FROM scan_history sh 
                  JOIN products p ON sh.product_id = p.id 
                  WHERE sh.user_id = :user_id 
                  ORDER BY sh.scan_date DESC";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':user_id', $user_id);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function getLatestScans($limit = 10) {
        $query = "SELECT sh.*, p.title as product_title, p.platform, p.image_url, u.username 
                  FROM scan_history sh 
                  JOIN products p ON sh.product_id = p.id 
                  LEFT JOIN users u ON sh.user_id = u.id 
                  ORDER BY sh.scan_date DESC 
                  LIMIT :limit";
        $stmt = $this->conn->prepare($query);
        $stmt->bindValue(':limit', (int)$limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function getReportByScanId($scan_id) {
        $query = "SELECT r.*, sh.trust_score, sh.fake_count, sh.genuine_count, sh.risk_level, sh.scan_date, 
                          p.title as product_title, p.url as product_url, p.image_url, p.platform, p.rating as product_rating 
                  FROM reports r 
                  JOIN scan_history sh ON r.scan_history_id = sh.id 
                  JOIN products p ON r.product_id = p.id 
                  WHERE r.scan_history_id = :scan_id LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':scan_id', $scan_id);
        $stmt->execute();
        return $stmt->fetch();
    }
}
