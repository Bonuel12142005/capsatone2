<?php
// backend/controllers/AuthController.php

require_once __DIR__ . '/../middleware/JWT.php';

class AuthController
{
    private User $userModel;
    private PDO $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
        $this->userModel = new User($db);
    }

    private function frontendOrigin(): string
    {
        $allowed = array_values(array_filter(array_map('trim', explode(',', echotrace_env('ECHOTRACE_ALLOWED_ORIGINS', '')))));
        $requestOrigin = trim((string)($_SERVER['HTTP_ORIGIN'] ?? ''));
        if ($requestOrigin !== '' && in_array($requestOrigin, $allowed, true)) return rtrim($requestOrigin, '/');
        return rtrim($allowed[0] ?? 'http://localhost:8000', '/');
    }

    private function logLogin(?int $user_id, string $status)
    {
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

    public function register(array $data)
    {
        $username = trim($data['username'] ?? '');
        $email = trim($data['email'] ?? '');
        $password = is_string($data['password'] ?? null) ? $data['password'] : '';

        if (empty($username) || empty($email) || empty($password)) {
            return ["success" => false, "error" => "All fields (username, email, password) are required."];
        }

        if (strlen($username) > 50 || strlen($email) > 100 || strlen($password) > 256) {
            return ["success" => false, "error" => "One or more fields exceed the allowed length."];
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

        // Create user with email unverified (requires OTP verification)
        $user_id = $this->userModel->create($username, $email, $password, 'user', null, false);
        if ($user_id) {
            // Generate notification
            $msg = "Welcome to EchoTrace, $username! Please verify your email to activate your account.";
            $notif_q = "INSERT INTO notifications (user_id, message) VALUES (:user_id, :message)";
            $notif_stmt = $this->db->prepare($notif_q);
            $notif_stmt->bindParam(':user_id', $user_id);
            $notif_stmt->bindParam(':message', $msg);
            $notif_stmt->execute();

            // Generate and send OTP via Brevo SMTP
            require_once __DIR__ . '/../services/OtpService.php';
            require_once __DIR__ . '/../services/MailService.php';

            $otpSvc = new OtpService($this->db);
            $otp = $otpSvc->createChallenge((int)$user_id);

            $this->sendVerificationEmail($email, $username, $otp);

            return [
                "success" => true,
                "requires_verification" => true,
                "email" => $email,
                "message" => "Registration successful! A 6-digit verification code has been sent to your email."
            ];
        }

        return ["success" => false, "error" => "Registration failed. Try again later."];
    }

    public function login(array $data)
    {
        // Accept the current frontend field and the legacy API field so old
        // clients continue to authenticate against this same users table.
        $login_input = trim((string)($data['identifier']
            ?? $data['username_or_email']
            ?? $data['username']
            ?? $data['email']
            ?? ''));
        $password = is_string($data['password'] ?? null) ? $data['password'] : '';

        if (empty($login_input) || empty($password) || strlen($login_input) > 100 || strlen($password) > 1024) {
            return ["success" => false, "error" => "Username/Email and Password are required.", "status" => 400];
        }

        // Find by username or email (case-insensitive)
        error_log('EchoTrace login attempt for identifier type: ' . (filter_var($login_input, FILTER_VALIDATE_EMAIL) ? 'email' : 'username'));
        $user = $this->userModel->findByUsernameOrEmail($login_input);

        if (!$user) {
            error_log('EchoTrace login rejected: user_not_found; identifier_type=' . (filter_var($login_input, FILTER_VALIDATE_EMAIL) ? 'email' : 'username'));
            $this->logLogin(null, 'failed');
            return ["success" => false, "error" => "Invalid credentials.", "status" => 401];
        }

        if ($user['status'] === 'blocked') {
            $this->logLogin($user['id'], 'failed');
            return ["success" => false, "error" => "Your account has been suspended. Contact support.", "status" => 403];
        }

        // Verify password
        $isPasswordValid = password_verify($password, $user['password_hash']);

        if ($isPasswordValid) {
            // Check if email is verified (only for standard password users who don't have a Google account)
            if (empty($user['google_id']) && empty($user['email_verified_at'])) {
                $this->logLogin($user['id'], 'failed');
                return [
                    "success" => false,
                    "error" => "Please verify your email address to continue.",
                    "requires_verification" => true,
                    "email" => $user['email'],
                    "status" => 403
                ];
            }

            $this->logLogin($user['id'], 'success');

            // Generate JWT Token
            try {
                $token = JWT::generate([
                    "id" => $user['id'],
                    "username" => $user['username'],
                    "role" => $user['role']
                ]);
            } catch (RuntimeException $e) {
                error_log('EchoTrace authentication configuration error: ' . $e->getMessage());
                return ["success" => false, "error" => "Authentication service is not configured.", "status" => 503];
            }

            // Set secure session cookie so new tabs and page reloads seamlessly retain session
            $isSecure = (echotrace_env('ECHOTRACE_COOKIE_SECURE', '0') === '1');
            $rememberMe = !empty($data['remember_me']) || !empty($data['rememberMe']);
            $cookieExpires = $rememberMe ? time() + (3600 * 24 * 7) : 0;
            setcookie('echotrace_token', $token, [
                'expires' => $cookieExpires,
                'path' => '/',
                'secure' => $isSecure,
                'httponly' => true,
                'samesite' => 'Lax'
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

        error_log('EchoTrace login rejected: password_mismatch; user_id=' . intval($user['id']));
        $this->logLogin($user['id'], 'failed');
        return ["success" => false, "error" => "Invalid credentials.", "status" => 401];
    }

    public function googleLogin(array $data)
    {
        $idToken = trim((string)($data['credential'] ?? $data['id_token'] ?? ''));
        if (empty($idToken)) {
            return ["success" => false, "error" => "Google identity credential is required.", "status" => 400];
        }

        require_once __DIR__ . '/../services/GoogleAuthService.php';

        $claims = GoogleAuthService::verifyIdToken($idToken);
        if ($claims === false) {
            $this->logLogin(null, 'failed');
            return ["success" => false, "error" => "Google identity verification failed or token is invalid.", "status" => 401];
        }

        $googleSub = trim((string)($claims['sub'] ?? ''));
        $googleEmail = strtolower(trim((string)($claims['email'] ?? '')));

        if (empty($googleSub) || empty($googleEmail)) {
            return ["success" => false, "error" => "Google token is missing required identity claims.", "status" => 400];
        }

        // 1. Recognize returning Google user by unique Google Subject Identifier
        $user = $this->userModel->findByGoogleId($googleSub);

        if ($user) {
            if ($user['status'] === 'blocked') {
                $this->logLogin($user['id'], 'failed');
                return ["success" => false, "error" => "Your account has been suspended. Contact support.", "status" => 403];
            }
        } else {
            // 2. Prevent unsafe account linking / takeover:
            // If an existing account has this email but NO linked google_id, DO NOT silently merge!
            $existingEmailUser = $this->userModel->findByEmail($googleEmail);
            if ($existingEmailUser) {
                // Legitimate protection against account takeover
                return [
                    "success" => false,
                    "error" => "An account with this email already exists using password authentication. Sign in with your password to access your account.",
                    "status" => 409
                ];
            }

            // 3. Create a new standard user account for this Google user
            // Derive a clean, unique username from email or name
            $baseUsername = preg_replace('/[^a-zA-Z0-9_]/', '', explode('@', $googleEmail)[0]);
            if (empty($baseUsername)) {
                $baseUsername = 'google_user';
            }
            if (strlen($baseUsername) > 30) {
                $baseUsername = substr($baseUsername, 0, 30);
            }

            $candidateUsername = $baseUsername;
            $counter = 1;
            while ($this->userModel->findByUsername($candidateUsername)) {
                $candidateUsername = $baseUsername . '_' . $counter;
                $counter++;
            }

            // Always create with standard 'user' role — never grant admin privileges
            // Google authenticated accounts have verified emails by definition
            $newUserId = $this->userModel->create(
                $candidateUsername,
                $googleEmail,
                null, // No local password
                'user',
                $googleSub,
                true // verified = true for Google SSO
            );

            if (!$newUserId) {
                return ["success" => false, "error" => "Unable to create your account with Google. Please try again.", "status" => 500];
            }

            // Welcome notification
            try {
                $msg = "Welcome to EchoTrace, $candidateUsername! Your account was securely created via Google.";
                $notif_q = "INSERT INTO notifications (user_id, message) VALUES (:user_id, :message)";
                $notif_stmt = $this->db->prepare($notif_q);
                $notif_stmt->bindParam(':user_id', $newUserId);
                $notif_stmt->bindParam(':message', $msg);
                $notif_stmt->execute();
            } catch (Exception $e) {}

            $user = $this->userModel->findById($newUserId);
        }

        $this->logLogin($user['id'], 'success');

        // Issue EchoTrace JWT
        try {
            $token = JWT::generate([
                "id" => $user['id'],
                "username" => $user['username'],
                "role" => $user['role']
            ]);
        } catch (RuntimeException $e) {
            error_log('EchoTrace authentication configuration error: ' . $e->getMessage());
            return ["success" => false, "error" => "Authentication service is not configured.", "status" => 503];
        }

        // Set secure HttpOnly session recovery cookie
        $isSecure = (echotrace_env('ECHOTRACE_COOKIE_SECURE', '0') === '1');
        $rememberMe = !empty($data['remember_me']) || !empty($data['rememberMe']);
        $cookieExpires = $rememberMe ? time() + (3600 * 24 * 7) : 0;
        setcookie('echotrace_token', $token, [
            'expires' => $cookieExpires,
            'path' => '/',
            'secure' => $isSecure,
            'httponly' => true,
            'samesite' => 'Lax'
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

    public function getProfile(int $user_id)
    {
        $user = $this->userModel->findById($user_id);
        if ($user) {
            return ["success" => true, "user" => $user];
        }
        return ["success" => false, "error" => "User profile not found."];
    }

    public function updateProfile(int $user_id, array $data)
    {
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

    public function changePassword(int $user_id, array $data)
    {
        $old_pass = is_string($data['old_password'] ?? null) ? $data['old_password'] : '';
        $new_pass = is_string($data['new_password'] ?? null) ? $data['new_password'] : '';

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

        if (strlen($new_pass) < 6 || strlen($new_pass) > 256) {
            return ["success" => false, "error" => "New password must be at least 6 characters."];
        }

        if ($this->userModel->updatePassword($user_id, $new_pass)) {
            return ["success" => true, "message" => "Password changed successfully."];
        }

        return ["success" => false, "error" => "Failed to update password."];
    }

    // -------------------------------------------------------
    // Forgot Password — generates token & sends email
    // -------------------------------------------------------
    public function forgotPassword(array $data)
    {
        $email = trim($data['email'] ?? '');

        if (empty($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return ["success" => false, "error" => "A valid email address is required."];
        }

        // Look up user
        $user = $this->userModel->findByEmail($email);
        // Always respond success to prevent email enumeration attacks
        if (!$user) {
            return ["success" => true, "message" => "If that email is registered, a reset link has been sent."];
        }

        // Delete old tokens for this email
        $del = $this->db->prepare("DELETE FROM password_resets WHERE email = :email");
        $del->bindParam(':email', $email);
        $del->execute();

        // Generate secure token
        $token   = bin2hex(random_bytes(32)); // 64-char hex string
        $tokenHash = hash('sha256', $token);
        $expires = date('Y-m-d H:i:s', strtotime('+1 hour'));

        $ins = $this->db->prepare(
            "INSERT INTO password_resets (email, token, expires_at) VALUES (:email, :token, :expires)"
        );
        $ins->bindParam(':email',   $email);
        $ins->bindParam(':token',   $tokenHash);
        $ins->bindParam(':expires', $expires);
        $ins->execute();

        // Build reset link — use the request origin for frontend URL
        $pathPrefix = str_contains((string)($_SERVER['SCRIPT_NAME'] ?? ''), '/capsatone2/') ? '/capsatone2' : '';
        $reset_link = $this->frontendOrigin() . $pathPrefix . '/frontend/index.html?view=reset-password&token=' . rawurlencode($token);
        $safeUsername = htmlspecialchars((string)$user['username'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $safeResetLink = htmlspecialchars($reset_link, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        // Send HTML email
        $subject = "EchoTrace — Password Reset Request";

        $html_body = "
<!DOCTYPE html>
<html>
<head><meta charset='UTF-8'></head>
<body style='margin:0;padding:0;background:#030712;font-family:Inter,Arial,sans-serif;'>
  <table width='100%' cellpadding='0' cellspacing='0' style='background:#030712;padding:40px 20px;'>
    <tr><td align='center'>
      <table width='520' cellpadding='0' cellspacing='0' style='background:#0b0f19;border:1px solid #1f2937;border-radius:16px;overflow:hidden;'>
        <!-- Header -->
        <tr>
          <td style='background:linear-gradient(135deg,#10b981,#06b6d4);padding:32px 40px;text-align:center;'>
            <h1 style='margin:0;color:#fff;font-size:24px;font-weight:800;letter-spacing:-0.5px;'>EchoTrace</h1>
            <p style='margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px;'>AI-Powered Review Auditing</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style='padding:40px;color:#d1d5db;'>
            <h2 style='margin:0 0 8px;color:#fff;font-size:20px;font-weight:700;'>Password Reset Request</h2>
            <p style='margin:0 0 24px;font-size:14px;line-height:1.6;'>Hello <strong style='color:#fff;'>{$safeUsername}</strong>, we received a request to reset the password for your EchoTrace account.</p>
            <p style='margin:0 0 24px;font-size:14px;line-height:1.6;'>Click the button below to set a new password. This link is valid for <strong style='color:#10b981;'>1 hour</strong>.</p>
            <!-- CTA Button -->
            <table cellpadding='0' cellspacing='0' width='100%'>
              <tr><td align='center' style='padding:8px 0 32px;'>
                <a href='{$safeResetLink}' style='display:inline-block;background:linear-gradient(135deg,#10b981,#06b6d4);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 36px;border-radius:12px;letter-spacing:0.3px;'>
                  Reset My Password
                </a>
              </td></tr>
            </table>
            <p style='margin:0 0 8px;font-size:13px;color:#6b7280;'>Or copy and paste this link into your browser:</p>
            <p style='margin:0 0 24px;font-size:12px;color:#10b981;word-break:break-all;'>{$safeResetLink}</p>
            <hr style='border:none;border-top:1px solid #1f2937;margin:0 0 24px;'>
            <p style='margin:0;font-size:12px;color:#6b7280;line-height:1.6;'>If you did not request a password reset, please ignore this email. Your password will remain unchanged.</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style='padding:20px 40px;background:#050a12;border-top:1px solid #1f2937;text-align:center;'>
            <p style='margin:0;font-size:11px;color:#374151;'>© 2025 EchoTrace. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>";

        $headers  = "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
        $headers .= "From: EchoTrace <no-reply@echotrace.app>\r\n";
        $headers .= "Reply-To: no-reply@echotrace.app\r\n";
        $headers .= "X-Mailer: PHP/" . phpversion();

        mail($email, $subject, $html_body, $headers);

        return ["success" => true, "message" => "If that email is registered, a reset link has been sent."];
    }

    // -------------------------------------------------------
    // Reset Password — validates token & updates password
    // -------------------------------------------------------
    public function resetPassword(array $data)
    {
        $token    = trim($data['token']    ?? '');
        $password = is_string($data['password'] ?? null) ? trim($data['password']) : '';

        if (empty($token) || empty($password)) {
            return ["success" => false, "error" => "Token and new password are required."];
        }

        if (strlen($password) < 6 || strlen($password) > 256) {
            return ["success" => false, "error" => "Password must be at least 6 characters."];
        }

        if (!preg_match('/^[a-f0-9]{64}$/i', $token)) {
            return ["success" => false, "error" => "This reset link is invalid or has expired."];
        }

        // Store only a one-way token hash in new reset records. The raw token
        // fallback keeps already-issued legacy links working during migration.
        $tokenHash = hash('sha256', $token);
        $stmt = $this->db->prepare(
            "SELECT * FROM password_resets
             WHERE (token = :token_hash OR token = :token_plain) AND used = 0 AND expires_at > NOW()
             LIMIT 1"
        );
        $stmt->bindParam(':token_hash', $tokenHash);
        $stmt->bindParam(':token_plain', $token);
        $stmt->execute();
        $reset = $stmt->fetch();

        if (!$reset) {
            return ["success" => false, "error" => "This reset link is invalid or has expired."];
        }

        // Find user by email
        $user = $this->userModel->findByEmail($reset['email']);
        if (!$user) {
            return ["success" => false, "error" => "User not found."];
        }

        try {
            $this->db->beginTransaction();
            if (!$this->userModel->updatePassword((int)$user['id'], $password)) {
                throw new RuntimeException('Password update failed.');
            }
            $upd = $this->db->prepare("UPDATE password_resets SET used = 1 WHERE id = :id AND used = 0");
            $upd->bindValue(':id', (int)$reset['id'], PDO::PARAM_INT);
            $upd->execute();
            if ($upd->rowCount() !== 1) throw new RuntimeException('Reset token was already used.');
            $this->db->commit();
        } catch (Throwable $error) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            error_log('EchoTrace password reset failed: ' . $error->getMessage());
            return ["success" => false, "error" => "Unable to reset the password. Please request a new link."];
        }

        return ["success" => true, "message" => "Password reset successfully. You can now log in."];
    }

    public function verifyEmail(array $data): array
    {
        $email = trim((string)($data['email'] ?? ''));
        $otp = trim((string)($data['otp'] ?? ''));

        if (empty($email) || empty($otp)) {
            return ["success" => false, "error" => "Email and verification code are required.", "status" => 400];
        }

        $user = $this->userModel->findByEmail($email);
        if (!$user) {
            return ["success" => false, "error" => "Account not found.", "status" => 404];
        }

        if (!empty($user['email_verified_at'])) {
            return ["success" => true, "message" => "Email is already verified. You can log in.", "already_verified" => true];
        }

        require_once __DIR__ . '/../services/OtpService.php';
        $otpSvc = new OtpService($this->db);
        $errorMessage = '';

        if (!$otpSvc->verifyOtp((int)$user['id'], $otp, $errorMessage)) {
            return ["success" => false, "error" => $errorMessage ?: "Invalid or expired verification code.", "status" => 400];
        }

        // Mark verified
        $this->userModel->markEmailVerified((int)$user['id']);

        // Issue JWT & session cookie immediately for seamless sign-in
        try {
            $token = JWT::generate([
                "id" => $user['id'],
                "username" => $user['username'],
                "role" => $user['role']
            ]);
        } catch (RuntimeException $e) {
            return ["success" => true, "message" => "Email verified successfully! You can now sign in."];
        }

        $isSecure = (echotrace_env('ECHOTRACE_COOKIE_SECURE', '0') === '1');
        setcookie('echotrace_token', $token, [
            'expires' => 0,
            'path' => '/',
            'secure' => $isSecure,
            'httponly' => true,
            'samesite' => 'Lax'
        ]);

        return [
            "success" => true,
            "message" => "Email verified successfully! Logging you in...",
            "token" => $token,
            "user" => [
                "id" => $user['id'],
                "username" => $user['username'],
                "email" => $user['email'],
                "role" => $user['role']
            ]
        ];
    }

    public function resendOtp(array $data): array
    {
        $email = trim((string)($data['email'] ?? ''));

        if (empty($email)) {
            return ["success" => false, "error" => "Email address is required.", "status" => 400];
        }

        $user = $this->userModel->findByEmail($email);
        if (!$user) {
            // Ambiguous response to prevent email harvesting
            return ["success" => true, "message" => "If the account exists, a new verification code has been sent."];
        }

        if (!empty($user['email_verified_at'])) {
            return ["success" => true, "message" => "Email is already verified. Please sign in.", "already_verified" => true];
        }

        require_once __DIR__ . '/../services/OtpService.php';
        require_once __DIR__ . '/../services/MailService.php';

        $otpSvc = new OtpService($this->db);

        if (!$otpSvc->canResend((int)$user['id'])) {
            $remaining = $otpSvc->resendCooldownRemaining((int)$user['id']);
            return [
                "success" => false,
                "error" => "Please wait {$remaining} second(s) before requesting another code.",
                "status" => 429,
                "cooldown_remaining" => $remaining
            ];
        }

        $otp = $otpSvc->createChallenge((int)$user['id']);
        $this->sendVerificationEmail($email, (string)$user['username'], $otp);

        return [
            "success" => true,
            "message" => "A new 6-digit verification code has been sent to your email."
        ];
    }

    private function sendVerificationEmail(string $email, string $username, string $otp): bool
    {
        $safeUsername = htmlspecialchars($username, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $safeOtp = htmlspecialchars($otp, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $subject = "EchoTrace — Your Verification Code: {$safeOtp}";

        $htmlBody = "
<!DOCTYPE html>
<html>
<head><meta charset='UTF-8'></head>
<body style='margin:0;padding:0;background:#030712;font-family:Inter,Arial,sans-serif;'>
  <table width='100%' cellpadding='0' cellspacing='0' style='background:#030712;padding:40px 20px;'>
    <tr><td align='center'>
      <table width='520' cellpadding='0' cellspacing='0' style='background:#0b0f19;border:1px solid #1f2937;border-radius:16px;overflow:hidden;'>
        <!-- Header -->
        <tr>
          <td style='background:linear-gradient(135deg,#06b6d4,#10b981);padding:32px 40px;text-align:center;'>
            <h1 style='margin:0;color:#fff;font-size:24px;font-weight:800;letter-spacing:-0.5px;'>EchoTrace</h1>
            <p style='margin:4px 0 0;color:rgba(255,255,255,0.9);font-size:13px;'>Secure Review Auditing & Verification</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style='padding:40px;color:#d1d5db;'>
            <h2 style='margin:0 0 8px;color:#fff;font-size:20px;font-weight:700;'>Verify Your Email Address</h2>
            <p style='margin:0 0 20px;font-size:14px;line-height:1.6;'>Hello <strong style='color:#fff;'>{$safeUsername}</strong>, welcome to EchoTrace! Use the 6-digit code below to verify your email and activate your account:</p>
            
            <!-- OTP Display Card -->
            <table cellpadding='0' cellspacing='0' width='100%' style='margin:24px 0;'>
              <tr><td align='center'>
                <div style='display:inline-block;background:#111827;border:2px solid #06b6d4;border-radius:12px;padding:16px 36px;letter-spacing:10px;font-size:32px;font-weight:800;color:#38bdf8;font-family:monospace;'>
                  {$safeOtp}
                </div>
              </td></tr>
            </table>

            <p style='margin:0 0 16px;font-size:14px;line-height:1.6;color:#9ca3af;text-align:center;'>
              This code will expire in <strong style='color:#10b981;'>10 minutes</strong>.
            </p>
            <hr style='border:none;border-top:1px solid #1f2937;margin:24px 0;'>
            <p style='margin:0;font-size:12px;color:#6b7280;line-height:1.6;'>If you did not register for an EchoTrace account, please disregard this email.</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style='padding:20px 40px;background:#050a12;border-top:1px solid #1f2937;text-align:center;'>
            <p style='margin:0;font-size:11px;color:#4b5563;'>&copy; " . date('Y') . " EchoTrace. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>";

        $textBody = "EchoTrace - Email Verification\n\nHello {$username},\n\nYour 6-digit verification code is: {$otp}\n\nThis code will expire in 10 minutes.\n\nIf you did not request this, please ignore this email.";

        return MailService::send($email, $username, $subject, $htmlBody, $textBody);
    }
}
