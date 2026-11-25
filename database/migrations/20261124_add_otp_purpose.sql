-- database/migrations/20261124_add_otp_purpose.sql
-- Add purpose column to email_verification_challenges for strict purpose isolation
ALTER TABLE `email_verification_challenges` 
ADD COLUMN `purpose` ENUM('registration', 'login') NOT NULL DEFAULT 'registration' AFTER `user_id`;

CREATE INDEX `idx_user_purpose_active` ON `email_verification_challenges` (`user_id`, `purpose`, `is_used`, `is_invalidated`, `expires_at`);

