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
        $product = $this->find($platform, $external_id);
        if ($product) {
            // Update rating, image, and title in case they changed
            $query = "UPDATE " . $this->table . " SET title = :title, image_url = :image_url, rating = :rating WHERE id = :id";
            $stmt = $this->conn->prepare($query);
            $stmt->bindParam(':title', $title);
            $stmt->bindParam(':image_url', $image_url);
            $stmt->bindParam(':rating', $rating);
            $stmt->bindParam(':id', $product['id']);
            $stmt->execute();
            
            $product['title'] = $title;
            $product['image_url'] = $image_url;
            $product['rating'] = $rating;
            return $product;
        }

        $query = "INSERT INTO " . $this->table . " (platform, external_id, title, url, image_url, rating) 
                  VALUES (:platform, :external_id, :title, :url, :image_url, :rating)";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':platform', $platform);
        $stmt->bindParam(':external_id', $external_id);
        $stmt->bindParam(':title', $title);
        $stmt->bindParam(':url', $url);
        $stmt->bindParam(':image_url', $image_url);
        $stmt->bindParam(':rating', $rating);
        
        if ($stmt->execute()) {
            return [
                "id" => $this->conn->lastInsertId(),
                "platform" => $platform,
                "external_id" => $external_id,
                "title" => $title,
                "url" => $url,
                "image_url" => $image_url,
                "rating" => $rating
            ];
        }
        return false;
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
