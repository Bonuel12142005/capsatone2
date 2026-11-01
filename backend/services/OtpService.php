<?php
// backend/services/OtpService.php
// Cryptographically secure OTP generation and verification for email verification.

class OtpService
{
    private const OTP_EXPIRY_SECONDS   = 600;  // 10 minutes
    private const MAX_ATTEMPTS         = 5;
    private const RESEND_COOLDOWN_SECS = 60;   // 1 minute between resends

    private PDO $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
    }

    // ─── Public API ──────────────────────────────────────────────────────────

    /**
     * Create a new OTP challenge for the given user.
     * Invalidates any prior active challenges for this user first.
     * Returns the plaintext OTP (send it by email; never store it).
     */
    public function createChallenge(int $userId): string
    {
        // Invalidate old open challenges
        $this->invalidateOldChallenges($userId);

        $otp  = $this->generateOtp();
        $hash = $this->hashOtp($otp, (string)$userId);

        $stmt = $this->db->prepare(
            "INSERT INTO email_verification_challenges
                 (user_id, otp_hash, expires_at, attempt_count, is_used, is_invalidated)
             VALUES (:uid, :hash, DATE_ADD(NOW(), INTERVAL :expiry SECOND), 0, 0, 0)"
        );
        $stmt->bindValue(':uid',    $userId,                      PDO::PARAM_INT);
        $stmt->bindValue(':hash',   $hash,                        PDO::PARAM_STR);
        $stmt->bindValue(':expiry', self::OTP_EXPIRY_SECONDS,     PDO::PARAM_INT);
        $stmt->execute();

        return $otp;
    }

    /**
     * Verify a submitted OTP for a user.
     * Returns true and marks the challenge used on success.
     * Returns false on invalid/expired/too-many-attempts.
     * @param  string &$error  Set to a user-facing error message on failure
     */
    public function verifyOtp(int $userId, string $submittedOtp, string &$error = ''): bool
    {
        // Fetch the most recent active challenge
        $stmt = $this->db->prepare(
            "SELECT * FROM email_verification_challenges
             WHERE user_id = :uid
               AND is_used = 0
               AND is_invalidated = 0
               AND expires_at > NOW()
             ORDER BY created_at DESC
             LIMIT 1"
        );
        $stmt->bindValue(':uid', $userId, PDO::PARAM_INT);
        $stmt->execute();
        $challenge = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$challenge) {
            $error = 'Verification code has expired. Please request a new one.';
            return false;
        }

        if ((int)$challenge['attempt_count'] >= self::MAX_ATTEMPTS) {
            $error = 'Too many incorrect attempts. Please request a new code.';
            return false;
        }

        // Increment attempt count before checking
        $upd = $this->db->prepare(
            "UPDATE email_verification_challenges
             SET attempt_count = attempt_count + 1
             WHERE id = :id"
        );
        $upd->bindValue(':id', (int)$challenge['id'], PDO::PARAM_INT);
        $upd->execute();

        $expectedHash = $this->hashOtp($submittedOtp, (string)$userId);
        if (!hash_equals($expectedHash, $challenge['otp_hash'])) {
            $remaining = (self::MAX_ATTEMPTS - (int)$challenge['attempt_count'] - 1);
            $error = $remaining > 0
                ? "Incorrect code. {$remaining} attempt(s) remaining."
                : 'Incorrect code. No attempts remaining. Please request a new code.';
            return false;
        }

        // Mark as used
        $mark = $this->db->prepare(
            "UPDATE email_verification_challenges SET is_used = 1 WHERE id = :id"
        );
        $mark->bindValue(':id', (int)$challenge['id'], PDO::PARAM_INT);
        $mark->execute();

        return true;
    }

    /**
     * Check whether the user can request a new OTP (resend cooldown).
     * Returns true if they can resend.
     */
    public function canResend(int $userId): bool
    {
        $stmt = $this->db->prepare(
            "SELECT TIMESTAMPDIFF(SECOND, created_at, NOW()) AS elapsed
             FROM email_verification_challenges
             WHERE user_id = :uid
               AND is_invalidated = 0
             ORDER BY created_at DESC
             LIMIT 1"
        );
        $stmt->bindValue(':uid', $userId, PDO::PARAM_INT);
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) return true;

        return ((int)$row['elapsed']) >= self::RESEND_COOLDOWN_SECS;
    }

    /**
     * Seconds until the user can resend (0 if they can resend now).
     */
    public function resendCooldownRemaining(int $userId): int
    {
        $stmt = $this->db->prepare(
            "SELECT TIMESTAMPDIFF(SECOND, created_at, NOW()) AS elapsed
             FROM email_verification_challenges
             WHERE user_id = :uid
               AND is_invalidated = 0
             ORDER BY created_at DESC
             LIMIT 1"
        );
        $stmt->bindValue(':uid', $userId, PDO::PARAM_INT);
        $stmt->execute();
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) return 0;

        $elapsed   = (int)$row['elapsed'];
        $remaining = self::RESEND_COOLDOWN_SECS - $elapsed;
        return max(0, $remaining);
    }

    /**
     * Invalidate all open challenges for this user (called before issuing a new OTP).
     */
    public function invalidateOldChallenges(int $userId): void
    {
        $stmt = $this->db->prepare(
            "UPDATE email_verification_challenges
             SET is_invalidated = 1
             WHERE user_id = :uid AND is_used = 0 AND is_invalidated = 0"
        );
        $stmt->bindValue(':uid', $userId, PDO::PARAM_INT);
        $stmt->execute();
    }

    // ─── Private Helpers ─────────────────────────────────────────────────────

    /** Cryptographically secure random 6-digit code (100000–999999). */
    private function generateOtp(): string
    {
        return str_pad((string)random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
    }

    /** HMAC-SHA256 keyed hash — never stored as plaintext. */
    private function hashOtp(string $otp, string $userId): string
    {
        $secret = echotrace_env('ECHOTRACE_JWT_SECRET', 'echotrace_otp_secret');
        return hash_hmac('sha256', $otp . ':' . $userId, $secret);
    }
}

