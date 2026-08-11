<?php
date_default_timezone_set("Asia/Taipei");

$today = date("d");
$thisMonth = isset($_GET['month']) ? date("m", strtotime($_GET['month'])) : date("m");
$thisYear  = isset($_GET['month']) ? date("Y", strtotime($_GET['month'])) : date("Y");
$thisMonthPadded = sprintf('%02d', $thisMonth);   // 確保月份補零，例如 07
$currentMonthStr = $thisYear . '-' . $thisMonthPadded;

$firstDayOfThisMonth   = isset($_GET['month']) ? date("w", strtotime("first day of this month", strtotime($_GET['month']))) : date("w", strtotime("first day of this month"));
$numberOfDaysThisMonth = isset($_GET['month']) ? date("t", strtotime($_GET['month'])) : date("t");
$numberOfWeeksThisMonth = ceil(($firstDayOfThisMonth + $numberOfDaysThisMonth) / 7);

$prevMonth = ($thisMonth == 1) ? ($thisYear - 1) . "-12" : $thisYear . "-" . sprintf("%02d", $thisMonth - 1);
$nextMonth = ($thisMonth == 12) ? ($thisYear + 1) . "-01" : $thisYear . "-" . sprintf("%02d", $thisMonth + 1);

$numberOfDaysPrevMonth = date("t", strtotime($prevMonth));
?>

<div class="app-container">
    <!-- 桌機左側 / 手機上方：主月曆區塊 -->
    <div class="calendar-section">
        <div class="title calendar-header">
            <a href="?month=<?= $prevMonth; ?>" class="previous-month month-nav-btn">&laquo; 上一個月</a>
            <div class="month-display-group">
                <div class="this-year"><?= $thisYear; ?> 年</div>
                <div class="this-month"><?= sprintf('%02d', $thisMonth); ?> 月</div>
            </div>
            <a href="?month=<?= $nextMonth; ?>" class="next-month month-nav-btn">下一個月 &raquo;</a>
        </div>

        <div class="calendar-scroll-wrapper">
            <div class="calendar calendar-grid">
                <div class="weekday date column-0">週日</div>
                <div class="weekday date column-1">週一</div>
                <div class="weekday date column-2">週二</div>
                <div class="weekday date column-3">週三</div>
                <div class="weekday date column-4">週四</div>
                <div class="weekday date column-5">週五</div>
                <div class="weekday date column-6">週六</div>

                <?php
                for ($i = 0; $i < $numberOfWeeksThisMonth; $i++) {
                    for ($j = 0; $j < 7; $j++) {
                        if ($i * 7 + $j >= $firstDayOfThisMonth && $i * 7 + $j <= $firstDayOfThisMonth + $numberOfDaysThisMonth - 1) {
                            $day = $i * 7 + $j - $firstDayOfThisMonth + 1;
                            $sday = sprintf("%02d", $day);
                            // 使用 $thisMonthPadded 確保 data-id 格式一致 (YYYY-MM-DD)
                            echo "<div class=\"date row-$i column-$j\" data-id=\"$thisYear-$thisMonthPadded-$sday\">$day</div>";
                        } elseif ($i * 7 + $j < $firstDayOfThisMonth) {
                            $day = $numberOfDaysPrevMonth - $firstDayOfThisMonth + 1 + $j;
                            $sday = sprintf("%02d", $day);
                            echo "<div class=\"date row-$i column-$j\" data-id=\"$prevMonth-$sday\">$day</div>";
                        } elseif ($i * 7 + $j > $firstDayOfThisMonth + $numberOfDaysThisMonth - 1) {
                            $day = $i * 7 + $j - $firstDayOfThisMonth + 1 - $numberOfDaysThisMonth;
                            $sday = sprintf("%02d", $day);
                            echo "<div class=\"date row-$i column-$j\" data-id=\"$nextMonth-$sday\">$day</div>";
                        }
                    }
                }
                ?>
            </div>
        </div>
    </div>

    <!-- 桌機右側(長表單) / 手機下方(寬表單)：行程編輯面板 -->
    <form class="input-block form-section" onsubmit="return false;">
        <div class="form-header">
            <h3>📅 行程編輯面板</h3>
            <span class="form-subheading">支援拖曳與 Ctrl+Z</span>
        </div>

        <div class="form-grid-container">
            <div class="form-row">
                <label for="month">選擇月份</label>
                <input type="month" id="month" name="month" value="<?= $currentMonthStr; ?>" onchange="location.href='?month=' + this.value">
            </div>
            <div class="form-row">
                <label for="date">選擇日期</label>
                <input type="date" id="date" name="date" readonly>
            </div>

            <div class="form-row">
                <label for="start-time">開始時間</label>
                <input type="time" id="start-time" name="start-time">
            </div>
            <div class="form-row">
                <label for="end-time">結束時間</label>
                <input type="time" id="end-time" name="end-time">
            </div>

            <div class="form-row">
                <label for="during-time">行程時長</label>
                <input type="text" id="during-time" name="during-time" readonly placeholder="HH:MM">
            </div>
            <div class="form-row">
                <label for="type">行程類型</label>
                <select name="type" id="type" required>
                    <option value="">請選擇類型</option>
                    <?php
                    $types = $Types->all();
                    if ($types) {
                        foreach ($types as $type):
                    ?>
                            <option value="<?= htmlspecialchars($type['id']); ?>">
                                <?= htmlspecialchars($type['name']); ?>
                            </option>
                    <?php
                        endforeach;
                    }
                    ?>
                </select>
            </div>

            <div class="form-row form-row-wide">
                <label for="title">行程標題</label>
                <input type="text" id="title" name="title" placeholder="輸入行程標題">
            </div>

            <div class="form-row form-row-wide">
                <label for="description">行程描述</label>
                <textarea name="description" id="description" rows="2" placeholder="輸入行程詳細內容..."></textarea>
            </div>

            <div class="color-pickers-group form-row-wide">
                <div class="color-picker-item">
                    <label for="color">文字顏色</label>
                    <input type="color" name="color" id="color" value="#000000">
                </div>
                <div class="color-picker-item">
                    <label for="background-color">背景顏色</label>
                    <input type="color" name="background-color" id="background-color" value="#ffffff">
                </div>
                <div class="color-picker-item">
                    <label for="border-color">邊框顏色</label>
                    <input type="color" name="border-color" id="border-color" value="#3b82f6">
                </div>
            </div>
        </div>

        <div class="btn-group">
            <input type="hidden" id="id" name="id">
            <button type="button" class="event-btn btn-add" onclick="addEvent(event)">➕ 新增行程</button>
            <button type="button" class="event-btn btn-edit" onclick="editEvent(event)">✏️ 編輯行程</button>
            <button type="button" class="event-btn btn-delete" onclick="deleteEvent(event)">🗑️ 刪除行程</button>
            <button type="button" class="event-btn btn-undo" onclick="undoLastAction()" title="快捷鍵: Ctrl + Z">↩️ 復原 (Ctrl+Z)</button>
            <button type="button" class="event-btn btn-save-all" onclick="saveAllModifiedEvents(event)" title="將所有標有 [已修改] 的行程一次寫入資料庫">💾 儲存所有已修改行程</button>
        </div>
    </form>
</div>