<?php
// db.php - 資料庫封裝類別與安全 PDO 操作

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
date_default_timezone_set("Asia/Taipei");

$config = require_once __DIR__ . "/../../db_config/calendar/calendar-ai/db_config.php";

class DB {
    protected $dsn;
    protected $pdo;
    protected $table;

    public function __construct($table) {
        global $config;
        $this->dsn = "mysql:host=" . $config['host'] . "; charset=utf8; dbname=" . $config['database'];
        $this->pdo = new PDO($this->dsn, $config['username'], $config['password'], []);
        $this->table = $table;
    }

    /**
     * 組合 WHERE 條件與參數綁定
     */
    protected function buildWhere($array) {
        $whereClause = [];
        $params = [];
        foreach ($array as $key => $value) {
            $paramKey = "w_" . preg_replace('/[^a-zA-Z0-9_]/', '_', $key);
            $whereClause[] = "`$key` = :$paramKey";
            $params[$paramKey] = $value;
        }
        return ['sql' => implode(" AND ", $whereClause), 'params' => $params];
    }

    /**
     * 撈取多筆資料 (使用 Prepared Statement 防範 SQL 注入)
     */
    public function all(...$args) {
        $sql = "SELECT * FROM `$this->table`";
        $params = [];

        if (isset($args[0])) {
            if (is_array($args[0])) {
                if (!empty($args[0])) {
                    $whereData = $this->buildWhere($args[0]);
                    $sql .= " WHERE " . $whereData['sql'];
                    $params = array_merge($params, $whereData['params']);
                }
            } else {
                $sql .= " " . $args[0];
            }
        }

        if (isset($args[1])) {
            $sql .= " " . $args[1];
        }

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * 計算筆數
     */
    public function count(...$args) {
        $sql = "SELECT COUNT(*) FROM `$this->table`";
        $params = [];

        if (isset($args[0])) {
            if (is_array($args[0])) {
                if (!empty($args[0])) {
                    $whereData = $this->buildWhere($args[0]);
                    $sql .= " WHERE " . $whereData['sql'];
                    $params = array_merge($params, $whereData['params']);
                }
            } else {
                $sql .= " " . $args[0];
            }
        }

        if (isset($args[1])) {
            $sql .= " " . $args[1];
        }

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchColumn();
    }

    /**
     * 撈取單筆資料
     */
    public function find(...$args) {
        $sql = "SELECT * FROM `$this->table`";
        $params = [];

        if (isset($args[0])) {
            if (is_array($args[0])) {
                $whereData = $this->buildWhere($args[0]);
                $sql .= " WHERE " . $whereData['sql'];
                $params = array_merge($params, $whereData['params']);
            } else {
                $sql .= " WHERE `id` = :id";
                $params['id'] = $args[0];
            }
        }

        if (isset($args[1])) {
            $sql .= " " . $args[1];
        }

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }

    /**
     * 儲存資料 (自動判斷 INSERT 或 UPDATE，皆採用 Prepared Statement)
     */
    public function save($arg) {
        if (isset($arg['id']) && !empty($arg['id'])) {
            $id = $arg['id'];
            unset($arg['id']);

            $setClause = [];
            $params = ['id' => $id];

            foreach ($arg as $key => $value) {
                $paramKey = "s_" . preg_replace('/[^a-zA-Z0-9_]/', '_', $key);
                $setClause[] = "`$key` = :$paramKey";
                $params[$paramKey] = $value;
            }

            $sql = "UPDATE `$this->table` SET " . implode(", ", $setClause) . " WHERE `id` = :id";
            $stmt = $this->pdo->prepare($sql);
            return $stmt->execute($params);
        } else {
            if (isset($arg['id'])) {
                unset($arg['id']);
            }

            $cols = [];
            $placeholders = [];
            $params = [];

            foreach ($arg as $key => $value) {
                $cols[] = "`$key`";
                $paramKey = "i_" . preg_replace('/[^a-zA-Z0-9_]/', '_', $key);
                $placeholders[] = ":$paramKey";
                $params[$paramKey] = $value;
            }

            $sql = "INSERT INTO `$this->table` (" . implode(", ", $cols) . ") VALUES (" . implode(", ", $placeholders) . ")";
            $stmt = $this->pdo->prepare($sql);
            return $stmt->execute($params);
        }
    }

    /**
     * 軟刪除 (Soft Delete: 更新 deleted_at 時間)
     */
    public function softDel($id) {
        $sql = "UPDATE `$this->table` SET `deleted_at` = :deleted_at WHERE `id` = :id";
        $stmt = $this->pdo->prepare($sql);
        return $stmt->execute([
            'deleted_at' => date("Y-m-d H:i:s"),
            'id' => $id
        ]);
    }

    /**
     * 物理刪除 (Hard Delete)
     */
    public function del($arg) {
        $sql = "DELETE FROM `$this->table`";
        $params = [];

        if (is_array($arg)) {
            $whereData = $this->buildWhere($arg);
            $sql .= " WHERE " . $whereData['sql'];
            $params = $whereData['params'];
        } else {
            $sql .= " WHERE `id` = :id";
            $params['id'] = $arg;
        }

        $stmt = $this->pdo->prepare($sql);
        return $stmt->execute($params);
    }

    /**
     * 執行自訂 SQL 指令 (與參數綁定)
     */
    public function q($sql, $params = []) {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}

function dd($array) {
    echo "<pre>";
    print_r($array);
    echo "</pre>";
}

function to($url) {
    header("location: " . $url);
    exit;
}

$Events = new DB("events");
$Types = new DB("types");

?>