<?php
/**
 * Setup all test accounts with correct password hashes
 * This script creates all test users and outputs their credentials
 */

require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/models/User.php';

echo "========================================\n";
echo "EchoTrace Test Account Setup\n";
echo "========================================\n\n";

try {
    $db = new Database();
    $conn = $db->getConnection();
    $userModel = new User($conn);
    
    // Test accounts to create
    $testAccounts = [
        ['username' => 'admin', 'email' => 'admin@echotrace.com', 'password' => 'Admin123!', 'role' => 'admin'],
        ['username' => 'user', 'email' => 'user@echotrace.com', 'password' => 'User123!', 'role' => 'user'],
        ['username' => 'mackky', 'email' => 'mackky@echotrace.com', 'password' => 'MC123456', 'role' => 'user'],
        ['username' => 'mckenllyhuertas', 'email' => 'mckenllyhuertas@gmail.com', 'password' => 'MC123456', 'role' => 'user'],
    ];
    
    echo "Creating/Updating test accounts...\n\n";
    
    foreach ($testAccounts as $account) {
        // Check if user exists
        $existing = $userModel->findByUsername($account['username']);
        
        if ($existing) {
            echo "⚠️  User '{$account['username']}' already exists - skipping\n";
            continue;
        }
        
        // Create user
        $user_id = $userModel->create(
            $account['username'],
            $account['email'],
            $account['password'],
            $account['role']
        );
        
        if ($user_id) {
            echo "✅ Created: {$account['username']}\n";
        } else {
            echo "❌ Failed: {$account['username']}\n";
            continue;
        }
    }
    
    echo "\n========================================\n";
    echo "Test Account Credentials:\n";
    echo "========================================\n\n";
    
    foreach ($testAccounts as $account) {
        echo "Username: {$account['username']}\n";
        echo "Email:    {$account['email']}\n";
        echo "Password: {$account['password']}\n";
        echo "Role:     {$account['role']}\n";
        echo "---\n";
    }
    
    echo "\n✅ Setup complete!\n";
    echo "You can now login to the extension with any of these credentials.\n";
    
} catch (Exception $e) {
    echo "❌ Error: " . $e->getMessage() . "\n";
    exit(1);
}
