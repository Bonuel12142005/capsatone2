<?php
// backend/config/database.php

class Database
{
    private string $host;
    private string $db_name;
    private string $username;
    private string $password;

    public ?PDO $conn = null;

    public function __construct()
    {
        $this->host = echotrace_env('ECHOTRACE_DB_HOST', '127.0.0.1');
        $this->db_name = echotrace_env('ECHOTRACE_DB_NAME', 'echotrace');
        $this->username = echotrace_env('ECHOTRACE_DB_USER', 'root');
        $this->password = echotrace_env('ECHOTRACE_DB_PASSWORD', '');
    }

    public function getConnection()
    {
        $this->conn = null;

        try {
            // Step 1: Connect WITHOUT specifying a database, so we can create it if absent
            $rootConn = new PDO(
                "mysql:host={$this->host};charset=utf8mb4",
                $this->username,
                $this->password
            );
            $rootConn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

            // Step 2: Create database if it doesn't exist
            $rootConn->exec(
                "CREATE DATABASE IF NOT EXISTS `{$this->db_name}`
                 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            );

            // Step 3: Connect to the target database
            $this->conn = new PDO(
                "mysql:host={$this->host};dbname={$this->db_name};charset=utf8mb4",
                $this->username,
                $this->password
            );
            $this->conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $this->conn->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

            // Step 4: Run migrations (creates tables + seed data if they don't exist)
            $this->runMigrations();
        } catch (PDOException $exception) {
            header('Content-Type: application/json');
            echo json_encode([
                "success" => false,
                "error"   => "Database connection failure. Check the server configuration."
            ]);
            error_log('EchoTrace database connection failure: ' . $exception->getMessage());
            exit;
        }

        return $this->conn;
    }

    // ---------------------------------------------------------------
    // Auto-migration: idempotent — safe to run on every request.
    // Uses CREATE TABLE IF NOT EXISTS and INSERT IGNORE so it never
    // destroys existing data.
    // ---------------------------------------------------------------
    private function runMigrations()
    {
        // Check if migrations already ran by probing a known table
        $result = $this->conn->query(
            "SELECT COUNT(*) FROM information_schema.tables
             WHERE table_schema = '{$this->db_name}' AND table_name = 'users'"
        );
        $tableExists = (int) $result->fetchColumn();

        if ($tableExists) {
            $this->addMissingColumns();
            return; // Tables already in place — skip DDL execution
        }

        // Run every CREATE TABLE statement in a single transaction
        $this->conn->beginTransaction();
        try {
            $this->conn->exec($this->getSchemaDDL());
            $this->conn->exec($this->getSeedSQL());
            $this->conn->commit();
        } catch (Exception $e) {
            $this->conn->rollBack();
            throw $e;
        }
    }

    private function addMissingColumns()
    {
        // Users table: support Google Identity Services OAuth & Email Verification
        $userCols = [
            'google_id' => "ALTER TABLE `users` ADD COLUMN `google_id` VARCHAR(255) DEFAULT NULL UNIQUE AFTER `password_hash`",
            'email_verified_at' => "ALTER TABLE `users` ADD COLUMN `email_verified_at` TIMESTAMP NULL DEFAULT NULL AFTER `google_id`"
        ];
        foreach ($userCols as $col => $alterSql) {
            $stmt = $this->conn->query("SHOW COLUMNS FROM `users` LIKE '{$col}'");
            if ($stmt->rowCount() == 0) {
                $this->conn->exec($alterSql);
            }
        }
        // Ensure email_verification_challenges table exists
        $this->conn->exec("
            CREATE TABLE IF NOT EXISTS `email_verification_challenges` (
                `id` INT AUTO_INCREMENT PRIMARY KEY,
                `user_id` INT NOT NULL,
                `otp_hash` VARCHAR(255) NOT NULL,
                `expires_at` DATETIME NOT NULL,
                `attempt_count` TINYINT DEFAULT 0,
                `is_used` TINYINT DEFAULT 0,
                `is_invalidated` TINYINT DEFAULT 0,
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX `idx_evc_user` (`user_id`),
                INDEX `idx_evc_expires` (`expires_at`),
                FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
            ) ENGINE=InnoDB;
        ");
        // Ensure password_hash is nullable so Google-authenticated accounts can exist without a local password
        try {
            $this->conn->exec("ALTER TABLE `users` MODIFY COLUMN `password_hash` VARCHAR(255) NULL DEFAULT NULL");
        } catch (Exception $e) {}

        $analysisCols = [
            'keywords' => "ALTER TABLE `review_analysis` ADD COLUMN `keywords` TEXT DEFAULT NULL AFTER `duplicate_group_id`",
            'intent' => "ALTER TABLE `review_analysis` ADD COLUMN `intent` VARCHAR(50) DEFAULT 'Feedback' AFTER `keywords`",
            'grammar_score' => "ALTER TABLE `review_analysis` ADD COLUMN `grammar_score` DECIMAL(5,2) DEFAULT 100.00 AFTER `intent`",
            'classification' => "ALTER TABLE `review_analysis` ADD COLUMN `classification` VARCHAR(50) DEFAULT 'Genuine Review' AFTER `grammar_score`",
            'risk_level' => "ALTER TABLE `review_analysis` ADD COLUMN `risk_level` VARCHAR(20) DEFAULT 'Low Risk' AFTER `classification`",
            'language' => "ALTER TABLE `review_analysis` ADD COLUMN `language` VARCHAR(30) DEFAULT NULL AFTER `risk_level`"
        ];

        foreach ($analysisCols as $col => $alterSql) {
            $stmt = $this->conn->query("SHOW COLUMNS FROM `review_analysis` LIKE '{$col}'");
            if ($stmt->rowCount() == 0) {
                $this->conn->exec($alterSql);
            }
        }

        $historyCols = [
            'risk_level' => "ALTER TABLE `scan_history` ADD COLUMN `risk_level` VARCHAR(20) DEFAULT 'Low Risk' AFTER `genuine_count`",
            'uncertain_count' => "ALTER TABLE `scan_history` ADD COLUMN `uncertain_count` INT DEFAULT 0 AFTER `genuine_count`",
            'review_ids_json' => "ALTER TABLE `scan_history` ADD COLUMN `review_ids_json` LONGTEXT DEFAULT NULL AFTER `risk_level`",
            'request_id' => "ALTER TABLE `scan_history` ADD COLUMN `request_id` VARCHAR(64) DEFAULT NULL AFTER `review_ids_json`",
            'duration_ms' => "ALTER TABLE `scan_history` ADD COLUMN `duration_ms` INT DEFAULT NULL AFTER `request_id`",
            'review_source' => "ALTER TABLE `scan_history` ADD COLUMN `review_source` VARCHAR(40) DEFAULT NULL AFTER `duration_ms`",
            'scan_metadata' => "ALTER TABLE `scan_history` ADD COLUMN `scan_metadata` LONGTEXT DEFAULT NULL AFTER `review_source`"
        ];

        foreach ($historyCols as $col => $alterSql) {
            $stmt = $this->conn->query("SHOW COLUMNS FROM `scan_history` LIKE '{$col}'");
            if ($stmt->rowCount() == 0) {
                $this->conn->exec($alterSql);
            }
        }
        try {
            $this->conn->exec("CREATE UNIQUE INDEX `uq_scan_user_request` ON `scan_history` (`user_id`, `request_id`)");
        } catch (Exception $e) {
            // Index already exists on initialized databases.
        }

        $reportsCols = [
            'overall_quality' => "ALTER TABLE `reports` ADD COLUMN `overall_quality` VARCHAR(50) DEFAULT NULL AFTER `summary_recommendation`",
            'genuine_summary' => "ALTER TABLE `reports` ADD COLUMN `genuine_summary` TEXT DEFAULT NULL AFTER `overall_quality`"
        ];

        foreach ($reportsCols as $col => $alterSql) {
            $stmt = $this->conn->query("SHOW COLUMNS FROM `reports` LIKE '{$col}'");
            if ($stmt->rowCount() == 0) {
                $this->conn->exec($alterSql);
            }
        }

        // Prevent retries from creating multiple analyses for one review or
        // multiple reports for one scan. Existing data is retained; an index
        // is skipped only if an older database contains a conflict.
        foreach (
            [
                ['name' => 'uq_review_analysis_review', 'table' => 'review_analysis', 'sql' => "CREATE UNIQUE INDEX `uq_review_analysis_review` ON `review_analysis` (`review_id`)"],
                ['name' => 'uq_reports_scan_history', 'table' => 'reports', 'sql' => "CREATE UNIQUE INDEX `uq_reports_scan_history` ON `reports` (`scan_history_id`)"],
            ] as $index
        ) {
            $indexCheck = $this->conn->prepare("SHOW INDEX FROM `{$index['table']}` WHERE Key_name = :index_name");
            $indexCheck->execute([':index_name' => $index['name']]);
            if ($indexCheck->fetch()) continue;
            try {
                $this->conn->exec($index['sql']);
            } catch (Exception $e) {
                error_log('EchoTrace migration index skipped (' . $index['name'] . '): ' . $e->getMessage());
            }
        }

        $notificationCols = [
            'scan_id' => "ALTER TABLE `notifications` ADD COLUMN `scan_id` INT NULL AFTER `user_id`",
            'type' => "ALTER TABLE `notifications` ADD COLUMN `type` VARCHAR(40) NOT NULL DEFAULT 'system' AFTER `scan_id`",
            'title' => "ALTER TABLE `notifications` ADD COLUMN `title` VARCHAR(150) NOT NULL DEFAULT 'EchoTrace update' AFTER `type`",
            'read_at' => "ALTER TABLE `notifications` ADD COLUMN `read_at` TIMESTAMP NULL DEFAULT NULL AFTER `is_read`",
            'event_key' => "ALTER TABLE `notifications` ADD COLUMN `event_key` VARCHAR(120) NULL AFTER `read_at`"
        ];
        foreach ($notificationCols as $col => $alterSql) {
            $stmt = $this->conn->query("SHOW COLUMNS FROM `notifications` LIKE '{$col}'");
            if ($stmt->rowCount() == 0) $this->conn->exec($alterSql);
        }
        foreach (
            [
                "CREATE INDEX `idx_notifications_user_created` ON `notifications` (`user_id`, `created_at`)",
                "CREATE INDEX `idx_notifications_user_unread` ON `notifications` (`user_id`, `is_read`)",
                "CREATE UNIQUE INDEX `uq_notifications_event` ON `notifications` (`user_id`, `event_key`)"
            ] as $indexSql
        ) {
            try {
                $this->conn->exec($indexSql);
            } catch (Exception $e) {
            }
        }
        foreach (
            [
                "CREATE INDEX `idx_scan_history_date` ON `scan_history` (`scan_date`)",
                "CREATE INDEX `idx_scan_history_product_date` ON `scan_history` (`product_id`, `scan_date`)"
            ] as $indexSql
        ) {
            try {
                $this->conn->exec($indexSql);
            } catch (Exception $e) {
            }
        }

        // Ensure support_messages table exists in incremental schema updates
        $stmt = $this->conn->query("SHOW TABLES LIKE 'support_messages'");
        if ($stmt->rowCount() == 0) {
            $this->conn->exec("
                CREATE TABLE IF NOT EXISTS `support_messages` (
                  `id`         INT AUTO_INCREMENT PRIMARY KEY,
                  `name`       VARCHAR(100) NOT NULL,
                  `email`      VARCHAR(100) NOT NULL,
                  `subject`    VARCHAR(150) NOT NULL,
                  `message`    TEXT NOT NULL,
                  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB
            ");
        }

        // Ensure password_resets table exists
        $stmt = $this->conn->query("SHOW TABLES LIKE 'password_resets'");
        if ($stmt->rowCount() == 0) {
            $this->conn->exec("
                CREATE TABLE IF NOT EXISTS `password_resets` (
                  `id`         INT AUTO_INCREMENT PRIMARY KEY,
                  `email`      VARCHAR(100) NOT NULL,
                  `token`      VARCHAR(64)  NOT NULL UNIQUE,
                  `expires_at` DATETIME    NOT NULL,
                  `used`       TINYINT(1)  DEFAULT 0,
                  `created_at` TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
                  INDEX idx_token (`token`),
                  INDEX idx_email (`email`)
                ) ENGINE=InnoDB
            ");
        }
    }

    // ---------------------------------------------------------------
    // Full schema DDL — mirrors database/echotrace.sql exactly.
    // ---------------------------------------------------------------
    private function getSchemaDDL(): string
    {
        return "
        -- 1. Users
        CREATE TABLE IF NOT EXISTS `users` (
          `id`            INT AUTO_INCREMENT PRIMARY KEY,
          `username`      VARCHAR(50)  NOT NULL UNIQUE,
          `email`         VARCHAR(100) NOT NULL UNIQUE,
          `password_hash` VARCHAR(255) NOT NULL,
          `role`          ENUM('user','admin') DEFAULT 'user',
          `status`        ENUM('active','blocked') DEFAULT 'active',
          `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          `updated_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;

        -- 2. Products
        CREATE TABLE IF NOT EXISTS `products` (
          `id`          INT AUTO_INCREMENT PRIMARY KEY,
          `platform`    VARCHAR(50)  NOT NULL,
          `external_id` VARCHAR(100) NOT NULL,
          `title`       VARCHAR(255) NOT NULL,
          `url`         TEXT NOT NULL,
          `image_url`   TEXT NULL,
          `rating`      DECIMAL(3,2) DEFAULT 0.00,
          `created_at`  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          `updated_at`  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY `platform_external` (`platform`, `external_id`)
        ) ENGINE=InnoDB;

        -- 3. Reviews
        CREATE TABLE IF NOT EXISTS `reviews` (
          `id`                  INT AUTO_INCREMENT PRIMARY KEY,
          `product_id`          INT NOT NULL,
          `author`              VARCHAR(100) DEFAULT 'Anonymous',
          `rating`              INT DEFAULT 5,
          `review_text`         TEXT NOT NULL,
          `title`               VARCHAR(255) DEFAULT '',
          `review_date`         VARCHAR(100) DEFAULT NULL,
          `external_review_id`  VARCHAR(100) DEFAULT NULL,
          `created_at`          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB;

        -- 4. Review Analysis
        CREATE TABLE IF NOT EXISTS `review_analysis` (
          `id`                 INT AUTO_INCREMENT PRIMARY KEY,
          `review_id`          INT NOT NULL,
          `is_fake`            TINYINT(1) DEFAULT 0,
          `confidence_score`   DECIMAL(5,2) DEFAULT 0.00,
          `sentiment`          VARCHAR(20) DEFAULT 'neutral',
          `emotion`            VARCHAR(50) DEFAULT NULL,
          `toxicity`           DECIMAL(5,2) DEFAULT 0.00,
          `duplicate_group_id` INT DEFAULT NULL,
          `keywords`           TEXT DEFAULT NULL,
          `intent`             VARCHAR(50) DEFAULT 'Feedback',
          `grammar_score`      DECIMAL(5,2) DEFAULT 100.00,
          `classification`     VARCHAR(50) DEFAULT 'Genuine Review',
          `risk_level`         VARCHAR(20) DEFAULT 'Low Risk',
          `language`           VARCHAR(30) DEFAULT NULL,
          `fake_reasons`       TEXT DEFAULT NULL,
          `checked_at`         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY `uq_review_analysis_review` (`review_id`),
          FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB;

        -- 5. Scan History
        CREATE TABLE IF NOT EXISTS `scan_history` (
          `id`            INT AUTO_INCREMENT PRIMARY KEY,
          `user_id`       INT NULL,
          `product_id`    INT NOT NULL,
          `trust_score`   DECIMAL(5,2) NOT NULL,
          `fake_count`    INT DEFAULT 0,
          `genuine_count` INT DEFAULT 0,
          `uncertain_count` INT DEFAULT 0,
          `risk_level`    VARCHAR(20) DEFAULT 'Low Risk',
          `review_ids_json` LONGTEXT DEFAULT NULL,
          `request_id`     VARCHAR(64) DEFAULT NULL,
          `duration_ms`    INT DEFAULT NULL,
          `review_source`  VARCHAR(40) DEFAULT NULL,
          `scan_metadata`  LONGTEXT DEFAULT NULL,
          `scan_date`     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY `uq_scan_user_request` (`user_id`, `request_id`),
          FOREIGN KEY (`user_id`)    REFERENCES `users`(`id`)    ON DELETE SET NULL,
          FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB;

        -- 6. Reports
        CREATE TABLE IF NOT EXISTS `reports` (
          `id`                    INT AUTO_INCREMENT PRIMARY KEY,
          `product_id`            INT NOT NULL,
          `scan_history_id`       INT NOT NULL,
          `summary_strengths`     TEXT DEFAULT NULL,
          `summary_weaknesses`    TEXT DEFAULT NULL,
          `summary_recommendation` TEXT DEFAULT NULL,
          `overall_quality`       VARCHAR(50) DEFAULT NULL,
          `genuine_summary`       TEXT DEFAULT NULL,
          `generated_at`          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY `uq_reports_scan_history` (`scan_history_id`),
          FOREIGN KEY (`product_id`)      REFERENCES `products`(`id`)      ON DELETE CASCADE,
          FOREIGN KEY (`scan_history_id`) REFERENCES `scan_history`(`id`)  ON DELETE CASCADE
        ) ENGINE=InnoDB;

        -- 7. Notifications
        CREATE TABLE IF NOT EXISTS `notifications` (
          `id`         INT AUTO_INCREMENT PRIMARY KEY,
          `user_id`    INT NOT NULL,
          `scan_id`    INT NULL,
          `type`       VARCHAR(40) NOT NULL DEFAULT 'system',
          `title`      VARCHAR(150) NOT NULL DEFAULT 'EchoTrace update',
          `message`    VARCHAR(255) NOT NULL,
          `is_read`    TINYINT(1) DEFAULT 0,
          `read_at`    TIMESTAMP NULL DEFAULT NULL,
          `event_key`  VARCHAR(120) NULL,
          `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
          FOREIGN KEY (`scan_id`) REFERENCES `scan_history`(`id`) ON DELETE SET NULL,
          INDEX `idx_notifications_user_created` (`user_id`, `created_at`),
          INDEX `idx_notifications_user_unread` (`user_id`, `is_read`),
          UNIQUE KEY `uq_notifications_event` (`user_id`, `event_key`)
        ) ENGINE=InnoDB;

        -- 8. Feedback (community corrections)
        CREATE TABLE IF NOT EXISTS `feedback` (
          `id`             INT AUTO_INCREMENT PRIMARY KEY,
          `review_id`      INT NOT NULL,
          `user_id`        INT NOT NULL,
          `reported_label` ENUM('fake','genuine') NOT NULL,
          `comments`       TEXT NULL,
          `created_at`     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON DELETE CASCADE,
          FOREIGN KEY (`user_id`)   REFERENCES `users`(`id`)   ON DELETE CASCADE
        ) ENGINE=InnoDB;

        -- 9. AI Request Logs
        CREATE TABLE IF NOT EXISTS `ai_logs` (
          `id`               INT AUTO_INCREMENT PRIMARY KEY,
          `api_endpoint`     VARCHAR(100) NOT NULL,
          `request_payload`  LONGTEXT NULL,
          `response_payload` LONGTEXT NULL,
          `duration_ms`      INT DEFAULT 0,
          `created_at`       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;

        -- 10. System Settings
        CREATE TABLE IF NOT EXISTS `settings` (
          `id`            INT AUTO_INCREMENT PRIMARY KEY,
          `setting_key`   VARCHAR(50) NOT NULL UNIQUE,
          `setting_value` TEXT NOT NULL,
          `updated_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;

        -- 11. Login / Auth Logs
        CREATE TABLE IF NOT EXISTS `login_logs` (
          `id`         INT AUTO_INCREMENT PRIMARY KEY,
          `user_id`    INT NULL,
          `ip_address` VARCHAR(45) DEFAULT NULL,
          `user_agent` TEXT DEFAULT NULL,
          `status`     ENUM('success','failed') NOT NULL,
          `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
        ) ENGINE=InnoDB;

        -- 12. Support Messages (Contact Form)
        CREATE TABLE IF NOT EXISTS `support_messages` (
          `id`         INT AUTO_INCREMENT PRIMARY KEY,
          `name`       VARCHAR(100) NOT NULL,
          `email`      VARCHAR(100) NOT NULL,
          `subject`    VARCHAR(150) NOT NULL,
          `message`    TEXT NOT NULL,
          `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
        ";
    }

    // ---------------------------------------------------------------
    // Seed data — INSERT IGNORE so re-runs are safe.
    // Test Accounts:
    // admin / Admin123!
    // user / User123!
    // mackky / MC123456
    // mckenllyhuertas / MC123456
    // ---------------------------------------------------------------
    private function getSeedSQL(): string
    {
        return "
        INSERT IGNORE INTO `users`
          (`username`, `email`, `password_hash`, `role`, `status`)
        VALUES
          ('admin', 'admin@echotrace.com',
           '\$2y\$10\$Am2O44ForN7cV4O/mAebN.DncBKBK7VSV3G9kAGAuOIqwZYKjN/sy',
           'admin', 'active'),
          ('user', 'user@echotrace.com',
           '\$2y\$10\$zjhCIxJ25vBbojJWnU4Q1eDEk/5MjMjvD6vh6ju.ZlMH0wgVDL02K',
           'user', 'active'),
          ('mackky', 'mackky@echotrace.com',
           '\$2y\$10\$A00eurKBgxjzXaOAkFFLpOtXdsvlKocEy3coBrHbjFZ9UzdRxc.9C',
           'user', 'active'),
          ('mckenllyhuertas', 'mckenllyhuertas@gmail.com',
           '\$2y\$10\$A00eurKBgxjzXaOAkFFLpOtXdsvlKocEy3coBrHbjFZ9UzdRxc.9C',
           'user', 'active');

        INSERT IGNORE INTO `settings` (`setting_key`, `setting_value`)
        VALUES
          ('ai_detection_threshold',      '0.65'),
          ('duplicate_similarity_threshold', '0.85'),
          ('max_reviews_per_scan',        '100'),
          ('system_name',                 'EchoTrace Fake Review Detector');
        ";
    }
}
