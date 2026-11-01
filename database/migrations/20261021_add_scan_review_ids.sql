-- Run once on an existing EchoTrace database.
-- New installations receive this column from backend/config/database.php.
SET @column_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'scan_history'
      AND COLUMN_NAME = 'review_ids_json'
);
SET @migration_sql = IF(
    @column_exists = 0,
    'ALTER TABLE `scan_history` ADD COLUMN `review_ids_json` LONGTEXT NULL AFTER `genuine_count`',
    'SELECT 1'
);
PREPARE migration_statement FROM @migration_sql;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;
