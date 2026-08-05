<?php
// Telegram bot webhook:
// - /start и любые сообщения в личке → приветствие с кнопкой приложения
// - callback-кнопки «Одобрить/Отклонить» под заявками на вакансии
define('SB_URL', 'https://bbiqmkeysalwdonlnylb.supabase.co');

// Секреты приложения — из окружения либо из файла app_secrets.php рядом
// (см. app_secrets.example.php). Та же функция есть в db.php: файлы на хостинг
// кладутся по отдельности, общий include лишний раз всё усложнил бы.
function jt_secret(string $name, string $fallback = ''): string {
    static $file = null;
    $env = getenv($name);
    if (is_string($env) && trim($env) !== '') return trim($env);

    if ($file === null) {
        $p = __DIR__ . '/app_secrets.php';
        $v = is_readable($p) ? @include $p : null;
        $file = is_array($v) ? $v : [];
    }
    if (!empty($file[$name])) return (string)$file[$name];

    return $fallback;
}

// Запасного значения тут нарочно нет. Прежний токен утёк вместе с открытым
// репозиторием, и посторонний переписывал боту описание на рекламу. Токен
// отозван и живёт только в GitHub Secrets (TG_BOT_TOKEN), откуда выкладка
// собирает app_secrets.php. Если он не задан — лучше явная тишина, чем
// работа на ключе, который знает чужой.
define('TG_BOT_TOKEN', jt_secret('TG_BOT_TOKEN'));

// Ключ доступа к базе — та же схема, что и в db.php: сервисный ключ с
// хостинга, анонимный лишь как запасной вариант. Подробности там же.

function sb_resolve_key(): string {
    $env = getenv('SB_SERVICE_KEY');
    if (is_string($env) && trim($env) !== '') return trim($env);

    $file = __DIR__ . '/sb_service_key.php';
    if (is_readable($file)) {
        $v = @include $file;
        if (is_string($v) && trim($v) !== '') return trim($v);
    }

    // Запасного ключа в коде больше нет. Прежний анонимный лежал здесь на
    // случай «чтобы ничего не легло» — но он же пережил бы смену ключей и
    // работал бы дальше втихую. Пусто — значит запросы честно упадут, и это
    // видно сразу, а не через месяц.
    return '';
}

define('SB_KEY', sb_resolve_key());

header('Content-Type: application/json; charset=utf-8');

// ── Supabase helpers ──────────────────────────────────────────────────────────

function sb(string $method, string $table, array $query = [], $body_data = null,
           string $prefer = 'return=minimal'): array {
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
            'Prefer: ' . $prefer,
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

// ── Настройки ────────────────────────────────────────────────────────────────
// Пока в них лежит одно: кому пересылать то, что люди пишут боту.

function setting_get(string $key): string {
    $row = sb_one('jm_settings', ['key' => 'eq.' . $key], 'value');
    return (string)($row['value'] ?? '');
}

function setting_set(string $key, string $value): void {
    sb('POST', 'jm_settings', ['on_conflict' => 'key'],
        [['key' => $key, 'value' => $value, 'updated_at' => now_iso()]],
        'return=minimal,resolution=merge-duplicates');
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
            $newChatId = '';
            if ($employerId !== '') {
                // Кнопкой в телеграме директор написать не может, поэтому первый
                // ход прямо отдаём работнику. Прежний текст «свяжитесь с
                // кандидатом» уходил обоим сразу, и оба ждали друг друга: в
                // переписке так и оставалось два системных сообщения.
                $newChatId = ensure_chat(
                    $app['worker_id'], $employerId, $app['vacancy_id'],
                    $vTitle, $vac['company'] ?? '',
                    "✅ Вас одобрили на вакансию «{$vTitle}». Напишите директору первым: когда сможете выйти и какой у вас опыт."
                );
            }
            notify_worker($app['worker_id'],
                '✅ Заявка одобрена!',
                "Вашу заявку на «{$vTitle}» одобрили. Откройте чат и напишите директору — он ждёт вашего сообщения.");
            if ($chatId && $newChatId !== '') {
                tg('sendMessage', [
                    'chat_id' => $chatId,
                    'text' => "💬 Чат с кандидатом открыт. Напишите ему первым — так договоритесь быстрее.",
                    'reply_markup' => ['inline_keyboard' => [[
                        ['text' => '💬 Открыть чат', 'url' => 'https://t.me/JobToo_bot/app?startapp=chat_' . $newChatId],
                    ]]],
                ]);
            }
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
    tg('sendMessage', [
        'chat_id' => $chatId,
        'text' => "Привет" . ($firstName !== '' ? ", $firstName" : '') . "! 👋\n\n"
            . "<b>JobToo</b> — подработки и постоянные вакансии на складах Москвы.\n\n"
            . "⚡ Смены рядом с твоим метро\n"
            . "💼 Постоянная работа от проверенных директоров\n"
            . "💬 Отклик и чат с работодателем в два тапа\n\n"
            . "Открой приложение — без установки, прямо здесь 👇",
        'parse_mode' => 'HTML',
        'reply_markup' => ['inline_keyboard' => [[
            ['text' => '🚀 Открыть JobToo', 'url' => 'https://t.me/JobToo_bot/app'],
        ]]],
    ]);
    echo json_encode(['ok' => true]); exit;
}

// ── Живые сообщения боту ─────────────────────────────────────────────────────
//
// Раньше на любое человеческое сообщение бот отвечал «Все смены и вакансии —
// в приложении 👇» и выбрасывал его. Мы даже не знали, сколько людей нам
// писали: следов не оставалось.
//
// Всплыло, когда понадобилось спросить работников, почему они заходят и не
// откликаются. Спрашивать через бота было бессмысленно — ответы утекали бы
// в никуда.

$adminChat = (int)setting_get('admin_chat_id');

// Кому пересылать. Один раз: первый, кто скажет боту это слово, и становится
// адресатом. Переназначить можно через прокси (fn botAdminSet) — то есть
// зная X-App-Secret, а не угадав команду.
if (preg_match('/^\/admin$/i', $text)) {
    if ($adminChat === 0) {
        setting_set('admin_chat_id', (string)$chatId);
        tg('sendMessage', ['chat_id' => $chatId,
            'text' => "✅ Готово. Сюда будут приходить сообщения, которые люди пишут боту.\n\n"
                    . "Чтобы ответить — просто ответьте (reply) на пересланное сообщение, "
                    . "и человек получит ваш текст от бота."]);
    } else {
        tg('sendMessage', ['chat_id' => $chatId,
            'text' => $chatId === $adminChat
                ? 'Вы уже назначены получателем.'
                : 'Получатель уже назначен.']);
    }
    echo json_encode(['ok' => true]); exit;
}

// Ответ администратора реплаем на пересланное — доносим человеку. Адрес
// зашит в самом пересланном сообщении меткой #w<id>: держать переписку
// в памяти негде, а реплай её и так помнит.
if ($adminChat !== 0 && $chatId === $adminChat && $text !== '') {
    $src = (string)($msg['reply_to_message']['text'] ?? '');
    if ($src !== '' && preg_match('/#w(\d+)/', $src, $rm)) {
        $to = (int)$rm[1];
        $ok = tg('sendMessage', ['chat_id' => $to, 'text' => $text]);
        tg('sendMessage', ['chat_id' => $chatId,
            'text' => ($ok['ok'] ?? false) ? '✅ Отправлено' : '⚠️ Не доставлено']);
        sb('PATCH', 'jm_bot_messages', ['telegram_id' => 'eq.' . $to, 'answered' => 'is.false'],
            ['answered' => true]);
        echo json_encode(['ok' => true]); exit;
    }
}

// Всё остальное — сохраняем и пересылаем.
if ($text !== '' && $chatId !== $adminChat) {
    $u = sb_one('jm_users', ['telegram_id' => 'eq.' . $chatId],
        'id,first_name,last_name,phone,role,metro_station');
    sb('POST', 'jm_bot_messages', [], [
        'id' => uid(),
        'user_id' => $u['id'] ?? null,
        'telegram_id' => $chatId,
        'name' => trim(($u['first_name'] ?? $firstName) . ' ' . ($u['last_name'] ?? '')),
        'username' => $msg['from']['username'] ?? null,
        'text' => $text,
        'created_at' => now_iso(),
    ]);

    if ($adminChat !== 0) {
        $who = trim(($u['first_name'] ?? '') . ' ' . ($u['last_name'] ?? '')) ?: $firstName ?: 'Без имени';
        $meta = array_filter([
            $u['role'] ?? null,
            $u['phone'] ?? null,
            $u['metro_station'] ?? null,
        ]);
        tg('sendMessage', [
            'chat_id' => $adminChat,
            'text' => "📩 <b>" . htmlspecialchars($who, ENT_QUOTES, 'UTF-8') . "</b>"
                . ($meta ? "\n" . htmlspecialchars(implode(' · ', $meta), ENT_QUOTES, 'UTF-8') : '')
                . "\n\n" . htmlspecialchars($text, ENT_QUOTES, 'UTF-8')
                . "\n\n<i>Ответьте на это сообщение — человек получит ваш текст.</i> #w{$chatId}",
            'parse_mode' => 'HTML',
        ]);
    }

    // Человеку — что его услышали. Обещать ответ можно: сообщение лежит в
    // ящике и пришло живому человеку, а не в пустоту, как раньше.
    tg('sendMessage', ['chat_id' => $chatId,
        'text' => 'Спасибо, получили — ответим здесь же.']);
    echo json_encode(['ok' => true]); exit;
}

tg('sendMessage', [
    'chat_id' => $chatId,
    'text' => 'Все смены и вакансии — в приложении 👇',
    'reply_markup' => ['inline_keyboard' => [[
        ['text' => '🚀 Открыть JobToo', 'url' => 'https://t.me/JobToo_bot/app'],
    ]]],
]);

echo json_encode(['ok' => true]);
