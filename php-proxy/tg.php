<?php
// Telegram bot webhook:
// - /start и любые сообщения в личке → приветствие с кнопкой приложения
// - callback-кнопки «Одобрить/Отклонить» под заявками на вакансии
define('TG_BOT_TOKEN', getenv('TG_BOT_TOKEN') ?: '8718898225:AAEOUiK23gH_MKRnorhSFx5SDn8otcl2_ug');
define('SB_URL', 'https://bbiqmkeysalwdonlnylb.supabase.co');
define('SB_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJiaXFta2V5c2Fsd2RvbmxueWxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MTI5NTIsImV4cCI6MjA5MzM4ODk1Mn0.HHYjTdjdP6lN-GosNfGypts6Kg-2CYyoMPMTnLfdfJQ');

header('Content-Type: application/json; charset=utf-8');

// ── Supabase helpers ──────────────────────────────────────────────────────────

function sb(string $method, string $table, array $query = [], $body_data = null): array {
    $url = SB_URL . '/rest/v1/' . $table;
    if (!empty($query)) $url .= '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_HTTPHEADER     => [
            'apikey: ' . SB_KEY,
            'Authorization: Bearer ' . SB_KEY,
            'Content-Type: application/json',
            'Prefer: return=minimal',
        ],
        CURLOPT_TIMEOUT => 15,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    if ($body_data !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body_data));
    $resp = curl_exec($ch); curl_close($ch);
    $dec = json_decode($resp ?: '[]', true);
    return is_array($dec) ? $dec : [];
}

function sb_one(string $table, array $filters, string $select = '*'): ?array {
    $rows = sb('GET', $table, array_merge(['select' => $select, 'limit' => '1'], $filters));
    return !empty($rows) && isset($rows[0]) ? $rows[0] : null;
}

function uid(): string {
    return base_convert(time(), 10, 36) . substr(base_convert(mt_rand(), 10, 36), 2, 5);
}

function now_iso(): string {
    $ms = intval(microtime(true) * 1000) % 1000;
    return gmdate('Y-m-d\TH:i:s') . '.' . str_pad((string)$ms, 3, '0', STR_PAD_LEFT) . 'Z';
}

/** Создаёт чат работник↔директор по вакансии (или возвращает существующий) */
function ensure_chat(string $workerId, string $employerId, string $vacancyId, string $vacTitle, string $company, string $systemMsg): string {
    $ex = sb_one('jm_chats', ['vacancy_id' => 'eq.' . $vacancyId, 'worker_id' => 'eq.' . $workerId], 'id');
    if ($ex) return $ex['id'];
    $cid = uid();
    sb('POST', 'jm_chats', [], [
        'id' => $cid, 'vacancy_id' => $vacancyId, 'worker_id' => $workerId,
        'employer_id' => $employerId, 'vac_title' => $vacTitle, 'company_name' => $company,
        'unread_worker' => 1, 'unread_employer' => 0, 'created_at' => now_iso(),
    ]);
    sb('POST', 'jm_messages', [], [
        'id' => uid(), 'chat_id' => $cid, 'sender_id' => 'system',
        'text' => $systemMsg, 'created_at' => now_iso(),
    ]);
    return $cid;
}

// ── Telegram helpers ──────────────────────────────────────────────────────────

function tg(string $method, array $payload): array {
    $ch = curl_init('https://api.telegram.org/bot' . TG_BOT_TOKEN . '/' . $method);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_TIMEOUT => 10,
        CURLOPT_POSTFIELDS => json_encode($payload),
    ]);
    $resp = curl_exec($ch); curl_close($ch);
    $dec = json_decode($resp ?: 'null', true);
    return is_array($dec) ? $dec : [];
}

function expo_push_one(string $token, string $title, string $body): void {
    $ch = curl_init('https://exp.host/--/api/v2/push/send');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
        CURLOPT_TIMEOUT => 10,
        CURLOPT_POSTFIELDS => json_encode([
            'to' => $token, 'title' => $title, 'body' => $body,
            'sound' => 'default', 'priority' => 'high', 'channelId' => 'matches',
            'data' => ['type' => 'perm_status'],
        ]),
    ]);
    curl_exec($ch); curl_close($ch);
}

/** Уведомляет работника по всем доступным каналам */
function notify_worker(string $workerId, string $title, string $body): void {
    // Колокольчик — всегда
    sb('POST', 'jm_notifications', [], ['user_id' => $workerId, 'title' => $title, 'body' => $body]);
    $w = sb_one('jm_users', ['id' => 'eq.' . $workerId], 'telegram_id,push_token');
    if (!$w) return;
    if (!empty($w['telegram_id'])) {
        tg('sendMessage', [
            'chat_id' => (int)$w['telegram_id'],
            'text' => $title . "\n\n" . $body,
            'reply_markup' => ['inline_keyboard' => [[
                ['text' => '🚀 Открыть JobToo', 'url' => 'https://t.me/JobToo_bot/app'],
            ]]],
        ]);
    }
    if (!empty($w['push_token'])) {
        expo_push_one($w['push_token'], $title, $body);
    }
}

// ── Update parsing ────────────────────────────────────────────────────────────

$update = json_decode(file_get_contents('php://input'), true);
if (!is_array($update)) { echo json_encode(['ok' => true]); exit; }

// ── Callback-кнопки (Одобрить/Отклонить заявку) ──────────────────────────────

$cb = $update['callback_query'] ?? null;
if ($cb) {
    $data = (string)($cb['data'] ?? '');
    $cbId = $cb['id'] ?? '';
    $chatId = $cb['message']['chat']['id'] ?? null;
    $msgId = $cb['message']['message_id'] ?? null;
    $origText = $cb['message']['text'] ?? '';

    // «💬 Написать кандидату» — создаёт чат (без смены статуса заявки) и даёт кнопку в него
    if (preg_match('/^appmsg_(.+)$/', $data, $mm)) {
        $appId = $mm[1];
        $app = sb_one('jm_perm_applications', ['id' => 'eq.' . $appId], 'id,worker_id,employer_id,vacancy_id,status');
        if (!$app) {
            tg('answerCallbackQuery', ['callback_query_id' => $cbId, 'text' => 'Заявка не найдена']);
            echo json_encode(['ok' => true]); exit;
        }
        $vac = sb_one('jm_perm_vacancies', ['id' => 'eq.' . $app['vacancy_id']], 'title,company');
        $vTitle = $vac['title'] ?? 'вакансию';
        $chatId2 = ensure_chat(
            $app['worker_id'], $app['employer_id'] ?? '', $app['vacancy_id'],
            $vTitle, $vac['company'] ?? '',
            "💬 Директор хочет обсудить ваш отклик на «{$vTitle}». Напишите ему!"
        );
        // Кандидату — знать, что ему написали
        notify_worker($app['worker_id'],
            '💬 Директор написал вам',
            "По вашему отклику на «{$vTitle}» открыт чат — ответьте в разделе «Чаты»!");
        // Директору — кнопка прямо в чат
        if ($chatId) {
            tg('sendMessage', [
                'chat_id' => $chatId,
                'text' => "💬 Чат с кандидатом открыт — можно писать:",
                'reply_markup' => ['inline_keyboard' => [[
                    ['text' => '💬 Открыть чат', 'url' => 'https://t.me/JobToo_bot/app?startapp=chat_' . $chatId2],
                ]]],
            ]);
        }
        tg('answerCallbackQuery', ['callback_query_id' => $cbId, 'text' => 'Чат создан!']);
        echo json_encode(['ok' => true]); exit;
    }

    if (preg_match('/^app(ok|no)_(.+)$/', $data, $m)) {
        $approve = $m[1] === 'ok';
        $appId = $m[2];

        $app = sb_one('jm_perm_applications', ['id' => 'eq.' . $appId], 'id,worker_id,employer_id,vacancy_id,status');
        if (!$app) {
            tg('answerCallbackQuery', ['callback_query_id' => $cbId, 'text' => 'Заявка не найдена']);
            echo json_encode(['ok' => true]); exit;
        }

        if ($app['status'] !== 'pending') {
            tg('answerCallbackQuery', ['callback_query_id' => $cbId, 'text' => 'Уже обработана ранее']);
            echo json_encode(['ok' => true]); exit;
        }

        // Обновляем статус
        sb('PATCH', 'jm_perm_applications', ['id' => 'eq.' . $appId], ['status' => $approve ? 'approved' : 'rejected']);

        // Уведомляем работника (при одобрении — открываем чат, как делает приложение)
        $vac = sb_one('jm_perm_vacancies', ['id' => 'eq.' . $app['vacancy_id']], 'title,company');
        $vTitle = $vac['title'] ?? 'вакансию';
        if ($approve) {
            $employerId = $app['employer_id'] ?? '';
            if ($employerId !== '') {
                ensure_chat(
                    $app['worker_id'], $employerId, $app['vacancy_id'],
                    $vTitle, $vac['company'] ?? '',
                    "🎉 Поздравляем! Вы одобрены на вакансию «{$vTitle}». Свяжитесь с кандидатом для уточнения деталей."
                );
            }
            notify_worker($app['worker_id'],
                '✅ Заявка одобрена!',
                "Вашу заявку на «{$vTitle}» одобрили. Чат с директором уже открыт — напишите ему в разделе «Чаты»!");
        } else {
            notify_worker($app['worker_id'],
                'По заявке отказ',
                "По вакансии «{$vTitle}» вам отказали. Посмотрите другие открытые вакансии — их много!");
        }

        // Обновляем сообщение у директора
        $mark = $approve ? '✅ ВЫ ОДОБРИЛИ ЭТУ ЗАЯВКУ' : '❌ Вы отклонили эту заявку';
        if ($chatId && $msgId) {
            tg('editMessageText', [
                'chat_id' => $chatId,
                'message_id' => $msgId,
                'text' => $origText . "\n\n" . $mark,
                'reply_markup' => ['inline_keyboard' => [[
                    ['text' => '🚀 Открыть JobToo', 'url' => 'https://t.me/JobToo_bot/app'],
                ]]],
            ]);
        }
        tg('answerCallbackQuery', ['callback_query_id' => $cbId, 'text' => $approve ? 'Одобрено! Работник уведомлён' : 'Отклонено. Работник уведомлён']);
        echo json_encode(['ok' => true]); exit;
    }

    tg('answerCallbackQuery', ['callback_query_id' => $cbId]);
    echo json_encode(['ok' => true]); exit;
}

// ── Обычные сообщения в личке ────────────────────────────────────────────────

$msg = $update['message'] ?? null;
if (!$msg || empty($msg['chat']['id'])) { echo json_encode(['ok' => true]); exit; }

$chatId = (int)$msg['chat']['id'];
if (($msg['chat']['type'] ?? '') !== 'private') { echo json_encode(['ok' => true]); exit; }

// ─── Ожидающие привязки Telegram ─────────────────────────────────────────
// Ссылка вида t.me/bot?start=link_<id> доносит метку до бота только когда
// чат с ботом заводится впервые. Если человек уже писал боту раньше,
// Telegram открывает существующий чат, кнопки START нет, и уходит голый
// «/start» — привязать не к чему. Поэтому приложение перед переходом
// оставляет здесь заявку, а бот подхватывает её по голому «/start».
define('TG_PENDING_FILE', sys_get_temp_dir() . '/jobtoo_tg_pending.json');
const TG_PENDING_TTL = 900;   // 15 минут

function tg_pending_read(): array {
    if (!is_file(TG_PENDING_FILE)) return [];
    $raw = @file_get_contents(TG_PENDING_FILE);
    $all = $raw ? json_decode($raw, true) : [];
    if (!is_array($all)) return [];
    $now = time();
    return array_filter($all, fn($ts) => is_int($ts) && $now - $ts < TG_PENDING_TTL);
}

function tg_pending_write(array $all): void {
    @file_put_contents(TG_PENDING_FILE, json_encode($all), LOCK_EX);
}

$text = trim($msg['text'] ?? '');
$firstName = $msg['from']['first_name'] ?? '';

// ── Привязка аккаунта из приложения: /start link_<userId> ───────────────────
if (preg_match('/^\/start\s+link_([a-z0-9]+)$/i', $text, $lm)) {
    $userId = $lm[1];
    $u = sb_one('jm_users', ['id' => 'eq.' . $userId], 'id,first_name');
    if ($u) {
        // Один Telegram — один аккаунт: освобождаем этот telegram_id у других
        sb('PATCH', 'jm_users', ['telegram_id' => 'eq.' . $chatId], ['telegram_id' => null]);
        sb('PATCH', 'jm_users', ['id' => 'eq.' . $userId], ['telegram_id' => $chatId]);
        tg('sendMessage', [
            'chat_id' => $chatId,
            'text' => "✅ <b>Telegram подключён!</b>\n\nТеперь сюда будут приходить:\n⚡ новые смены и вакансии\n📥 ответы директоров на отклики\n💬 уведомления о сообщениях\n\nМожно вернуться в приложение 👌",
            'parse_mode' => 'HTML',
            'reply_markup' => ['inline_keyboard' => [[
                ['text' => '🚀 Открыть JobToo', 'url' => 'https://t.me/JobToo_bot/app'],
            ]]],
        ]);
    } else {
        tg('sendMessage', [
            'chat_id' => $chatId,
            'text' => 'Не удалось найти аккаунт для привязки. Откройте приложение и попробуйте ещё раз.',
        ]);
    }
    echo json_encode(['ok' => true]); exit;
}

// Голый «/start»: метка не дошла (чат с ботом уже существовал). Берём
// самую свежую заявку, оставленную приложением, и привязываем к ней.
if (preg_match('/^\/start\s*$/', $text)) {
    $pending = tg_pending_read();
    if (!empty($pending)) {
        arsort($pending);                       // самая свежая — первая
        $userId = (string)array_key_first($pending);
        $u = sb_one('jm_users', ['id' => 'eq.' . $userId], 'id,first_name');
        if ($u) {
            unset($pending[$userId]);
            tg_pending_write($pending);
            sb('PATCH', 'jm_users', ['telegram_id' => 'eq.' . $chatId], ['telegram_id' => null]);
            sb('PATCH', 'jm_users', ['id' => 'eq.' . $userId], ['telegram_id' => $chatId]);
            tg('sendMessage', [
                'chat_id' => $chatId,
                'text' => "✅ <b>Telegram подключён!</b>\n\nТеперь сюда будут приходить:\n⚡ новые смены и вакансии\n📥 ответы директоров на отклики\n💬 уведомления о сообщениях\n\nМожно вернуться в приложение 👌",
                'parse_mode' => 'HTML',
                'reply_markup' => ['inline_keyboard' => [[
                    ['text' => '🚀 Открыть JobToo', 'url' => 'https://t.me/JobToo_bot/app'],
                ]]],
            ]);
            echo json_encode(['ok' => true]); exit;
        }
    }
}

if (str_starts_with($text, '/start')) {
    $reply = "Привет" . ($firstName !== '' ? ", $firstName" : '') . "! 👋\n\n"
        . "<b>JobToo</b> — подработки и постоянные вакансии на складах Москвы.\n\n"
        . "⚡ Смены рядом с твоим метро\n"
        . "💼 Постоянная работа от проверенных директоров\n"
        . "💬 Отклик и чат с работодателем в два тапа\n\n"
        . "Открой приложение — без установки, прямо здесь 👇";
} else {
    $reply = "Все смены и вакансии — в приложении 👇";
}

tg('sendMessage', [
    'chat_id' => $chatId,
    'text' => $reply,
    'parse_mode' => 'HTML',
    'reply_markup' => ['inline_keyboard' => [[
        ['text' => '🚀 Открыть JobToo', 'url' => 'https://t.me/JobToo_bot/app'],
    ]]],
]);

echo json_encode(['ok' => true]);
