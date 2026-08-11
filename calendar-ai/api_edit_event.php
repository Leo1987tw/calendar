<?php

include_once "./db.php";

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $id = trim($_POST['id'] ?? '');
    $date = trim($_POST['date'] ?? '');
    $startTime = trim($_POST['startTime'] ?? '');
    $endTime = trim($_POST['endTime'] ?? '');

    if (empty($id) || empty($date) || empty($startTime) || empty($endTime)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => '行程 ID、日期與時間為必填欄位'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $data = [
        'id'               => $id,
        'event_date'       => $date,
        'start_time'       => $startTime,
        'end_time'         => $endTime,
        'type_id'          => $_POST['type'] ?? '',
        'title'            => $_POST['title'] ?? '',
        'description'      => $_POST['description'] ?? '',
        'color'            => $_POST['color'] ?? '#000000',
        'background_color' => $_POST['backgroundColor'] ?? '#FFFFFF',
        'border_color'     => $_POST['borderColor'] ?? '#000000'
    ];

    $result = $Events->save($data);

    if ($result) {
        echo json_encode(['status' => 'success', 'message' => '成功修改行程'], JSON_UNESCAPED_UNICODE);
    } else {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => '修改失敗'], JSON_UNESCAPED_UNICODE);
    }
} else {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method Not Allowed'], JSON_UNESCAPED_UNICODE);
}

?>