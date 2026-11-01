<?php
// backend/models/Review.php

class Review {
    private $conn;

    public function __construct($db) {
        $this->conn = $db;
    }

    public function prepareReviewInsert() {
        return $this->conn->prepare("INSERT INTO reviews (product_id, author, rating, review_text, title, review_date, external_review_id)
                  VALUES (:product_id, :author, :rating, :review_text, :title, :review_date, :external_review_id)");
    }

    public function prepareAnalysisInsert() {
        return $this->conn->prepare("INSERT INTO review_analysis (review_id, is_fake, confidence_score, sentiment, emotion, toxicity, duplicate_group_id, keywords, intent, grammar_score, classification, risk_level, language, fake_reasons)
                  VALUES (:review_id, :is_fake, :confidence_score, :sentiment, :emotion, :toxicity, :duplicate_group_id, :keywords, :intent, :grammar_score, :classification, :risk_level, :language, :fake_reasons)");
    }

    public function insertReview($product_id, $author, $rating, $text, $title, $date, $external_id = null, $statement = null) {
        $stmt = $statement ?: $this->prepareReviewInsert();
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

    public function insertAnalysis($review_id, $is_fake, $confidence_score, $sentiment, $emotion, $toxicity, $duplicate_group_id = null, $fake_reasons = null, $keywords = null, $intent = 'Feedback', $grammar_score = 100.00, $classification = 'Genuine Review', $risk_level = 'Low Risk', $language = null, $statement = null) {
        $stmt = $statement ?: $this->prepareAnalysisInsert();
        
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
        $stmt->bindParam(':language', $language);
        $stmt->bindParam(':fake_reasons', $reasons_json);

        return $stmt->execute();
    }

    public function getReviewsWithAnalysis($product_id, $review_ids = null) {
        if (!empty($review_ids) && is_array($review_ids)) {
            // Scope to specific review IDs from current scan to prevent cross-scan duplication
            $placeholders = implode(',', array_fill(0, count($review_ids), '?'));
            $query = "SELECT r.*, ra.id AS analysis_id, ra.is_fake, ra.confidence_score, ra.sentiment, ra.emotion, ra.toxicity, 
                             ra.duplicate_group_id, ra.keywords, ra.intent, ra.grammar_score, 
                             ra.classification, ra.risk_level, ra.language, ra.fake_reasons 
                      FROM reviews r 
                      LEFT JOIN review_analysis ra ON r.id = ra.review_id 
                      WHERE r.id IN ($placeholders)
                      ORDER BY r.id ASC";
            $stmt = $this->conn->prepare($query);
            $stmt->execute($review_ids);
        } else {
            $query = "SELECT r.*, ra.id AS analysis_id, ra.is_fake, ra.confidence_score, ra.sentiment, ra.emotion, ra.toxicity, 
                             ra.duplicate_group_id, ra.keywords, ra.intent, ra.grammar_score, 
                             ra.classification, ra.risk_level, ra.language, ra.fake_reasons 
                      FROM reviews r 
                      LEFT JOIN review_analysis ra ON r.id = ra.review_id 
                      WHERE r.product_id = :product_id 
                      ORDER BY r.id DESC";
            $stmt = $this->conn->prepare($query);
            $stmt->bindParam(':product_id', $product_id);
            $stmt->execute();
        }
        return $stmt->fetchAll();
    }
}
