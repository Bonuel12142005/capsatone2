<?php
// backend/services/MailService.php
// Thin wrapper around PHPMailer for Brevo SMTP transactional email.

require_once __DIR__ . '/../libs/PHPMailer/OAuthTokenProvider.php';
require_once __DIR__ . '/../libs/PHPMailer/Exception.php';
require_once __DIR__ . '/../libs/PHPMailer/PHPMailer.php';
require_once __DIR__ . '/../libs/PHPMailer/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;
use PHPMailer\PHPMailer\Exception as MailerException;

class MailService
{
    /**
     * Send an HTML email via Brevo SMTP.
     *
     * @param  string $toEmail   Recipient email address
     * @param  string $toName    Recipient display name
     * @param  string $subject   Email subject line
     * @param  string $htmlBody  Full HTML email body
     * @param  string $textBody  Plain-text fallback (auto-derived when empty)
     * @return bool              True on success; false + error_log on failure
     */
    public static function send(
        string $toEmail,
        string $toName,
        string $subject,
        string $htmlBody,
        string $textBody = ''
    ): bool {
        $host       = (string) echotrace_env('MAIL_HOST',         'smtp-relay.brevo.com');
        $port       = (int)    echotrace_env('MAIL_PORT',         '587');
        $username   = (string) echotrace_env('MAIL_USERNAME',     '');
        $password   = (string) echotrace_env('MAIL_PASSWORD',     '');
        $fromAddr   = (string) echotrace_env('MAIL_FROM_ADDRESS', $username);
        $fromName   = (string) echotrace_env('MAIL_FROM_NAME',    'EchoTrace');
        $encryption = strtolower((string) echotrace_env('MAIL_ENCRYPTION', 'tls'));

        if (empty($username) || empty($password)) {
            error_log('EchoTrace MailService: MAIL_USERNAME or MAIL_PASSWORD not configured.');
            return false;
        }

        $mailer = new PHPMailer(true);

        try {
            // ── SMTP configuration ──────────────────────────────────────────
            $mailer->isSMTP();
            $mailer->Host       = $host;
            $mailer->SMTPAuth   = true;
            $mailer->Username   = $username;
            $mailer->Password   = $password;
            $mailer->Port       = $port;

            if ($encryption === 'ssl') {
                $mailer->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
            } else {
                // 'tls' / 'starttls' → use STARTTLS on port 587
                $mailer->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
            }

            // ── Headers ─────────────────────────────────────────────────────
            $mailer->setFrom($fromAddr, $fromName);
            $mailer->addReplyTo($fromAddr, $fromName);
            $mailer->addAddress($toEmail, $toName);
            $mailer->CharSet = PHPMailer::CHARSET_UTF8;

            // ── Content ─────────────────────────────────────────────────────
            $mailer->isHTML(true);
            $mailer->Subject = $subject;
            $mailer->Body    = $htmlBody;
            $mailer->AltBody = $textBody !== '' ? $textBody : strip_tags($htmlBody);

            $mailer->send();
            return true;

        } catch (MailerException $e) {
            error_log('EchoTrace MailService send failed: ' . $mailer->ErrorInfo);
            return false;
        }
    }
}

