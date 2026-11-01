<?php
// backend/models/Product.php

class Product {
    private $conn;
    private $table = "products";

    public function __construct($db) {
        $this->conn = $db;
    }

    public function find($platform, $external_id) {
        $query = "SELECT * FROM " . $this->table . " WHERE platform = :platform AND external_id = :external_id LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':platform', $platform);
        $stmt->bindParam(':external_id', $external_id);
        $stmt->execute();
        return $stmt->fetch();
    }

    public function findById($id) {
        $query = "SELECT * FROM " . $this->table . " WHERE id = :id LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':id', $id);
        $stmt->execute();
        return $stmt->fetch();
    }

    public function getOrInsert($platform, $external_id, $title, $url, $image_url, $rating) {
        // The unique platform/external_id key makes this retry-safe even when
        // two scans for the same product arrive at the same time.
        $query = "INSERT INTO " . $this->table . " (platform, external_id, title, url, image_url, rating)
                  VALUES (:platform, :external_id, :title, :url, :image_url, :rating)
                  ON DUPLICATE KEY UPDATE title = VALUES(title), url = VALUES(url), image_url = VALUES(image_url), rating = VALUES(rating)";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':platform', $platform);
        $stmt->bindParam(':external_id', $external_id);
        $stmt->bindParam(':title', $title);
        $stmt->bindParam(':url', $url);
        $stmt->bindParam(':image_url', $image_url);
        $stmt->bindParam(':rating', $rating);
        
        if (!$stmt->execute()) return false;
        return $this->find($platform, $external_id) ?: false;
    }

    public function getScannedProducts() {
        $query = "SELECT p.*, MAX(s.scan_date) as last_scanned, AVG(s.trust_score) as avg_trust 
                  FROM " . $this->table . " p 
                  JOIN scan_history s ON p.id = s.product_id 
                  GROUP BY p.id 
                  ORDER BY last_scanned DESC";
        $stmt = $this->conn->prepare($query);
        $stmt->execute();
        return $stmt->fetchAll();
    }
}
