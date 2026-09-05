-- EchoTrace Database Schema
-- For MySQL / phpMyAdmin / Laragon

CREATE DATABASE IF NOT EXISTS `echotrace` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `echotrace`;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(50) NOT NULL UNIQUE,
  `email` VARCHAR(100) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('user', 'admin') DEFAULT 'user',
  `status` ENUM('active', 'blocked') DEFAULT 'active',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. Products Table
CREATE TABLE IF NOT EXISTS `products` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `platform` VARCHAR(50) NOT NULL, -- e.g., 'amazon', 'shopee', 'lazada', 'ebay'
  `external_id` VARCHAR(100) NOT NULL, -- e.g., ASIN or Shopee Item ID
  `title` VARCHAR(255) NOT NULL,
  `url` TEXT NOT NULL,
  `image_url` TEXT NULL,
  `rating` DECIMAL(3,2) DEFAULT 0.00,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `platform_external` (`platform`, `external_id`)
) ENGINE=InnoDB;

-- 3. Reviews Table
CREATE TABLE IF NOT EXISTS `reviews` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT NOT NULL,
  `author` VARCHAR(100) DEFAULT 'Anonymous',
  `rating` INT DEFAULT 5,
  `review_text` TEXT NOT NULL,
  `title` VARCHAR(255) DEFAULT '',
  `review_date` VARCHAR(100) DEFAULT NULL,
  `external_review_id` VARCHAR(100) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 4. Review Analysis Table
CREATE TABLE IF NOT EXISTS `review_analysis` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `review_id` INT NOT NULL,
  `is_fake` TINYINT(1) DEFAULT 0, -- 1 = Fake, 0 = Genuine
  `confidence_score` DECIMAL(5,2) DEFAULT 0.00, -- e.g., 85.50%
  `sentiment` VARCHAR(20) DEFAULT 'neutral', -- positive, negative, neutral
  `emotion` VARCHAR(50) DEFAULT NULL, -- anger, joy, fear, surprise, etc.
  `toxicity` DECIMAL(5,2) DEFAULT 0.00, -- toxicity percentage
  `duplicate_group_id` INT DEFAULT NULL, -- groups identical or highly similar reviews
  `fake_reasons` TEXT DEFAULT NULL, -- JSON formatted list of reasons (e.g. duplicate patterns, toxic, high sentiment mismatch)
  `checked_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 5. Scan History Table
CREATE TABLE IF NOT EXISTS `scan_history` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NULL,
  `product_id` INT NOT NULL,
  `trust_score` DECIMAL(5,2) NOT NULL, -- computed product trust score (0-100%)
  `fake_count` INT DEFAULT 0,
  `genuine_count` INT DEFAULT 0,
  `scan_date` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 6. Reports Table
CREATE TABLE IF NOT EXISTS `reports` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT NOT NULL,
  `scan_history_id` INT NOT NULL,
  `summary_strengths` TEXT DEFAULT NULL, -- JSON list of product strengths
  `summary_weaknesses` TEXT DEFAULT NULL, -- JSON list of product weaknesses
  `summary_recommendation` TEXT DEFAULT NULL, -- Overall purchase recommendation
  `generated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`scan_history_id`) REFERENCES `scan_history`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 7. Notifications Table
CREATE TABLE IF NOT EXISTS `notifications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `message` VARCHAR(255) NOT NULL,
  `is_read` TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 8. Feedback (Community Reports) Table
CREATE TABLE IF NOT EXISTS `feedback` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `review_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `reported_label` ENUM('fake', 'genuine') NOT NULL,
  `comments` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 9. AI Logs Table
CREATE TABLE IF NOT EXISTS `ai_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `api_endpoint` VARCHAR(100) NOT NULL,
  `request_payload` LONGTEXT NULL,
  `response_payload` LONGTEXT NULL,
  `duration_ms` INT DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 10. Settings Table
CREATE TABLE IF NOT EXISTS `settings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `setting_key` VARCHAR(50) NOT NULL UNIQUE,
  `setting_value` TEXT NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 11. Login Logs Table
CREATE TABLE IF NOT EXISTS `login_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NULL,
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `user_agent` TEXT DEFAULT NULL,
  `status` ENUM('success', 'failed') NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Insert Seed Data
-- Default passwords:
-- Admin: Admin123!
-- User: User123!

INSERT IGNORE INTO `users` (`username`, `email`, `password_hash`, `role`, `status`) VALUES
('admin', 'admin@echotrace.com', '$2y$10$cl8bWY0asJ3KOBj6mn90SODN3etp645WgBRMWaymUEf771hiXrI.m', 'admin', 'active'),
('user', 'user@echotrace.com', '$2y$10$Puh9RJ2JSHG8nXq6X3nDi.0cmSQcyDBqh1H6TSPbeQzLOfkTa2s7O', 'user', 'active');

INSERT INTO `settings` (`setting_key`, `setting_value`) VALUES
('ai_detection_threshold', '0.65'),
('duplicate_similarity_threshold', '0.85'),
('max_reviews_per_scan', '100'),
('system_name', 'EchoTrace Fake Review Detector');
