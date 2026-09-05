<?php
// backend/setup_user.php
// Quick setup script to add/update user in database

require_once 'config/database.php';

// Configuration
$EMAIL = 'mckenllyhuertas@gmail.com';
$PASSWORD = 'MC123456';

try {
    $db = new PDO(
        "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME,
        DB_USER,
        DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    // Hash the password with bcrypt
    $password_hash = password_hash($PASSWORD, PASSWORD_BCRYPT);

    // Update existing user
    $update_query = "UPDATE users SET password_hash = :password_hash WHERE email = :email";
    $update_stmt = $db->prepare($update_query);
    $update_stmt->bindParam(':password_hash', $password_hash);
    $update_stmt->bindParam(':email', $EMAIL);
    $update_stmt->execute();

    echo json_encode([
        "success" => true,
        "message" => "Password updated successfully",
        "email" => $EMAIL,
        "password" => $PASSWORD
    ]);

} catch (Exception $e) {
    echo json_encode([
        "success" => false,
        "error" => $e->getMessage()
    ]);
}
?>
