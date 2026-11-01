<?php
// backend/models/User.php

class User
{
    private PDO $conn;
    private $table = "users";

    public function __construct(PDO $db)
    {
        $this->conn = $db;
    }

    public function findByEmail(string $email): ?array
    {
        $query = "SELECT * FROM " . $this->table . " WHERE email = :email LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':email', $email);
        $stmt->execute();
        $user = $stmt->fetch();
        return $user ?: null;
    }

    public function findByGoogleId(string $googleId): ?array
    {
        $query = "SELECT * FROM " . $this->table . " WHERE google_id = :google_id LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':google_id', $googleId);
        $stmt->execute();
        $user = $stmt->fetch();
        return $user ?: null;
    }

    public function findByUsername(string $username): ?array
    {
        $query = "SELECT * FROM " . $this->table . " WHERE username = :username LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':username', $username);
        $stmt->execute();
        $user = $stmt->fetch();
        return $user ?: null;
    }

    public function findByUsernameOrEmail(string $input): ?array
    {
        $query = "SELECT * FROM " . $this->table . " WHERE LOWER(username) = LOWER(:input) OR LOWER(email) = LOWER(:input) LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':input', $input);
        $stmt->execute();
        $user = $stmt->fetch();
        return $user ?: null;
    }

    public function findById(int $id): ?array
    {
        $query = "SELECT id, username, email, role, status, created_at FROM " . $this->table . " WHERE id = :id LIMIT 1";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':id', $id);
        $stmt->execute();
        $user = $stmt->fetch();
        return $user ?: null;
    }

    public function create(string $username, string $email, ?string $password, string $role = 'user', ?string $googleId = null, bool $verified = false): int|false
    {
        $query = "INSERT INTO " . $this->table . " (username, email, password_hash, google_id, role, status, email_verified_at) 
                  VALUES (:username, :email, :password_hash, :google_id, :role, 'active', :email_verified_at)";
        $stmt = $this->conn->prepare($query);

        $password_hash = (!empty($password)) ? password_hash($password, PASSWORD_BCRYPT) : null;
        $verifiedAt = $verified ? date('Y-m-d H:i:s') : null;

        $stmt->bindParam(':username', $username);
        $stmt->bindParam(':email', $email);
        $stmt->bindParam(':password_hash', $password_hash);
        $stmt->bindParam(':google_id', $googleId);
        $stmt->bindParam(':role', $role);
        $stmt->bindParam(':email_verified_at', $verifiedAt);

        if ($stmt->execute()) {
            return $this->conn->lastInsertId();
        }
        return false;
    }

    public function markEmailVerified(int $userId): bool
    {
        $stmt = $this->conn->prepare("UPDATE " . $this->table . " SET email_verified_at = NOW() WHERE id = :id");
        $stmt->bindParam(':id', $userId, PDO::PARAM_INT);
        return $stmt->execute();
    }

    public function updateProfile(int $id, string $username, string $email): bool
    {
        $query = "UPDATE " . $this->table . " SET username = :username, email = :email WHERE id = :id";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':username', $username);
        $stmt->bindParam(':email', $email);
        $stmt->bindParam(':id', $id);
        return $stmt->execute();
    }

    public function updatePassword(int $id, string $new_password): bool
    {
        $query = "UPDATE " . $this->table . " SET password_hash = :password_hash WHERE id = :id";
        $stmt = $this->conn->prepare($query);
        $password_hash = password_hash($new_password, PASSWORD_BCRYPT);
        $stmt->bindParam(':password_hash', $password_hash);
        $stmt->bindParam(':id', $id);
        return $stmt->execute();
    }

    public function getAllUsers()
    {
        $query = "SELECT id, username, email, role, status, created_at FROM " . $this->table . " ORDER BY id DESC";
        $stmt = $this->conn->prepare($query);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function toggleStatus(int $id, string $status): bool
    {
        $query = "UPDATE " . $this->table . " SET status = :status WHERE id = :id";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':status', $status);
        $stmt->bindParam(':id', $id);
        return $stmt->execute();
    }

    public function changeRole(int $id, string $role): bool
    {
        $query = "UPDATE " . $this->table . " SET role = :role WHERE id = :id";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':role', $role);
        $stmt->bindParam(':id', $id);
        return $stmt->execute();
    }

    public function deleteUser(int $id): bool
    {
        $query = "DELETE FROM " . $this->table . " WHERE id = :id";
        $stmt = $this->conn->prepare($query);
        $stmt->bindParam(':id', $id);
        return $stmt->execute();
    }
}
