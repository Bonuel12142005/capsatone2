<?php
// backend/models/Review.php

class Review {
    private $conn;

    public function __construct($db) {
        $this->conn = $db;
    }

    public function insertReview($product_id, $author, $rating, $text, $title, $date, $external_id = null) {
        $query = "INSERT INTO reviews (product_id, author, rating, review_text, title, review_date, external_review_id) 
                  VALUES (:product_id, :author, :rating, :review_text, :title, :review_date, :external_review_id)";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':product_id', $product_id);
        $stmt->bindParam(':author', $author);
        $stmt->bindParam(':rating', $rating);
        $stmt->bindParam(':review_text', $text);
        $stmt->bindParam(':title', $title);
        $stmt->bindParam(':review_date', $date);
        $stmt->bindParam(':external_review_id', $external_id);
        
        if ($stmt->execute()) {
            return $this->conn->lastInsertId();
        }
        return false;
    }

    public function insertAnalysis($review_id, $is_fake, $confidence_score, $sentiment, $emotion, $toxicity, $duplicate_group_id = null, $fake_reasons = null, $keywords = null, $intent = 'Feedback', $grammar_score = 100.00, $classification = 'Genuine Review', $risk_level = 'Low Risk') {
        $query = "INSERT INTO review_analysis (review_id, is_fake, confidence_score, sentiment, emotion, toxicity, duplicate_group_id, keywords, intent, grammar_score, classification, risk_level, fake_reasons) 
                  VALUES (:review_id, :is_fake, :confidence_score, :sentiment, :emotion, :toxicity, :duplicate_group_id, :keywords, :intent, :grammar_score, :classification, :risk_level, :fake_reasons)";
        $stmt = $this->conn->prepare($query);
        
        $is_fake_int = $is_fake ? 1 : 0;
        $reasons_json = is_array($fake_reasons) ? json_encode($fake_reasons) : $fake_reasons;
        $keywords_json = is_array($keywords) ? json_encode($keywords) : $keywords;

        $stmt->bindParam(':review_id', $review_id);
        $stmt->bindParam(':is_fake', $is_fake_int);
        $stmt->bindParam(':confidence_score', $confidence_score);
        $stmt->bindParam(':sentiment', $sentiment);
        $stmt->bindParam(':emotion', $emotion);
        $stmt->bindParam(':toxicity', $toxicity);
        $stmt->bindParam(':duplicate_group_id', $duplicate_group_id);
        $stmt->bindParam(':keywords', $keywords_json);
        $stmt->bindParam(':intent', $intent);
        $stmt->bindParam(':grammar_score', $grammar_score);
        $stmt->bindParam(':classification', $classification);
        $stmt->bindParam(':risk_level', $risk_level);
        $stmt->bindParam(':fake_reasons', $reasons_json);

        return $stmt->execute();
    }

    public function getReviewsWithAnalysis($product_id) {
        $query = "SELECT r.*, ra.is_fake, ra.confidence_score, ra.sentiment, ra.emotion, ra.toxicity, ra.duplicate_group_id, ra.keywords, ra.intent, ra.grammar_score, ra.classification, ra.risk_level, ra.fake_reasons 
                  FROM reviews r 
                  LEFT JOIN review_analysis ra ON r.id = ra.review_id 
                  WHERE r.product_id = :product_id 
                  ORDER BY r.id DESC";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':product_id', $product_id);
        $stmt->execute();
        return $stmt->fetchAll();
    }
}
