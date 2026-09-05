<?php
// backend/controllers/AuthController.php

class AuthController {
    private $userModel;
    private $db;

    public function __construct($db) {
        $this->db = $db;
        $this->userModel = new User($db);
    }

    private function logLogin($user_id, $status) {
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        $ua = $_SERVER['HTTP_USER_AGENT'] ?? 'unknown';
        $query = "INSERT INTO login_logs (user_id, ip_address, user_agent, status) VALUES (:user_id, :ip, :ua, :status)";
        $stmt = $this->db->prepare($query);
        $u_id = $user_id ? $user_id : null;
        $stmt->bindParam(':user_id', $u_id);
        $stmt->bindParam(':ip', $ip);
        $stmt->bindParam(':ua', $ua);
        $stmt->bindParam(':status', $status);
        $stmt->execute();
    }

    public function register($data) {
        $username = trim($data['username'] ?? '');
        $email = trim($data['email'] ?? '');
        $password = $data['password'] ?? '';

        if (empty($username) || empty($email) || empty($password)) {
            return ["success" => false, "error" => "All fields (username, email, password) are required."];
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return ["success" => false, "error" => "Invalid email format."];
        }

        if (strlen($password) < 6) {
            return ["success" => false, "error" => "Password must be at least 6 characters."];
        }

        // Check if user already exists
        if ($this->userModel->findByUsername($username)) {
            return ["success" => false, "error" => "Username is already taken."];
        }

        if ($this->userModel->findByEmail($email)) {
            return ["success" => false, "error" => "Email is already registered."];
        }

        // Create user
        $user_id = $this->userModel->create($username, $email, $password, 'user');
        if ($user_id) {
            // Generate notification
            $msg = "Welcome to EchoTrace, $username! Your account has been successfully created.";
            $notif_q = "INSERT INTO notifications (user_id, message) VALUES (:user_id, :message)";
            $notif_stmt = $this->db->prepare($notif_q);
            $notif_stmt->bindParam(':user_id', $user_id);
            $notif_stmt->bindParam(':message', $msg);
            $notif_stmt->execute();

            return ["success" => true, "message" => "Registration successful. You can now login."];
        }

        return ["success" => false, "error" => "Registration failed. Try again later."];
    }

    public function login($data) {
        $login_input = trim($data['username_or_email'] ?? '');
        $password = $data['password'] ?? '';

        if (empty($login_input) || empty($password)) {
            return ["success" => false, "error" => "Username/Email and Password are required."];
        }

        // Find by username or email
        $user = null;
        if (filter_var($login_input, FILTER_VALIDATE_EMAIL)) {
            $user = $this->userModel->findByEmail($login_input);
        } else {
            $user = $this->userModel->findByUsername($login_input);
        }

        if (!$user) {
            $this->logLogin(null, 'failed');
            return ["success" => false, "error" => "Invalid credentials."];
        }

        if ($user['status'] === 'blocked') {
            $this->logLogin($user['id'], 'failed');
            return ["success" => false, "error" => "Your account has been suspended. Contact support."];
        }

        // Verify password
        if (password_verify($password, $user['password_hash'])) {
            $this->logLogin($user['id'], 'success');
            
            // Generate JWT Token
            $token = JWT::generate([
                "id" => $user['id'],
                "username" => $user['username'],
                "role" => $user['role']
            ]);

            return [
                "success" => true,
                "token" => $token,
                "user" => [
                    "id" => $user['id'],
                    "username" => $user['username'],
                    "email" => $user['email'],
                    "role" => $user['role']
                ]
            ];
        }

        $this->logLogin($user['id'], 'failed');
        return ["success" => false, "error" => "Invalid credentials."];
    }

    public function getProfile($user_id) {
        $user = $this->userModel->findById($user_id);
        if ($user) {
            return ["success" => true, "user" => $user];
        }
        return ["success" => false, "error" => "User profile not found."];
    }

    public function updateProfile($user_id, $data) {
        $username = trim($data['username'] ?? '');
        $email = trim($data['email'] ?? '');

        if (empty($username) || empty($email)) {
            return ["success" => false, "error" => "Username and email cannot be empty."];
        }

        // Check if email/username is taken by another user
        $exist_user = $this->userModel->findByUsername($username);
        if ($exist_user && $exist_user['id'] != $user_id) {
            return ["success" => false, "error" => "Username is already taken."];
        }

        $exist_email = $this->userModel->findByEmail($email);
        if ($exist_email && $exist_email['id'] != $user_id) {
            return ["success" => false, "error" => "Email is already taken."];
        }

        if ($this->userModel->updateProfile($user_id, $username, $email)) {
            return ["success" => true, "message" => "Profile updated successfully.", "user" => ["username" => $username, "email" => $email]];
        }

        return ["success" => false, "error" => "Failed to update profile."];
    }

    public function changePassword($user_id, $data) {
        $old_pass = $data['old_password'] ?? '';
        $new_pass = $data['new_password'] ?? '';

        if (empty($old_pass) || empty($new_pass)) {
            return ["success" => false, "error" => "Old password and new password are required."];
        }

        // Fetch user from DB
        $query = "SELECT password_hash FROM users WHERE id = :id";
        $stmt = $this->db->prepare($query);
        $stmt->bindParam(':id', $user_id);
        $stmt->execute();
        $user = $stmt->fetch();

        if (!$user || !password_verify($old_pass, $user['password_hash'])) {
            return ["success" => false, "error" => "Incorrect current password."];
        }

        if (strlen($new_pass) < 6) {
            return ["success" => false, "error" => "New password must be at least 6 characters."];
        }

        if ($this->userModel->updatePassword($user_id, $new_pass)) {
            return ["success" => true, "message" => "Password changed successfully."];
        }

        return ["success" => false, "error" => "Failed to update password."];
    }
}
