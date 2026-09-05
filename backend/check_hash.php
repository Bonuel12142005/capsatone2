<?php
$hash = '$2y$10$9sCDQqhRo/v/LroxMKOjA.wG8gn294XGdLD.c9iJDLR..';
$candidates = ['Admin123!', 'User123!', 'MC123456', 'admin', 'user', 'password', '123456'];
foreach ($candidates as $p) {
    if (password_verify($p, $hash)) {
        echo 'MATCH: ' . $p . PHP_EOL;
    } else {
        echo 'No match: ' . $p . PHP_EOL;
    }
}
