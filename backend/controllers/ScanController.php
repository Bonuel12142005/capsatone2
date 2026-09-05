<?php
// backend/controllers/ScanController.php

class ScanController {
    private $db;
    private $productModel;
    private $reviewModel;
    private $scanHistoryModel;

    public function __construct($db) {
        $this->db = $db;
        $this->productModel = new Product($db);
        $this->reviewModel = new Review($db);
        $this->scanHistoryModel = new ScanHistory($db);
    }

    private function logAiCall($endpoint, $request_payload, $response_payload, $duration_ms) {
        try {
            $query = "INSERT INTO ai_logs (api_endpoint, request_payload, response_payload, duration_ms) 
                      VALUES (:endpoint, :req, :res, :duration)";
            $stmt = $this->db->prepare($query);
            $req_str = json_encode($request_payload);
            $res_str = json_encode($response_payload);
            $stmt->bindParam(':endpoint', $endpoint);
            $stmt->bindParam(':req', $req_str);
            $stmt->bindParam(':res', $res_str);
            $stmt->bindParam(':duration', $duration_ms);
            $stmt->execute();
        } catch (Exception $e) {
            // Ignore log failure
        }
    }

    public function getHistory($user_id) {
        $history = $this->scanHistoryModel->getUserHistory($user_id);
        return ["success" => true, "history" => $history];
    }

    public function getReport($scan_id) {
        $report = $this->scanHistoryModel->getReportByScanId($scan_id);
        if (!$report) {
            return ["success" => false, "error" => "Report not found."];
        }

        // Decode strengths/weaknesses JSON
        $report['summary_strengths'] = json_decode($report['summary_strengths'], true);
        $report['summary_weaknesses'] = json_decode($report['summary_weaknesses'], true);

        // Fetch reviews associated with this product
        $reviews = $this->reviewModel->getReviewsWithAnalysis($report['product_id']);

        return [
            "success" => true,
            "report" => $report,
            "reviews" => $reviews
        ];
    }

    public function scanProduct($user_id, $data) {
        $platform = trim($data['platform'] ?? '');
        $external_id = trim($data['external_id'] ?? '');
        $title = trim($data['title'] ?? '');
        $url = trim($data['url'] ?? '');
        $image_url = trim($data['image_url'] ?? '');
        $rating = floatval($data['rating'] ?? 0.0);
        $reviews = $data['reviews'] ?? [];

        if (empty($platform) || empty($external_id) || empty($title) || empty($url)) {
            return ["success" => false, "error" => "Product details (platform, external_id, title, url) are required."];
        }

        if (empty($reviews) || !is_array($reviews)) {
            return ["success" => false, "error" => "At least one review is required for analysis."];
        }

        // 1. Get or Insert Product
        $product = $this->productModel->getOrInsert($platform, $external_id, $title, $url, $image_url, $rating);
        if (!$product) {
            return ["success" => false, "error" => "Failed to log product details."];
        }
        $product_id = $product['id'];

        // 2. Prepare reviews payload for AI service
        $ai_payload = ["reviews" => []];
        foreach ($reviews as $idx => $rev) {
            $ai_payload["reviews"][] = [
                "id" => $idx,
                "text" => $rev['text'] ?? '',
                "rating" => intval($rev['rating'] ?? 5),
                "author" => $rev['author'] ?? 'Anonymous'
            ];
        }

        // 3. Request Analysis from Python Flask AI service
        $python_url = "http://127.0.0.1:5000/analyze";
        $ch = curl_init($python_url);
        
        $payload_json = json_encode($ai_payload);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload_json);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 12); // Timeout after 12s
        
        $start_time = microtime(true);
        $response = curl_exec($ch);
        $err = curl_error($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        $duration_ms = intval((microtime(true) - $start_time) * 1000);

        $ai_response = null;
        $fallback_used = false;

        if ($err || $http_code !== 200) {
            // AI Microservice is offline. Fallback to basic rule-based local checks to maintain operational resilience.
            $fallback_used = true;
            $ai_response = $this->runLocalFallbackAnalysis($ai_payload);
            $this->logAiCall($python_url . " [FALLBACK]", $ai_payload, ["error" => $err, "http_code" => $http_code, "fallback_response" => $ai_response], $duration_ms);
        } else {
            $ai_response = json_decode($response, true);
            $this->logAiCall($python_url, $ai_payload, $ai_response, $duration_ms);
        }

        if (!$ai_response || !isset($ai_response['success']) || !$ai_response['success']) {
            return ["success" => false, "error" => "AI service analysis failed."];
        }

        // 4. Save Reviews & Analysis results to database
        $fake_count = 0;
        $genuine_count = 0;
        $results = $ai_response['results'];

        foreach ($results as $idx => $res) {
            $orig_rev = $reviews[$idx];
            
            // Insert Review
            $review_id = $this->reviewModel->insertReview(
                $product_id,
                $orig_rev['author'] ?? 'Anonymous',
                intval($orig_rev['rating'] ?? 5),
                $orig_rev['text'] ?? '',
                $orig_rev['title'] ?? '',
                $orig_rev['date'] ?? null,
                $orig_rev['id'] ?? null
            );

            if ($review_id) {
                // Insert Analysis
                $this->reviewModel->insertAnalysis(
                    $review_id,
                    $res['is_fake'],
                    $res['confidence_score'],
                    $res['sentiment'],
                    $res['emotion'],
                    $res['toxicity'],
                    $res['duplicate_group_id'],
                    $res['fake_reasons'],
                    $res['keywords'] ?? null,
                    $res['intent'] ?? 'Feedback',
                    $res['grammar_score'] ?? 100.00,
                    $res['classification'] ?? ($res['is_fake'] ? 'Suspicious Review' : 'Genuine Review'),
                    $res['risk_level'] ?? ($res['is_fake'] ? 'Medium Risk' : 'Low Risk')
                );
            }

            if ($res['is_fake']) {
                $fake_count++;
            } else {
                $genuine_count++;
            }
        }

        // 5. Create Scan History
        $trust_score = $ai_response['trust_score'];
        $overall_risk_level = $ai_response['overall_risk_level'] ?? 'Low Risk';
        $scan_history_id = $this->scanHistoryModel->createScan($user_id, $product_id, $trust_score, $fake_count, $genuine_count, $overall_risk_level);

        if (!$scan_history_id) {
            return ["success" => false, "error" => "Failed to save scan history."];
        }

        // 6. Save Report summary
        $summary = $ai_response['summary'];
        $this->scanHistoryModel->saveReport(
            $product_id,
            $scan_history_id,
            $summary['strengths'],
            $summary['weaknesses'],
            $summary['recommendation'],
            $summary['overall_quality'] ?? 'Good',
            $summary['genuine_summary'] ?? 'Genuine reviews profile is generally positive.'
        );

        // 7. Add notification for scanning user if logged in
        if ($user_id) {
            $msg = "Scan completed for '{$title}'. Trust Score: {$trust_score}%.";
            $notif_q = "INSERT INTO notifications (user_id, message) VALUES (:user_id, :message)";
            $notif_stmt = $this->db->prepare($notif_q);
            $notif_stmt->bindParam(':user_id', $user_id);
            $notif_stmt->bindParam(':message', $msg);
            $notif_stmt->execute();
        }

        return [
            "success" => true,
            "scan_id" => $scan_history_id,
            "product" => $product,
            "trust_score" => $trust_score,
            "overall_risk_level" => $overall_risk_level,
            "summary" => $summary,
            "fallback_active" => $fallback_used,
            "metrics" => [
                "total_scanned" => count($reviews),
                "fake_detected" => $fake_count,
                "genuine_detected" => $genuine_count
            ]
        ];
    }

    private function runLocalFallbackAnalysis($payload) {
        // Fallback rule-based analyzer when Python microservice is down.
        $results = [];
        $fake_count = 0;
        $total = count($payload['reviews']);

        $spam_keywords = ['buy now', 'click here', 'scam', 'free product', 'paid review', 'discount code', 'gift card'];

        foreach ($payload['reviews'] as $rev) {
            $text = strtolower($rev['text']);
            $is_fake = 0;
            $confidence = 10.0;
            $reasons = [];

            // Simple checks
            if (strlen($text) < 15) {
                $is_fake = 1;
                $confidence = 65.0;
                $reasons[] = "Review text is suspiciously short";
            }

            foreach ($spam_keywords as $kw) {
                if (strpos($text, $kw) !== false) {
                    $is_fake = 1;
                    $confidence = max($confidence, 75.0);
                    $reasons[] = "Contains spam keyword: '$kw'";
                }
            }

            // Exclamations check
            if (substr_count($text, '!') >= 3) {
                $is_fake = 1;
                $confidence = max($confidence, 70.0);
                $reasons[] = "Excessive exclamation marks";
            }

            if ($is_fake) {
                $fake_count++;
            }

            // Simple sentiment
            $pos_words = ['good', 'great', 'love', 'perfect', 'amazing', 'happy'];
            $neg_words = ['bad', 'worst', 'hate', 'terrible', 'useless', 'broke'];
            
            $pos_hits = 0;
            $neg_hits = 0;
            foreach ($pos_words as $pw) { if (strpos($text, $pw) !== false) $pos_hits++; }
            foreach ($neg_words as $nw) { if (strpos($text, $nw) !== false) $neg_hits++; }
            
            $sentiment = 'neutral';
            if ($pos_hits > $neg_hits) $sentiment = 'positive';
            elseif ($neg_hits > $pos_hits) $sentiment = 'negative';

            $results[] = [
                "id" => $rev['id'],
                "author" => $rev['author'],
                "text" => $rev['text'],
                "rating" => $rev['rating'],
                "cleaned_text" => $text,
                "is_fake" => $is_fake,
                "confidence_score" => $confidence,
                "sentiment" => $sentiment,
                "emotion" => ($sentiment === 'positive' ? 'joy' : ($sentiment === 'negative' ? 'anger' : 'neutral')),
                "toxicity" => ($sentiment === 'negative' ? 30.00 : 0.00),
                "duplicate_group_id" => null,
                "keywords" => [],
                "intent" => "Feedback",
                "grammar_score" => 100.00,
                "classification" => $is_fake ? "Suspicious Review" : "Genuine Review",
                "risk_level" => $is_fake ? ($confidence >= 75.0 ? "High Risk" : "Medium Risk") : "Low Risk",
                "fake_reasons" => $reasons
            ];
        }

        $fake_pct = $total > 0 ? ($fake_count / $total) : 0;
        $trust_score = round(100.0 - ($fake_pct * 80.0), 2);

        $overall_risk = "Low Risk";
        if ($trust_score < 50.0) $overall_risk = "High Risk";
        elseif ($trust_score < 80.0) $overall_risk = "Medium Risk";

        return [
            "success" => true,
            "results" => $results,
            "trust_score" => $trust_score,
            "overall_risk_level" => $overall_risk,
            "summary" => [
                "strengths" => ["Acceptable features detected"],
                "weaknesses" => ["Some suspicious entries identified"],
                "recommendation" => "Trust score evaluated using local fallback analysis.",
                "overall_quality" => "Good",
                "genuine_summary" => "Local fallback analysis indicates that genuine feedback shows acceptable product metrics."
            ]
        ];
    }

    // --- RAG Machine Learning Controller Proxy Methods ---

    public function ragQuery($data) {
        return $this->callPythonAi('/rag/query', $data, 'POST');
    }

    public function ragKnowledge() {
        return $this->callPythonAi('/rag/knowledge', [], 'GET');
    }

    public function ragAddKnowledge($data) {
        return $this->callPythonAi('/rag/knowledge/add', $data, 'POST');
    }

    public function ragDeleteKnowledge($data) {
        return $this->callPythonAi('/rag/knowledge/delete', $data, 'POST');
    }

    public function ragReindex() {
        return $this->callPythonAi('/rag/knowledge/reindex', [], 'POST');
    }

    public function ragStats() {
        return $this->callPythonAi('/rag/stats', [], 'GET');
    }

    private function callPythonAi($endpoint, $payload = [], $method = 'POST') {
        $python_url = "http://127.0.0.1:5000" . $endpoint;
        $ch = curl_init($python_url);
        
        if ($method === 'POST') {
            $payload_json = json_encode($payload);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $payload_json);
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
            curl_setopt($ch, CURLOPT_POST, true);
        }
        
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        
        $response = curl_exec($ch);
        $err = curl_error($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($err || $http_code !== 200) {
            return [
                "success" => false,
                "error" => "RAG Python AI microservice unavailable (" . ($err ?: "HTTP $http_code") . "). Ensure python_ai/app.py is running on port 5000."
            ];
        }
        
        $decoded = json_decode($response, true);
        return $decoded ?: ["success" => false, "error" => "Invalid response format from RAG microservice"];
    }
}
