<?php
$db = new PDO('mysql:host=127.0.0.1;dbname=echotrace', 'root', '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$stmt = $db->query('SELECT id, username, email, role, status, password_hash FROM users ORDER BY id');
$users = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo "=== ECHOTRACE USERS (" . count($users) . " total) ===" . PHP_EOL . PHP_EOL;
foreach ($users as $u) {
    echo "-------------------------------------------" . PHP_EOL;
    echo "ID:       " . $u['id'] . PHP_EOL;
    echo "Username: " . $u['username'] . PHP_EOL;
    echo "Email:    " . $u['email'] . PHP_EOL;
    echo "Role:     " . $u['role'] . PHP_EOL;
    echo "Status:   " . $u['status'] . PHP_EOL;
    echo "Hash:     " . $u['password_hash'] . PHP_EOL;
}
echo "-------------------------------------------" . PHP_EOL;
