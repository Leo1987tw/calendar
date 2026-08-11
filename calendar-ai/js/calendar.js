// js/calendar.js - 萬年曆前端 UIUX 拖曳控制、即時表單同步、Ctrl+Z 復原歷史紀錄與批次儲存已修改行程

var globalActiveCells = null;
let isAnimating = false;

// Ctrl+Z 操作歷史堆疊 (最多保留 30 步)
const undoStack = [];
const MAX_UNDO_STEPS = 30;

/**
 * HTML 轉義函數防範 XSS 攻擊
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Toast 通知系統 (取代 alert() 提供更好的 UX)
 * @param {string} message - 顯示訊息
 * @param {'success'|'error'|'warning'|'info'} type - 通知類型
 * @param {number} duration - 顯示毫秒數 (預設 3500)
 */
function showToast(message, type = 'success', duration = 3500) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || '📢'}</span><span class="toast-msg">${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    // 進場動畫
    requestAnimationFrame(() => {
        requestAnimationFrame(() => { toast.classList.add('toast-show'); });
    });

    // 自動移除
    setTimeout(() => {
        toast.classList.remove('toast-show');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, duration);
}

/**
 * 依據月份 (01~12) 動態切換開源高畫質背景圖
 */
function updateMonthBackground(monthVal) {
    if (!monthVal) return;
    let m = monthVal.split('-')[1] || monthVal;
    m = m.padStart(2, '0');
    let bgUrl = `images/month-${m}.jpg`;
    document.body.style.backgroundImage = `url('${bgUrl}')`;
}

/**
 * 分鐘轉 HH:MM 格式字串
 */
function minutesToTimeString(totalMinutes) {
    totalMinutes = Math.max(0, Math.min(1439, totalMinutes));
    const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const m = String(totalMinutes % 60).padStart(2, '0');
    return `${h}:${m}`;
}

/**
 * 即時同步資料至編輯表單
 */
function syncFormWithEvent(eventId, dateStr, startTimeStr, endTimeStr, type, title, description, color, bgColor, borderColor) {
    if (eventId !== undefined && eventId !== null) $("#id").val(eventId);
    if (dateStr) $("#date").val(dateStr);
    if (startTimeStr) $("#start-time").val(startTimeStr.substring(0, 5));
    if (endTimeStr) $("#end-time").val(endTimeStr.substring(0, 5));
    if (type !== undefined) $("#type").val(type);
    if (title !== undefined) $("#title").val(title);
    if (description !== undefined) $("#description").val(description);
    if (color) $("#color").val(color);
    if (bgColor) $("#background-color").val(bgColor);
    if (borderColor) $("#border-color").val(borderColor);

    if (startTimeStr && endTimeStr) {
        const [sH, sM] = startTimeStr.split(':').map(Number);
        const [eH, eM] = endTimeStr.split(':').map(Number);
        let diff = (eH * 60 + eM) - (sH * 60 + sM);
        if (diff < 0) diff = 0;
        const h = String(Math.floor(diff / 60)).padStart(2, '0');
        const m = String(difference = diff % 60).padStart(2, '0');
        $("#during-time").val(`${h}:${m}`);
    }
}

/**
 * 推進步驟到 Undo 歷史堆疊
 */
function pushUndoRecord(record) {
    if (undoStack.length >= MAX_UNDO_STEPS) {
        undoStack.shift();
    }
    undoStack.push(record);
}

/**
 * 復原上一個操作 (Ctrl + Z)
 */
function undoLastAction() {
    if (undoStack.length === 0) {
        showToast("目前沒有可復原的操作步驟", 'info');
        return;
    }

    const action = undoStack.pop();
    const { element, prev } = action;

    if (!element || !document.body.contains(element)) {
        const foundEl = document.querySelector(`[data-event-id="${action.eventId}"]`);
        if (!foundEl) {
            showToast("找不到該行程元件，無法復原", 'error');
            return;
        }
        action.element = foundEl;
    }

    const targetEl = action.element;

    // 1. 還原父容器 (跨天復原)
    if (prev.parentColumn && targetEl.parentElement !== prev.parentColumn) {
        prev.parentColumn.appendChild(targetEl);
    }

    // 2. 還原位置與尺寸
    targetEl.style.top = `${prev.top}px`;
    targetEl.style.height = `${prev.height}px`;
    targetEl.setAttribute('data-start', prev.startTime);
    targetEl.setAttribute('data-end', prev.endTime);

    // 3. 還原修改標籤屬性
    if (prev.modified) {
        targetEl.setAttribute('data-modified', 'true');
    } else {
        targetEl.removeAttribute('data-modified');
    }

    // 4. 即時同步回表單
    const dateStr = prev.parentColumn ? prev.parentColumn.dataset.id : $("#date").val();
    const type = targetEl.getAttribute('data-type');
    const title = targetEl.getAttribute('data-title');
    const description = targetEl.getAttribute('data-description');
    const color = targetEl.getAttribute('data-color');
    const bgColor = targetEl.getAttribute('data-background-color');
    const borderColor = targetEl.getAttribute('data-border-color');

    syncFormWithEvent(action.eventId, dateStr, prev.startTime, prev.endTime, type, title, description, color, bgColor, borderColor);
}

/**
 * 儲存目前所有標記為 [已修改] 的行程至後端資料庫
 */
function saveAllModifiedEvents(e) {
    if (e && e.stopPropagation) e.stopPropagation();

    const modifiedBlocks = document.querySelectorAll('.time-block[data-modified="true"]');

    if (modifiedBlocks.length === 0) {
        showToast("目前沒有任何需要儲存的已修改行程", 'info');
        return;
    }

    const modifiedEvents = [];
    modifiedBlocks.forEach(block => {
        const id = block.getAttribute('data-event-id');
        const parentDate = block.parentElement ? block.parentElement.dataset.id : '';
        const startTime = block.getAttribute('data-start');
        const endTime = block.getAttribute('data-end');
        const type = block.getAttribute('data-type');
        const title = block.getAttribute('data-title');
        const description = block.getAttribute('data-description');
        const color = block.getAttribute('data-color');
        const backgroundColor = block.getAttribute('data-background-color');
        const borderColor = block.getAttribute('data-border-color');

        modifiedEvents.push({
            id,
            date: parentDate,
            startTime,
            endTime,
            type,
            title,
            description,
            color,
            backgroundColor,
            borderColor
        });
    });

    $.post('./api_batch_save_events.php', {
        events: JSON.stringify(modifiedEvents)
    }, (res) => {
        showToast(res.message || "成功儲存所有已修改行程", 'success');
        // 清除所有 [已修改] 標籤
        modifiedBlocks.forEach(block => {
            block.removeAttribute('data-modified');
        });
    }, "json").fail((xhr) => {
        let err = xhr.responseJSON ? xhr.responseJSON.message : "批次儲存失敗";
        showToast("錯誤: " + err, 'error');
    });
}

// 全域初始化與事件處理
document.addEventListener('DOMContentLoaded', function () {
    const inputMonth = document.querySelector('input[type="month"]');
    if (inputMonth && inputMonth.value) {
        updateMonthBackground(inputMonth.value);
    }

    // 鍵盤 Ctrl + Z 快捷鍵監聽
    window.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
                return;
            }
            e.preventDefault();
            undoLastAction();
        }
    });

    // 日曆網格點擊展開/收合視圖監聽
    window.addEventListener('click', function (event) {
        if (isAnimating) return;

        var date = event.target.closest('.date');
        let someCellIsHidden = document.querySelector('.calendar > div.none');

        if (someCellIsHidden) {
            if (event.target.closest('.input-block')) return;

            if (date) {
                let dateId = date.dataset.id;
                let inputMonth = document.querySelector('input[type="month"]');
                let inputDate = document.querySelector('input[type="date"]');

                if (inputMonth) {
                    inputMonth.value = dateId.substring(0, 7);
                    updateMonthBackground(inputMonth.value);
                }
                if (inputDate) inputDate.value = dateId;

                if (event.target.closest('.calendar > div:not(.checked)')) {
                    let checkedCell = document.querySelectorAll('.calendar > div.checked');
                    checkedCell.forEach(cell => cell.classList.remove('checked'));
                    let classListArrayOfColumn = Array.from(date.classList);
                    let thisColumn = classListArrayOfColumn.find(className => className.startsWith('column-'));
                    let thisCell = document.querySelectorAll(`.calendar > .${thisColumn}`);
                    thisCell.forEach(cell => cell.classList.add('checked'));
                    isTimeBlock(event);
                    return;
                } else {
                    isTimeBlock(event);
                    return;
                }
            }

            let activeCell = document.querySelector('.calendar > div.active');
            let checkedCell = document.querySelector('.calendar > div.checked');

            if (!activeCell || !checkedCell) return;

            var classListArrayOfRow = Array.from(activeCell.classList);
            var thisRow = classListArrayOfRow.find(className => className.startsWith('row-'));
            var classListArrayOfColumn = Array.from(checkedCell.classList);
            var thisColumn = classListArrayOfColumn.find(className => className.startsWith('column-'));

            let thisCells = document.querySelectorAll(`.calendar > .${thisRow}`);
            let thisCell = document.querySelectorAll(`.calendar > .${thisColumn}`);
            let othersCells = document.querySelectorAll(`.calendar > div:not(.weekday):not(.${thisRow})`);
            let title = document.querySelector('.calendar-header') || document.querySelector('.title');

            thisCells.forEach(cell => cell.classList.remove('active'));
            thisCell.forEach(cell => cell.classList.remove('checked'));
            othersCells.forEach(cell => {
                cell.classList.add('collapse');
                cell.classList.remove('none');
            });
            if (title) {
                title.classList.add('collapse');
                title.classList.remove('none');
            }

            const weekdayCell = document.querySelectorAll('.calendar > .weekday');
            weekdayCell.forEach(cell => cell.removeAttribute('data-id'));

            isAnimating = true;

            setTimeout(() => {
                othersCells.forEach(cell => cell.classList.remove('collapse'));
                if (title) title.classList.remove('collapse');
                isAnimating = false;
            }, 10);

            thisCells.forEach(cell => {
                if (cell.dataset.day) {
                    cell.innerHTML = escapeHtml(cell.dataset.day);
                }
            });

            globalActiveCells = null;
        } else {
            if (!date || date.classList.contains('weekday')) return;

            var dateId = date.dataset.id;
            let inputMonth = document.querySelector('input[type="month"]');
            let currentMonth = inputMonth ? inputMonth.value : '';
            let clickedMonth = dateId.substring(0, 7);

            if (currentMonth && clickedMonth !== currentMonth) {
                if (inputMonth) {
                    inputMonth.value = clickedMonth;
                    updateMonthBackground(clickedMonth);
                }
            }

            let inputDate = document.querySelector('input[type="date"]');
            if (inputDate) inputDate.value = dateId;

            var classListArrayOfRow = Array.from(date.classList);
            var thisRow = classListArrayOfRow.find(className => className.startsWith('row-'));
            var classListArrayOfColumn = Array.from(date.classList);
            var thisColumn = classListArrayOfColumn.find(className => className.startsWith('column-'));

            let thisCells = document.querySelectorAll(`.calendar > .${thisRow}`);
            let thisCell = document.querySelectorAll(`.calendar > .${thisColumn}`);
            let othersCells = document.querySelectorAll(`.calendar > div:not(.weekday):not(.${thisRow})`);
            let title = document.querySelector('.calendar-header') || document.querySelector('.title');

            thisCells.forEach(cell => cell.classList.add('active'));
            thisCell.forEach(cell => cell.classList.add('checked'));
            othersCells.forEach(cell => {
                cell.classList.remove('none');
                cell.classList.add('collapse');
            });
            if (title) {
                title.classList.remove('none');
                title.classList.add('collapse');
            }

            thisCells.forEach(cell => {
                const classListArray = Array.from(cell.classList);
                const classColumnNumber = classListArray.find(className => className.startsWith('column-'));

                if (classColumnNumber) {
                    const weekdayCell = document.querySelector(`.calendar > .weekday.${classColumnNumber}`);
                    if (weekdayCell) {
                        weekdayCell.setAttribute('data-id', cell.dataset.id);
                    }
                }
            });

            isAnimating = true;

            setTimeout(() => {
                othersCells.forEach(cell => {
                    cell.classList.add('none');
                    cell.classList.remove('collapse');
                });
                if (title) {
                    title.classList.add('none');
                    title.classList.remove('collapse');
                }
                isAnimating = false;
            }, 400);

            globalActiveCells = thisCells;
            renderEventsToCalendar(thisCells);
        }
    });
});

/**
 * 點擊行程區塊帶入表單
 */
function isTimeBlock(event) {
    if (event.target.closest('.time-block')) {
        const timeBlock = event.target.closest('.time-block');
        document.querySelectorAll('.time-block.checked').forEach(block => block.classList.remove('checked'));
        timeBlock.classList.add('checked');

        const eventId = timeBlock.getAttribute('data-event-id');
        const startTime = timeBlock.getAttribute('data-start');
        const endTime = timeBlock.getAttribute('data-end');
        const type = timeBlock.getAttribute('data-type');
        const title = timeBlock.getAttribute('data-title');
        const description = timeBlock.getAttribute('data-description');
        const color = timeBlock.getAttribute('data-color');
        const backgroundColor = timeBlock.getAttribute('data-background-color');
        const borderColor = timeBlock.getAttribute('data-border-color');

        const parentDate = timeBlock.parentElement ? timeBlock.parentElement.dataset.id : '';

        syncFormWithEvent(eventId, parentDate, startTime, endTime, type, title, description, color, backgroundColor, borderColor);
    }
}

/**
 * 渲染行程至日曆中，並為每個行程區塊綁定 Pointer Events 拖曳/拉伸
 */
function renderEventsToCalendar(cells) {
    cells.forEach(cell => {
        if (!cell.dataset.day) {
            cell.dataset.day = cell.innerHTML;
        }
        cell.innerText = "";
    });

    fetch('api_get_events.php')
        .then(response => {
            if (!response.ok) throw new Error('network response failed');
            return response.json();
        })
        .then(events => {
            events.forEach(event => {
                const id = event.id;
                const date = event.event_date;
                const start = event.start_time ? event.start_time.substring(0, 5) : '00:00';
                const end = event.end_time ? event.end_time.substring(0, 5) : '00:00';
                const type = event.type_id || '';
                const title = event.title || '';
                const description = event.description || '';
                const color = event.color || '#000000';
                const backgroundColor = event.background_color || '#ffffff';
                const borderColor = event.border_color || '#3b82f6';

                const targetColumn = document.querySelector(`.calendar > .date[data-id="${date}"]:not(.weekday)`);

                if (targetColumn && targetColumn.classList.contains('active')) {
                    const isAlreadyExist = targetColumn.querySelector(`[data-event-id="${id}"]`);
                    if (isAlreadyExist) return;

                    const [sH, sM] = start.split(':').map(Number);
                    const [eH, eM] = end.split(':').map(Number);
                    const startMinutesFromMidnight = (sH * 60) + sM;
                    const durationMinutes = Math.max(15, (eH * 60 + eM) - startMinutesFromMidnight);

                    const pixelsPerMinute = 720 / 1440;
                    const topPosition = startMinutesFromMidnight * pixelsPerMinute + 5;
                    const blockHeight = durationMinutes * pixelsPerMinute;

                    const eventElement = document.createElement('div');
                    eventElement.className = 'time-block';
                    eventElement.setAttribute('data-event-id', id);
                    eventElement.setAttribute('data-start', start);
                    eventElement.setAttribute('data-end', end);
                    eventElement.setAttribute('data-type', type);
                    eventElement.setAttribute('data-title', title);
                    eventElement.setAttribute('data-description', description);
                    eventElement.setAttribute('data-color', color);
                    eventElement.setAttribute('data-background-color', backgroundColor);
                    eventElement.setAttribute('data-border-color', borderColor);

                    // 頂部與底部 Resize Handles
                    const topHandle = document.createElement('div');
                    topHandle.className = 'resize-handle-top';

                    const bottomHandle = document.createElement('div');
                    bottomHandle.className = 'resize-handle-bottom';

                    const safeTitle = escapeHtml(title);
                    const safeDescription = escapeHtml(description);

                    eventElement.innerHTML = `
                        <div style="font-size: 11px; opacity: 0.85; pointer-events: none;">${start} - ${end}</div>
                        <div style="font-weight: 800; font-size: 13px; line-height: 1.2; pointer-events: none;">${safeTitle}</div>
                        <div style="font-size: 11px; opacity: 0.9; pointer-events: none; max-height: 36px; overflow: hidden;">${safeDescription}</div>
                    `;

                    eventElement.appendChild(topHandle);
                    eventElement.appendChild(bottomHandle);

                    eventElement.style.top = `${topPosition}px`;
                    eventElement.style.height = `${blockHeight}px`;
                    eventElement.style.color = color;
                    eventElement.style.backgroundColor = backgroundColor;
                    eventElement.style.borderColor = borderColor;
                    eventElement.style.borderStyle = 'solid';
                    eventElement.style.borderWidth = '2px';

                    targetColumn.appendChild(eventElement);

                    // 綁定 Pointer Events 雙向拉伸與拖曳移動
                    bindPointerEvents(eventElement, id);
                }
            });
        })
        .catch(error => console.error('fetch failed:', error));
}

/**
 * 綁定 HTML5 Pointer Events (拖曳移動、頂部/底部雙向拉伸、即時連動表單與 Ctrl+Z 復原)
 */
function bindPointerEvents(element, id) {
    let isPointerDown = false;
    let dragMode = 'move';
    let startY = 0;
    let startTop = 0;
    let startHeight = 0;

    let initialParent = null;
    let initialTop = 0;
    let initialHeight = 0;
    let initialStart = '';
    let initialEnd = '';
    let initialModified = false;

    element.addEventListener('pointerdown', function (e) {
        isPointerDown = true;
        element.setPointerCapture(e.pointerId);

        startY = e.clientY;
        startTop = parseFloat(element.style.top) || 0;
        startHeight = parseFloat(element.style.height) || 30;

        initialParent = element.parentElement;
        initialTop = startTop;
        initialHeight = startHeight;
        initialStart = element.getAttribute('data-start');
        initialEnd = element.getAttribute('data-end');
        initialModified = element.getAttribute('data-modified') === 'true';

        if (e.target.classList.contains('resize-handle-top')) {
            dragMode = 'resize-top';
        } else if (e.target.classList.contains('resize-handle-bottom')) {
            dragMode = 'resize-bottom';
        } else {
            dragMode = 'move';
        }

        document.querySelectorAll('.time-block.checked').forEach(b => b.classList.remove('checked'));
        element.classList.add('checked');
        const currentDateStr = initialParent ? initialParent.dataset.id : '';
        syncFormWithEvent(
            id,
            currentDateStr,
            initialStart,
            initialEnd,
            element.getAttribute('data-type'),
            element.getAttribute('data-title'),
            element.getAttribute('data-description'),
            element.getAttribute('data-color'),
            element.getAttribute('data-background-color'),
            element.getAttribute('data-border-color')
        );

        e.stopPropagation();
    });

    element.addEventListener('pointermove', function (e) {
        if (!isPointerDown) return;

        const deltaY = e.clientY - startY;
        const pixelsPerMinute = 720 / 1440;

        if (dragMode === 'resize-top') {
            let newTop = startTop + deltaY;
            newTop = Math.max(5, Math.min(startTop + startHeight - 10, newTop));
            
            let startMinutes = Math.round((newTop - 5) / pixelsPerMinute);
            startMinutes = Math.round(startMinutes / 15) * 15;
            newTop = startMinutes * pixelsPerMinute + 5;

            const endMinutes = Math.round((startTop + startHeight - 5) / pixelsPerMinute);
            const durationMinutes = Math.max(15, endMinutes - startMinutes);
            const newHeight = durationMinutes * pixelsPerMinute;

            element.style.top = `${newTop}px`;
            element.style.height = `${newHeight}px`;

            const newStartStr = minutesToTimeString(startMinutes);
            const currentEndStr = element.getAttribute('data-end');

            element.setAttribute('data-start', newStartStr);
            element.setAttribute('data-modified', 'true');

            const timeLabel = element.querySelector('div');
            if (timeLabel) timeLabel.innerText = `${newStartStr} - ${currentEndStr}`;

            const currentDateStr = element.parentElement ? element.parentElement.dataset.id : '';
            syncFormWithEvent(id, currentDateStr, newStartStr, currentEndStr);

        } else if (dragMode === 'resize-bottom') {
            let newHeight = startHeight + deltaY;
            const startMinutes = Math.round((startTop - 5) / pixelsPerMinute);
            let durationMinutes = Math.round(newHeight / pixelsPerMinute);
            durationMinutes = Math.max(15, Math.round(durationMinutes / 15) * 15);
            newHeight = durationMinutes * pixelsPerMinute;

            element.style.height = `${newHeight}px`;

            const currentStartStr = element.getAttribute('data-start');
            const newEndMinutes = Math.min(1439, startMinutes + durationMinutes);
            const newEndStr = minutesToTimeString(newEndMinutes);

            element.setAttribute('data-end', newEndStr);
            element.setAttribute('data-modified', 'true');

            const timeLabel = element.querySelector('div');
            if (timeLabel) timeLabel.innerText = `${currentStartStr} - ${newEndStr}`;

            const currentDateStr = element.parentElement ? element.parentElement.dataset.id : '';
            syncFormWithEvent(id, currentDateStr, currentStartStr, newEndStr);

        } else if (dragMode === 'move') {
            let newTop = startTop + deltaY;
            newTop = Math.max(5, Math.min(715 - startHeight, newTop));

            let startMinutes = Math.round((newTop - 5) / pixelsPerMinute);
            startMinutes = Math.round(startMinutes / 15) * 15;
            newTop = startMinutes * pixelsPerMinute + 5;

            const durationMinutes = Math.round(startHeight / pixelsPerMinute);
            const newEndMinutes = Math.min(1439, startMinutes + durationMinutes);

            element.style.top = `${newTop}px`;

            const newStartStr = minutesToTimeString(startMinutes);
            const newEndStr = minutesToTimeString(newEndMinutes);

            element.setAttribute('data-start', newStartStr);
            element.setAttribute('data-end', newEndStr);
            element.setAttribute('data-modified', 'true');

            const timeLabel = element.querySelector('div');
            if (timeLabel) timeLabel.innerText = `${newStartStr} - ${newEndStr}`;

            element.style.pointerEvents = 'none';
            const hoverEl = document.elementFromPoint(e.clientX, e.clientY);
            element.style.pointerEvents = 'auto';

            if (hoverEl) {
                const targetColumn = hoverEl.closest('.calendar > .date:not(.weekday)');
                if (targetColumn && targetColumn.classList.contains('active') && targetColumn !== element.parentElement) {
                    targetColumn.appendChild(element);
                }
            }

            const currentDateStr = element.parentElement ? element.parentElement.dataset.id : '';
            syncFormWithEvent(id, currentDateStr, newStartStr, newEndStr);
        }
    });

    element.addEventListener('pointerup', function (e) {
        if (!isPointerDown) return;
        isPointerDown = false;
        try {
            element.releasePointerCapture(e.pointerId);
        } catch (err) {}

        const finalParent = element.parentElement;
        const finalTop = parseFloat(element.style.top) || 0;
        const finalHeight = parseFloat(element.style.height) || 30;
        const finalStart = element.getAttribute('data-start');
        const finalEnd = element.getAttribute('data-end');

        if (
            initialParent !== finalParent ||
            initialTop !== finalTop ||
            initialHeight !== finalHeight ||
            initialStart !== finalStart ||
            initialEnd !== finalEnd
        ) {
            pushUndoRecord({
                type: 'MOVE_OR_RESIZE',
                eventId: id,
                element: element,
                prev: {
                    parentColumn: initialParent,
                    top: initialTop,
                    height: initialHeight,
                    startTime: initialStart,
                    endTime: initialEnd,
                    modified: initialModified
                },
                next: {
                    parentColumn: finalParent,
                    top: finalTop,
                    height: finalHeight,
                    startTime: finalStart,
                    endTime: finalEnd,
                    modified: true
                }
            });
        }
    });
}

function addEvent(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    let date = $("#date").val();
    let startTime = $("#start-time").val();
    let endTime = $("#end-time").val();
    let type = $("#type").val();
    let title = $("#title").val();
    let description = $("#description").val();
    let color = $("#color").val() || '#000000';
    let backgroundColor = $("#background-color").val() || '#FFFFFF';
    let borderColor = $("#border-color").val() || '#3b82f6';

    if (!date || !startTime || !endTime) {
        showToast("請填入完整的日期、開始時間與結束時間", 'warning');
        return;
    }

    if (startTime >= endTime) {
        showToast("結束時間必須晚於開始時間", 'warning');
        return;
    }

    // 核心防呆阻擋（沒有它就絕對擋不下來）
    if (!type || type.trim() === '') {
        showToast("請選擇「行程類型」，此欄位為必填項目！", 'warning');
        return;
    }
    
    $.post("./api_add_event.php", {
        date, startTime, endTime, type, title, description, color, backgroundColor, borderColor
    }, (res) => {
        showToast(res.message || "成功新增一個行程", 'success');
        if (globalActiveCells) renderEventsToCalendar(globalActiveCells);
    }, "json").fail((xhr) => {
        let err = xhr.responseJSON ? xhr.responseJSON.message : "新增失敗";
        showToast("錯誤: " + err, 'error');
    });
}

function editEvent(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    let id = $("#id").val();
    let date = $("#date").val();
    let startTime = $("#start-time").val();
    let endTime = $("#end-time").val();
    let type = $("#type").val();
    let title = $("#title").val();
    let description = $("#description").val();
    let color = $("#color").val() || '#000000';
    let backgroundColor = $("#background-color").val() || '#FFFFFF';
    let borderColor = $("#border-color").val() || '#3b82f6';

    if (!id) {
        showToast("請先選擇要編輯的行程", 'warning');
        return;
    }
    if (!date || !startTime || !endTime) {
        showToast("請填入完整的日期、開始時間與結束時間", 'warning');
        return;
    }

    // 核心防呆阻擋（沒有它就絕對擋不下來）
    if (!type || type.trim() === '') {
        showToast("請選擇「行程類型」，此欄位為必填項目！", 'warning');
        return;
    }
    
    $.post("./api_edit_event.php", {
        id, date, startTime, endTime, type, title, description, color, backgroundColor, borderColor
    }, (res) => {
        showToast(res.message || "成功修改行程", 'success');

        // 若單獨點擊按鈕修改，清除該行程的 [已修改] 標籤
        const targetBlock = document.querySelector(`.time-block[data-event-id="${id}"]`);
        if (targetBlock) targetBlock.removeAttribute('data-modified');

        if (globalActiveCells) renderEventsToCalendar(globalActiveCells);
    }, "json").fail((xhr) => {
        let err = xhr.responseJSON ? xhr.responseJSON.message : "修改失敗";
        showToast("錯誤: " + err, 'error');
    });
}

function deleteEvent(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    let id = $("#id").val();

    if (!id) {
        showToast("需要先選擇一個行程", 'warning');
        return;
    }

    // 自訂 confirm：使用原生 confirm 保持簡潔，避免被誤刪
    if (!confirm("確定要刪除此行程嗎？此操作不可復原。")) return;

    $.post("./api_delete_event.php", { id }, (res) => {
        showToast(res.message || "成功刪除行程", 'success');
        $("#id").val("");
        if (globalActiveCells) renderEventsToCalendar(globalActiveCells);
    }, "json").fail((xhr) => {
        let err = xhr.responseJSON ? xhr.responseJSON.message : "刪除失敗";
        showToast("錯誤: " + err, 'error');
    });
}

function calculateDuration(){
    const start = document.getElementById("start-time").value;
    const end = document.getElementById("end-time").value;
    const duringInput = document.getElementById("during-time");

    if(!start || !end){
        duringInput.value = "";
        return;
    }

    const [startHour, startMinute] = start.split(":").map(Number);
    const [endHour, endMinute] = end.split(":").map(Number);

    let differenceMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);

    if(differenceMinutes < 0)differenceMinutes += 1440;

    const hour = Math.floor(differenceMinutes / 60);
    const minute = differenceMinutes % 60;

    duringInput.value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

document.getElementById("start-time").addEventListener("input", calculateDuration);
document.getElementById("end-time").addEventListener("input", calculateDuration);