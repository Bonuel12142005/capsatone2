<?php
/**
 * EchoTrace Maintenance Mode Controller
 * Manages system maintenance state and access control
 */

class MaintenanceMode {
    private static $maintenanceFile = __DIR__ . '/maintenance.flag';
    private static $configFile = __DIR__ . '/maintenance_config.json';
    
    /**
     * Enable maintenance mode
     */
    public static function enable($message = null, $allowedIPs = []) {
        $config = [
            'enabled' => true,
            'message' => $message ?: 'EchoTrace is currently undergoing maintenance. Please check back shortly.',
            'enabled_at' => date('Y-m-d H:i:s'),
            'allowed_ips' => array_merge($allowedIPs, ['127.0.0.1', '::1']), // Always allow localhost
            'admin_key' => self::generateAdminKey()
        ];
        
        file_put_contents(self::$configFile, json_encode($config, JSON_PRETTY_PRINT));
        touch(self::$maintenanceFile);
        
        return $config['admin_key'];
    }
    
    /**
     * Disable maintenance mode
     */
    public static function disable() {
        if (file_exists(self::$maintenanceFile)) {
            unlink(self::$maintenanceFile);
        }
        if (file_exists(self::$configFile)) {
            unlink(self::$configFile);
        }
        return true;
    }
    
    /**
     * Check if maintenance mode is active
     */
    public static function isActive() {
        return file_exists(self::$maintenanceFile);
    }
    
    /**
     * Get maintenance configuration
     */
    public static function getConfig() {
        if (!file_exists(self::$configFile)) {
            return null;
        }
        
        $config = json_decode(file_get_contents(self::$configFile), true);
        return $config ?: null;
    }
    
    /**
     * Check if current request should be allowed during maintenance
     */
    public static function isAllowed() {
        if (!self::isActive()) {
            return true;
        }
        
        $config = self::getConfig();
        if (!$config) {
            return true;
        }
        
        $clientIP = self::getClientIP();
        
        // Check if IP is allowed
        if (in_array($clientIP, $config['allowed_ips'])) {
            return true;
        }
        
        // Check for admin bypass key
        $adminKey = $_GET['admin_key'] ?? $_POST['admin_key'] ?? $_SERVER['HTTP_X_ADMIN_KEY'] ?? null;
        if ($adminKey && $adminKey === $config['admin_key']) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Display maintenance page and exit
     */
    public static function showMaintenancePage() {
        $config = self::getConfig();
        $message = $config['message'] ?? 'System is under maintenance';
        
        http_response_code(503);
        header('Retry-After: 3600'); // Suggest retry in 1 hour
        header('Content-Type: text/html; charset=UTF-8');
        
        echo self::getMaintenancePage($message);
        exit;
    }
    
    /**
     * Generate maintenance page HTML
     */
    private static function getMaintenancePage($message) {
        return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EchoTrace - Maintenance Mode</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 20px;
        }
        .maintenance-container {
            max-width: 600px;
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .logo {
            font-size: 3rem;
            font-weight: bold;
            margin-bottom: 20px;
            color: #fff;
        }
        .status {
            font-size: 1.5rem;
            margin-bottom: 30px;
            color: #f0f0f0;
        }
        .message {
            font-size: 1.1rem;
            line-height: 1.6;
            margin-bottom: 40px;
            color: #e0e0e0;
        }
        .spinner {
            width: 50px;
            height: 50px;
            border: 4px solid rgba(255, 255, 255, 0.3);
            border-top: 4px solid white;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .footer {
            font-size: 0.9rem;
            color: #d0d0d0;
        }
    </style>
</head>
<body>
    <div class="maintenance-container">
        <div class="logo">🔍 EchoTrace</div>
        <div class="spinner"></div>
        <div class="status">Under Maintenance</div>
        <div class="message">{$message}</div>
        <div class="footer">
            We'll be back online shortly. Thank you for your patience.
        </div>
    </div>
</body>
</html>
HTML;
    }
    
    /**
     * Get client IP address
     */
    private static function getClientIP() {
        $ipKeys = ['HTTP_CLIENT_IP', 'HTTP_X_FORWARDED_FOR', 'HTTP_X_FORWARDED', 
                   'HTTP_FORWARDED_FOR', 'HTTP_FORWARDED', 'REMOTE_ADDR'];
        
        foreach ($ipKeys as $key) {
            if (!empty($_SERVER[$key])) {
                $ips = explode(',', $_SERVER[$key]);
                return trim($ips[0]);
            }
        }
        
        return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    }
    
    /**
     * Generate admin bypass key
     */
    private static function generateAdminKey() {
        return bin2hex(random_bytes(16));
    }
    
    /**
     * Get status for API
     */
    public static function getStatus() {
        if (!self::isActive()) {
            return ['maintenance' => false];
        }
        
        $config = self::getConfig();
        return [
            'maintenance' => true,
            'message' => $config['message'] ?? 'Under maintenance',
            'enabled_at' => $config['enabled_at'] ?? null
        ];
    }
}