<?php
/**
 * Quick user creation script
 * Usage: php backend/create_user.php username email password
 */

require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/models/User.php';

if ($argc < 4) {
    echo "Usage: php create_user.php <username> <email> <password>\n";
    echo "Example: php create_user.php mackky mackky@echotrace.com MC123456\n";
    exit(1);
}

$username = $argv[1];
$email = $argv[2];
$password = $argv[3];

try {
    $db = new Database();
    $userModel = new User($db->getConnection());
    
    // Check if user exists
    if ($userModel->findByUsername($username)) {
        echo "❌ User '$username' already exists\n";
        exit(1);
    }
    
    if ($userModel->findByEmail($email)) {
        echo "❌ Email '$email' is already registered\n";
        exit(1);
    }
    
    // Create user
    $user_id = $userModel->create($username, $email, $password, 'user');
    
    if ($user_id) {
        echo "✅ User created successfully!\n";
        echo "   Username: $username\n";
        echo "   Email: $email\n";
        echo "   Password: $password\n";
        echo "   User ID: $user_id\n";
    } else {
        echo "❌ Failed to create user\n";
        exit(1);
    }
} catch (Exception $e) {
    echo "❌ Error: " . $e->getMessage() . "\n";
    exit(1);
}
