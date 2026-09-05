<?php
$db = new PDO('mysql:host=127.0.0.1;dbname=echotrace', 'root', '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$stmt = $db->query('SELECT id, username, email, role, password_hash FROM users ORDER BY id');
$users = $stmt->fetchAll(PDO::FETCH_ASSOC);

$guesses = [
    'admin'  => ['Admin123!', 'admin123!', 'Admin123', 'admin', 'password'],
    'user'   => ['User123!', 'user123!', 'User123', 'user', 'password'],
    'mackky' => ['MC123456', 'mc123456', 'mackky', 'password', 'MC123456!'],
];

echo "=== CREDENTIAL VERIFICATION ===" . PHP_EOL . PHP_EOL;

foreach ($users as $u) {
    echo "User: " . $u['username'] . " | Email: " . $u['email'] . PHP_EOL;
    $found = false;
    $tries = $guesses[$u['username']] ?? ['Admin123!','User123!','MC123456','password'];
    foreach ($tries as $p) {
        if (password_verify($p, $u['password_hash'])) {
            echo "  ✓ PASSWORD MATCH: " . $p . PHP_EOL;
            $found = true;
            break;
        }
    }
    if (!$found) {
        echo "  ✗ NO MATCH found for known passwords - hash may be outdated or password changed" . PHP_EOL;
        echo "  Hash: " . $u['password_hash'] . PHP_EOL;
    }
    echo PHP_EOL;
}
