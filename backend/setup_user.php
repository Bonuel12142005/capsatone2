<?php
// backend/setup_user.php
// Quick setup script to add/update user in database

require_once 'config/database.php';

// Configuration
$EMAIL = 'mckenllyhuertas@gmail.com';
$PASSWORD = 'MC123456';

try {
    $database = new Database();
    $db = $database->getConnection();

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
