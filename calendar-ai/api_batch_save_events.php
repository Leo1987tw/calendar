<?php

include_once "./db.php";

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // 讀取 POST 的 events 資料
    $rawEvents = $_POST['events'] ?? null;

    if (is_string($rawEvents)) {
        $events = json_decode($rawEvents, true);
    } else {
        $events = $rawEvents;
    }

    if (empty($events) || !is_array($events)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => '缺少欲儲存的行程資料'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $successCount = 0;

    foreach ($events as $item) {
        if (empty($item['id'])) continue;

        // 1. 先把基礎、100% 安全且有資料的欄位包裝起來
        $data = [
            'id'               => $item['id'],
            'event_date'       => $item['date'] ?? date('Y-m-d'),
            'start_time'       => $item['startTime'] ?? '00:00',
            'end_time'         => $item['endTime'] ?? '00:00',
            'title'            => $item['title'] ?? '',
            'description'      => $item['description'] ?? '',
            'color'            => $item['color'] ?? '#000000',
            'background_color' => $item['backgroundColor'] ?? '#ffffff',
            'border_color'     => $item['borderColor'] ?? '#3b82f6'
        ];

        // 💡 2. 終極防禦：嚴格檢查前端傳來的 type 欄位
        // 只有當它「真的有值（是個有效的數字或代碼）」時，我們才把它塞進更新欄位
        if (isset($item['type']) && trim($item['type']) !== '' && $item['type'] !== 'undefined') {
            $data['type_id'] = $item['type'];
        } 
        // 核心邏輯：如果 $item['type'] 是空字串或沒填，我們就不把 'type_id' 放進 $data 陣列中。
        // 這樣 db.php 的 save() 方法就不會去動到資料庫的 type_id 欄位，徹底避開空字串觸發的外鍵崩潰！

        // 3. 呼叫您框架內健全的 $Events->save() 功能
        if ($Events->save($data)) {
            $successCount++;
        }
    }

    echo json_encode([
        'status' => 'success',
        'message' => "成功批次儲存 {$successCount} 個已修改行程",
        'count' => $successCount
    ], JSON_UNESCAPED_UNICODE);

} else {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method Not Allowed'], JSON_UNESCAPED_UNICODE);
}

?>