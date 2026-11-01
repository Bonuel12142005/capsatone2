<?php

class Notification {
    private $conn;
    public function __construct($db) { $this->conn = $db; }

    public function create($userId, $type, $title, $message, $scanId = null, $eventKey = null) {
        $sql = "INSERT IGNORE INTO notifications (user_id, scan_id, type, title, message, event_key) VALUES (:user_id,:scan_id,:type,:title,:message,:event_key)";
        $stmt = $this->conn->prepare($sql);
        return $stmt->execute([':user_id'=>(int)$userId, ':scan_id'=>$scanId ? (int)$scanId : null, ':type'=>$type, ':title'=>$title, ':message'=>$message, ':event_key'=>$eventKey]);
    }
    public function listForUser($userId, $limit = 20, $offset = 0) {
        $stmt = $this->conn->prepare("SELECT id, scan_id, type, title, message, is_read, created_at, read_at FROM notifications WHERE user_id=:user_id ORDER BY created_at DESC, id DESC LIMIT :limit OFFSET :offset");
        $stmt->bindValue(':user_id',(int)$userId,PDO::PARAM_INT); $stmt->bindValue(':limit',$limit,PDO::PARAM_INT); $stmt->bindValue(':offset',$offset,PDO::PARAM_INT); $stmt->execute(); return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
    public function unreadCount($userId) { $s=$this->conn->prepare("SELECT COUNT(*) FROM notifications WHERE user_id=? AND is_read=0"); $s->execute([(int)$userId]); return (int)$s->fetchColumn(); }
    public function markRead($id,$userId) { $s=$this->conn->prepare("UPDATE notifications SET is_read=1, read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE id=? AND user_id=?"); $s->execute([(int)$id,(int)$userId]); return $s->rowCount() === 1; }
    public function markAllRead($userId) { $s=$this->conn->prepare("UPDATE notifications SET is_read=1, read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE user_id=? AND is_read=0"); $s->execute([(int)$userId]); return $s->rowCount(); }
    public function delete($id,$userId) { $s=$this->conn->prepare("DELETE FROM notifications WHERE id=? AND user_id=?"); $s->execute([(int)$id,(int)$userId]); return $s->rowCount() === 1; }
    public function clear($userId) { $s=$this->conn->prepare("DELETE FROM notifications WHERE user_id=?"); $s->execute([(int)$userId]); return $s->rowCount(); }
}
