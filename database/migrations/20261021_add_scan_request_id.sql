SET @column_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'scan_history' AND COLUMN_NAME = 'request_id'
);
SET @sql = IF(@column_exists = 0,
    'ALTER TABLE `scan_history` ADD COLUMN `request_id` VARCHAR(64) NULL AFTER `genuine_count`',
    'SELECT 1');
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;

SET @index_exists = (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'scan_history' AND INDEX_NAME = 'uq_scan_user_request'
);
SET @sql = IF(@index_exists = 0,
    'CREATE UNIQUE INDEX `uq_scan_user_request` ON `scan_history` (`user_id`, `request_id`)',
    'SELECT 1');
PREPARE statement FROM @sql;
EXECUTE statement;
DEALLOCATE PREPARE statement;
