ALTER TABLE `scan_history`
    ADD COLUMN IF NOT EXISTS `uncertain_count` INT NOT NULL DEFAULT 0 AFTER `genuine_count`;
