-- EchoTrace notification center: safe incremental upgrade for existing databases.
-- The dynamic DDL is compatible with common Laragon MySQL versions.
SET @column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'scan_id');
SET @sql = IF(@column_exists = 0, 'ALTER TABLE notifications ADD COLUMN scan_id INT NULL AFTER user_id', 'SELECT 1'); PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;
SET @column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'type');
SET @sql = IF(@column_exists = 0, "ALTER TABLE notifications ADD COLUMN type VARCHAR(40) NOT NULL DEFAULT 'system' AFTER scan_id", 'SELECT 1'); PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;
SET @column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'title');
SET @sql = IF(@column_exists = 0, "ALTER TABLE notifications ADD COLUMN title VARCHAR(150) NOT NULL DEFAULT 'EchoTrace update' AFTER type", 'SELECT 1'); PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;
SET @column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'read_at');
SET @sql = IF(@column_exists = 0, 'ALTER TABLE notifications ADD COLUMN read_at TIMESTAMP NULL DEFAULT NULL AFTER is_read', 'SELECT 1'); PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;
SET @column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND COLUMN_NAME = 'event_key');
SET @sql = IF(@column_exists = 0, 'ALTER TABLE notifications ADD COLUMN event_key VARCHAR(120) NULL AFTER read_at', 'SELECT 1'); PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;
SET @index_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND INDEX_NAME = 'idx_notifications_user_created');
SET @sql = IF(@index_exists = 0, 'CREATE INDEX idx_notifications_user_created ON notifications (user_id, created_at)', 'SELECT 1'); PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;
SET @index_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND INDEX_NAME = 'idx_notifications_user_unread');
SET @sql = IF(@index_exists = 0, 'CREATE INDEX idx_notifications_user_unread ON notifications (user_id, is_read)', 'SELECT 1'); PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;
SET @index_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notifications' AND INDEX_NAME = 'uq_notifications_event');
SET @sql = IF(@index_exists = 0, 'CREATE UNIQUE INDEX uq_notifications_event ON notifications (user_id, event_key)', 'SELECT 1'); PREPARE statement FROM @sql; EXECUTE statement; DEALLOCATE PREPARE statement;
