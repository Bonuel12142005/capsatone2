#!/usr/bin/env php
<?php
/**
 * EchoTrace Maintenance Mode CLI Manager
 * Usage: php maintenance.php [enable|disable|status] [options]
 */

require_once __DIR__ . '/maintenance_mode.php';

function showUsage() {
    echo "EchoTrace Maintenance Mode Manager\n";
    echo "Usage: php maintenance.php <command> [options]\n\n";
    echo "Commands:\n";
    echo "  enable    Enable maintenance mode\n";
    echo "  disable   Disable maintenance mode\n";
    echo "  status    Show current maintenance status\n\n";
    echo "Options for 'enable':\n";
    echo "  --message=\"Your message\"    Custom maintenance message\n";
    echo "  --ip=192.168.1.100         Add allowed IP address (can be used multiple times)\n\n";
    echo "Examples:\n";
    echo "  php maintenance.php enable\n";
    echo "  php maintenance.php enable --message=\"Updating database\" --ip=192.168.1.100\n";
    echo "  php maintenance.php disable\n";
    echo "  php maintenance.php status\n";
}

function parseArgs($argv) {
    $args = [
        'command' => null,
        'message' => null,
        'allowed_ips' => []
    ];
    
    for ($i = 1; $i < count($argv); $i++) {
        $arg = $argv[$i];
        
        if (!$args['command'] && !str_starts_with($arg, '--')) {
            $args['command'] = $arg;
        } elseif (str_starts_with($arg, '--message=')) {
            $args['message'] = substr($arg, 10);
        } elseif (str_starts_with($arg, '--ip=')) {
            $args['allowed_ips'][] = substr($arg, 5);
        }
    }
    
    return $args;
}

function enableMaintenance($message, $allowedIPs) {
    $adminKey = MaintenanceMode::enable($message, $allowedIPs);
    
    echo "✓ Maintenance mode ENABLED\n";
    if ($message) {
        echo "  Message: $message\n";
    }
    if (!empty($allowedIPs)) {
        echo "  Allowed IPs: " . implode(', ', $allowedIPs) . "\n";
    }
    echo "  Admin bypass key: $adminKey\n";
    echo "\n";
    echo "IMPORTANT: Save the admin key above to bypass maintenance mode!\n";
    echo "Access URL: http://your-domain.com/?admin_key=$adminKey\n";
}

function disableMaintenance() {
    if (!MaintenanceMode::isActive()) {
        echo "⚠ Maintenance mode is already disabled\n";
        return;
    }
    
    MaintenanceMode::disable();
    echo "✓ Maintenance mode DISABLED\n";
    echo "  System is now accessible to all users\n";
}

function showStatus() {
    if (!MaintenanceMode::isActive()) {
        echo "Status: ACTIVE (Normal operation)\n";
        return;
    }
    
    $config = MaintenanceMode::getConfig();
    
    echo "Status: MAINTENANCE MODE\n";
    echo "  Enabled at: " . ($config['enabled_at'] ?? 'Unknown') . "\n";
    echo "  Message: " . ($config['message'] ?? 'Default message') . "\n";
    echo "  Allowed IPs: " . implode(', ', $config['allowed_ips'] ?? []) . "\n";
    echo "  Admin key: " . ($config['admin_key'] ?? 'Not set') . "\n";
}

// Main execution
if ($argc < 2) {
    showUsage();
    exit(1);
}

$args = parseArgs($argv);

switch ($args['command']) {
    case 'enable':
        enableMaintenance($args['message'], $args['allowed_ips']);
        break;
        
    case 'disable':
        disableMaintenance();
        break;
        
    case 'status':
        showStatus();
        break;
        
    default:
        echo "Error: Unknown command '{$args['command']}'\n\n";
        showUsage();
        exit(1);
}