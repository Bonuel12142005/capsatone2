<?php
// database/migrations/20261124_add_otp_purpose.php
require_once __DIR__ . '/../../backend/config/env.php';
require_once __DIR__ . '/../../backend/config/database.php';

try {
    $db = (new Database())->getConnection();
    
    // Check if column already exists
    $cols = $db->query("SHOW COLUMNS FROM email_verification_challenges LIKE 'purpose'")->fetchAll();
    if (empty($cols)) {
        $db->exec("ALTER TABLE email_verification_challenges 
                   ADD COLUMN purpose ENUM('registration', 'login') NOT NULL DEFAULT 'registration' AFTER user_id");
        $db->exec("CREATE INDEX idx_user_purpose_active ON email_verification_challenges (user_id, purpose, is_used, is_invalidated, expires_at)");
        echo "Successfully added 'purpose' column and index to email_verification_challenges.\n";
    } else {
        echo "'purpose' column already exists in email_verification_challenges.\n";
    }

    // Verify schema
    $stmt = $db->query("DESCRIBE email_verification_challenges");
    echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC), JSON_PRETTY_PRINT) . PHP_EOL;

} catch (Exception $e) {
    echo "Migration failed: " . $e->getMessage() . PHP_EOL;
    exit(1);
}

