<?php
define('SB_URL', 'https://bbiqmkeysalwdonlnylb.supabase.co');
define('SB_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJiaXFta2V5c2Fsd2RvbmxueWxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MTI5NTIsImV4cCI6MjA5MzM4ODk1Mn0.HHYjTdjdP6lN-GosNfGypts6Kg-2CYyoMPMTnLfdfJQ');

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-App-Secret');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405); echo json_encode(['error' => 'Method not allowed']); exit;
}

$secret = getenv('APP_SECRET') ?: 'ebb565bbbe600d111d88ad03b4d2e1731ebf9055d1dfd9bb147af91a6597d5f6';
$provided = $_SERVER['HTTP_X_APP_SECRET'] ?? '';
if (!hash_equals($secret, $provided)) {
    http_response_code(403); echo json_encode(['error' => 'Forbidden']); exit;
}

$body = json_decode(file_get_contents('php://input'), true);
$fn   = $body['fn'] ?? null;
$args = $body['args'] ?? [];

if (!$fn) { http_response_code(400); echo json_encode(['error' => 'Missing fn']); exit; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
    return base_convert(time(), 10, 36) . substr(base_convert(mt_rand(), 10, 36), 2, 5);
}

function now_iso(): string {
    $ms = intval(microtime(true) * 1000) % 1000;
    return gmdate('Y-m-d\TH:i:s') . '.' . str_pad((string)$ms, 3, '0', STR_PAD_LEFT) . 'Z';
}

function sb(string $method, string $table, array $query = [], $body_data = null, array $extra_hdrs = []): array {
    $url = SB_URL . '/rest/v1/' . $table;
    if (!empty($query)) $url .= '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
    $hdrs = [
        'apikey: ' . SB_KEY,
        'Authorization: Bearer ' . SB_KEY,
        'Content-Type: application/json',
    ];
    foreach ($extra_hdrs as $h) $hdrs[] = $h;
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_HTTPHEADER     => $hdrs,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    if ($body_data !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body_data));
    $resp = curl_exec($ch); $err = curl_error($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($err) throw new RuntimeException('curl: ' . $err);
    $dec = json_decode($resp ?: '[]', true);
    if ($code >= 400 && is_array($dec) && isset($dec['message'])) throw new RuntimeException($dec['message']);
    return is_array($dec) ? $dec : [];
}

function sb_select(string $t, array $f = [], string $sel = '*', ?string $ord = null): array {
    $q = array_merge(['select' => $sel], $f);
    if ($ord) $q['order'] = $ord;
    return sb('GET', $t, $q);
}

// Supabase режет выборку до 1000 строк — для агрегатов тянем всё постранично
function sb_select_all(string $t, array $f = [], string $sel = '*'): array {
    $all = []; $page = 1000; $off = 0;
    while (true) {
        $q = array_merge(['select' => $sel, 'limit' => (string)$page, 'offset' => (string)$off], $f);
        $rows = sb('GET', $t, $q);
        foreach ($rows as $r) $all[] = $r;
        if (count($rows) < $page) break;
        $off += $page;
    }
    return $all;
}

function sb_single(string $t, array $f = [], string $sel = '*'): ?array {
    $rows = sb_select($t, array_merge($f, ['limit' => '1']), $sel);
    return !empty($rows) ? $rows[0] : null;
}

function sb_insert(string $t, array $data, bool $ret = false): array {
    return sb('POST', $t, [], $data, [$ret ? 'Prefer: return=representation' : 'Prefer: return=minimal']);
}

function sb_upsert(string $t, array $data, string $conflict = '', bool $ret = false): array {
    $pref = 'resolution=merge-duplicates,return=' . ($ret ? 'representation' : 'minimal');
    $q = $conflict ? ['on_conflict' => $conflict] : [];
    return sb('POST', $t, $q, $data, ['Prefer: ' . $pref]);
}

function sb_update(string $t, array $f, array $data): void {
    sb('PATCH', $t, $f, $data, ['Prefer: return=minimal']);
}

function sb_delete(string $t, array $f): void {
    sb('DELETE', $t, $f);
}

function sb_rpc(string $fn, array $params = []): mixed {
    $url = SB_URL . '/rest/v1/rpc/' . $fn;
    $hdrs = ['apikey: ' . SB_KEY, 'Authorization: Bearer ' . SB_KEY, 'Content-Type: application/json'];
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_HTTPHEADER => $hdrs, CURLOPT_TIMEOUT => 10, CURLOPT_SSL_VERIFYPEER => true]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($params));
    $resp = curl_exec($ch); curl_close($ch);
    return json_decode($resp ?: 'null', true);
}

// ─── Telegram Mini App ────────────────────────────────────────────────────────

define('TG_BOT_TOKEN', getenv('TG_BOT_TOKEN') ?: '8718898225:AAEOUiK23gH_MKRnorhSFx5SDn8otcl2_ug');
define('DASHBOARD_URL', getenv('DASHBOARD_URL') ?: 'https://dashboard-nujus-projects.vercel.app');
define('TG_GROUP_CHAT_ID', (int)(getenv('TG_GROUP_CHAT_ID') ?: -1001709270025)); // группа «ПОДРАБОТКИ»

/**
 * Validates Telegram WebApp initData signature (HMAC per official spec).
 * Returns ['user' => [...], 'params' => [...]] or null if invalid/expired.
 */
function tg_validate_init_data(string $initData): ?array {
    if (TG_BOT_TOKEN === '' || $initData === '') return null;
    parse_str($initData, $params);
    $hash = $params['hash'] ?? '';
    if (!$hash) return null;
    unset($params['hash']);
    ksort($params);
    $pairs = [];
    foreach ($params as $k => $v) $pairs[] = $k . '=' . $v;
    $dataCheckString = implode("\n", $pairs);
    $secretKey = hash_hmac('sha256', TG_BOT_TOKEN, 'WebAppData', true);
    $calc = bin2hex(hash_hmac('sha256', $dataCheckString, $secretKey, true));
    if (!hash_equals($calc, $hash)) return null;
    // Reject init data older than 24 hours
    if (isset($params['auth_date']) && (time() - (int)$params['auth_date']) > 86400) return null;
    $user = isset($params['user']) ? json_decode($params['user'], true) : null;
    return ['user' => is_array($user) ? $user : null, 'params' => $params];
}

/**
 * Sends a message to a Telegram user via Bot API. Never throws.
 * $withAppButton: true — кнопка на главную мини-аппа; string — свой URL кнопки.
 */
function tg_send_message(int $chatId, string $text, bool|string $withAppButton = false): bool {
    if (TG_BOT_TOKEN === '') return false;
    $payload = [
        'chat_id' => $chatId,
        'text' => $text,
        'parse_mode' => 'HTML',
        'disable_web_page_preview' => true,
    ];
    if ($withAppButton !== false) {
        $url = is_string($withAppButton) ? $withAppButton : 'https://t.me/JobToo_bot/app';
        $payload['reply_markup'] = ['inline_keyboard' => [[
            ['text' => '🚀 Откликнуться в JobToo', 'url' => $url],
        ]]];
    }
    $ch = curl_init('https://api.telegram.org/bot' . TG_BOT_TOKEN . '/sendMessage');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_TIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_POSTFIELDS => json_encode($payload),
    ]);
    $resp = curl_exec($ch); curl_close($ch);
    $dec = json_decode($resp ?: 'null', true);
    return is_array($dec) && ($dec['ok'] ?? false) === true;
}

/** Sends Expo push messages in batches of 100. Never throws. */
function expo_push(array $messages): void {
    for ($i = 0; $i < count($messages); $i += 100) {
        $chunk = array_slice($messages, $i, 100);
        $ch = curl_init('https://exp.host/--/api/v2/push/send');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode(count($chunk) === 1 ? $chunk[0] : $chunk),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
            CURLOPT_TIMEOUT => 15,
        ]);
        curl_exec($ch); curl_close($ch);
    }
}

/**
 * Broadcasts a new-job notification to ALL workers:
 * Expo push to everyone with a push token + Telegram message (with app button)
 * to everyone with a linked telegram_id.
 */
function broadcast_workers(string $title, string $body, string $tgHtml, string $dataType, bool|string $btnUrl = true): array {
    $withPush = sb_select('jm_users', ['role' => 'eq.worker', 'push_token' => 'not.is.null'], 'push_token');
    $msgs = array_map(fn($w) => [
        'to' => $w['push_token'], 'title' => $title, 'body' => $body,
        'sound' => 'default', 'priority' => 'high',
        'channelId' => 'vacancies', 'data' => ['type' => $dataType],
    ], $withPush);
    expo_push($msgs);

    $withTg = sb_select('jm_users', ['role' => 'eq.worker', 'telegram_id' => 'not.is.null'], 'telegram_id');
    $tgOk = 0;
    foreach ($withTg as $w) {
        if (tg_send_message((int)$w['telegram_id'], $tgHtml, $btnUrl)) $tgOk++;
    }

    // In-app bell (jm_notifications) — for EVERY worker, so the announcement
    // is visible in the app even without a push token or linked Telegram
    $all = sb_select('jm_users', ['role' => 'eq.worker'], 'id');
    $rows = array_map(fn($w) => ['user_id' => $w['id'], 'title' => $title, 'body' => $body], $all);
    if (!empty($rows)) {
        try { sb_insert('jm_notifications', $rows); } catch (Throwable $e) {}
    }

    // Web push (PWA users) — sent through the dashboard's VAPID endpoint
    $webOk = 0;
    try {
        $workerIds = array_flip(array_column($all, 'id'));
        $subs = sb_select('jm_web_push_subscriptions', [], 'user_id,endpoint,p256dh,auth');
        $appSecret = getenv('APP_SECRET') ?: 'ebb565bbbe600d111d88ad03b4d2e1731ebf9055d1dfd9bb147af91a6597d5f6';
        foreach ($subs as $s) {
            if (!isset($workerIds[$s['user_id']]) || empty($s['endpoint'])) continue;
            $ch = curl_init(DASHBOARD_URL . '/api/webpush/send');
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
                CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'x-app-secret: ' . $appSecret],
                CURLOPT_TIMEOUT => 6,
                CURLOPT_POSTFIELDS => json_encode([
                    'subscription' => [
                        'endpoint' => $s['endpoint'],
                        'keys' => ['p256dh' => $s['p256dh'], 'auth' => $s['auth']],
                    ],
                    'title' => $title,
                    'body' => $body,
                    'data' => ['type' => $dataType],
                ]),
            ]);
            $resp = curl_exec($ch); curl_close($ch);
            $dec = json_decode($resp ?: 'null', true);
            if (is_array($dec) && ($dec['ok'] ?? false)) $webOk++;
        }
    } catch (Throwable $e) {}

    return ['push' => count($msgs), 'telegram' => $tgOk, 'bell' => count($rows), 'webpush' => $webOk];
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────
try {
    $data = null;

    switch ($fn) {

        // ── Users ──────────────────────────────────────────────────────────────
        case 'dbGetUserById':
            $data = sb_single('jm_users', ['id' => 'eq.' . $args[0]]); break;

        case 'dbGetUsers':
            $data = sb_select('jm_users', [], '*', 'created_at.asc'); break;

        case 'dbUpsertUser':
            sb_upsert('jm_users', $args[0], 'id'); break;

        case 'dbWarmup':
            $data = true; break;

        case 'dbDeleteUser':
            sb_delete('jm_users', ['id' => 'eq.' . $args[0]]); break;

        case 'dbCheckPhoneExists':
            $data = sb_single('jm_users', ['phone' => 'eq.' . $args[0]], 'id') !== null; break;

        case 'dbGetUserByPhone':
            $data = sb_single('jm_users', ['phone' => 'eq.' . $args[0]]); break;

        // ── Telegram Mini App ──────────────────────────────────────────────────
        // args: [initDataString] → { ok, user|null, tg: {id, first_name, ...} }
        case 'tgAuth': {
            $v = tg_validate_init_data($args[0] ?? '');
            if (!$v || empty($v['user']['id'])) { $data = ['ok' => false]; break; }
            $tgId = (int)$v['user']['id'];
            $u = sb_single('jm_users', ['telegram_id' => 'eq.' . $tgId]);
            $data = [
                'ok' => true,
                'user' => $u,
                'tg' => [
                    'id' => $tgId,
                    'first_name' => $v['user']['first_name'] ?? '',
                    'last_name' => $v['user']['last_name'] ?? '',
                    'username' => $v['user']['username'] ?? '',
                ],
            ];
            break;
        }

        // args: [userId, initDataString] — link a Telegram account to a user
        case 'tgBindTelegram': {
            $v = tg_validate_init_data($args[1] ?? '');
            if (!$v || empty($v['user']['id'])) { $data = false; break; }
            sb_update('jm_users', ['id' => 'eq.' . $args[0]], ['telegram_id' => (int)$v['user']['id']]);
            $data = true;
            break;
        }

        // args: [employerId, workerId, vacancyId, vacancyTitle]
        // Директору в Telegram: карточка кандидата + кнопки Одобрить/Отклонить
        case 'tgNotifyNewApplication': {
            [$employerId, $workerId, $vacancyId, $vTitle] = [$args[0], $args[1], $args[2], (string)($args[3] ?? '')];
            $emp = sb_single('jm_users', ['id' => 'eq.' . $employerId], 'telegram_id');
            if (!$emp || empty($emp['telegram_id'])) { $data = false; break; }

            $app = sb_single('jm_perm_applications', [
                'vacancy_id' => 'eq.' . $vacancyId,
                'worker_id'  => 'eq.' . $workerId,
                'order'      => 'created_at.desc',
            ], 'id');
            if (!$app) { $data = false; break; }

            $w = sb_single('jm_users', ['id' => 'eq.' . $workerId], 'first_name,last_name,age,metro_station,phone,avg_rating,rating_count');
            $name = trim(($w['first_name'] ?? '') . ' ' . ($w['last_name'] ?? '')) ?: 'Кандидат';
            $lines = ["📥 <b>Новая заявка на «{$vTitle}»</b>", ''];
            $lines[] = '👤 ' . $name . (!empty($w['age']) ? ", {$w['age']} лет" : '');
            if (!empty($w['metro_station'])) $lines[] = '🚇 м. ' . $w['metro_station'];
            if (!empty($w['avg_rating']) && (float)$w['avg_rating'] > 0) {
                $lines[] = '⭐ Рейтинг ' . $w['avg_rating'] . (!empty($w['rating_count']) ? " ({$w['rating_count']} оценок)" : '');
            }
            if (!empty($w['phone'])) $lines[] = '📞 +' . ltrim($w['phone'], '+');
            $lines[] = '';
            $lines[] = 'Решите прямо здесь — работник сразу узнает:';

            $ch = curl_init('https://api.telegram.org/bot' . TG_BOT_TOKEN . '/sendMessage');
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
                CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
                CURLOPT_TIMEOUT => 10,
                CURLOPT_POSTFIELDS => json_encode([
                    'chat_id' => (int)$emp['telegram_id'],
                    'text' => implode("\n", $lines),
                    'parse_mode' => 'HTML',
                    'reply_markup' => ['inline_keyboard' => [
                        [
                            ['text' => '✅ Одобрить', 'callback_data' => 'appok_' . $app['id']],
                            ['text' => '❌ Отклонить', 'callback_data' => 'appno_' . $app['id']],
                        ],
                        [['text' => '💬 Написать кандидату', 'callback_data' => 'appmsg_' . $app['id']]],
                        [['text' => '👤 Открыть в JobToo', 'url' => 'https://t.me/JobToo_bot/app']],
                    ]],
                ]),
            ]);
            $resp = curl_exec($ch); curl_close($ch);
            $dec = json_decode($resp ?: 'null', true);
            $data = is_array($dec) && ($dec['ok'] ?? false);
            break;
        }

        // Ежедневные авто-касания (вызывается кроном раз в день):
        // 1) напоминания директорам о необработанных заявках (каждый день)
        // 2) «разместите смену/вакансию» директорам (раз в 3 дня)
        // 3) «посмотрите новые смены» работникам (раз в 3 дня, со сдвигом)
        case 'cronEveningDigest': {
            // Вечерний дайджест смен на завтра в группу «ПОДРАБОТКИ».
            // Спящее условие: постим только когда на завтра 3+ открытых смены от 2+ лавок.
            $tomorrowMsk = gmdate('Y-m-d', time() + 3 * 3600 + 86400);
            $rows = sb_select('jm_vacancies', ['status' => 'eq.open', 'date' => 'eq.' . $tomorrowMsk],
                'id,employer_id,title,metro_station,time_start,time_end,salary');
            $emps = [];
            foreach ($rows as $r) if (!empty($r['employer_id'])) $emps[$r['employer_id']] = true;
            $data = ['posted' => false, 'shifts' => count($rows), 'lavkas' => count($emps)];
            if (count($rows) >= 3 && count($emps) >= 2) {
                $lines = [];
                foreach (array_slice($rows, 0, 10) as $r) {
                    $sal = ((float)($r['salary'] ?? 0)) > 0
                        ? number_format((float)$r['salary'], 0, ',', ' ') . ' ₽'
                        : 'сдельные нормативы';
                    $lines[] = "• {$r['title']} · м. {$r['metro_station']} · {$r['time_start']}–{$r['time_end']} · {$sal}";
                }
                $more = count($rows) > 10 ? "\n…и ещё " . (count($rows) - 10) : '';
                $txt = "⚡ <b>Смены на завтра</b> — " . count($rows) . " в " . count($emps) . " лавках:\n\n"
                    . implode("\n", $lines) . $more
                    . "\n\nОткликнись первым — прямо в Телеграме 👇";
                tg_send_message((int)TG_GROUP_CHAT_ID, $txt, true);
                $data['posted'] = true;
            }
            break;
        }

        case 'cronDailyNudges': {
            @set_time_limit(300);
            @ignore_user_abort(true);
            $result = ['pendingReminders' => 0, 'employerNudges' => 0, 'workerNudges' => 0];
            $dayIdx = (int)date('z');

            // ── 1. Необработанные заявки старше 24 часов ──
            $cut24 = gmdate('Y-m-d\TH:i:s\Z', time() - 86400);
            $pending = sb_select('jm_perm_applications', [
                'status' => 'eq.pending',
                'created_at' => 'lt.' . $cut24,
            ], 'employer_id');
            $byEmp = [];
            foreach ($pending as $p) {
                if (!empty($p['employer_id'])) $byEmp[$p['employer_id']] = ($byEmp[$p['employer_id']] ?? 0) + 1;
            }
            foreach ($byEmp as $eid => $cnt) {
                $emp = sb_single('jm_users', ['id' => 'eq.' . $eid], 'telegram_id,push_token');
                $title = '⏳ Кандидаты ждут ответа';
                $body = "У вас {$cnt} " . ($cnt === 1 ? 'необработанная заявка' : 'необработанных заявок')
                    . ' на вакансии. Ответьте — иначе кандидаты уйдут к другим.';
                sb_insert('jm_notifications', ['user_id' => $eid, 'title' => $title, 'body' => $body]);
                if ($emp && !empty($emp['telegram_id'])) {
                    tg_send_message((int)$emp['telegram_id'], $title . "\n\n" . $body, true);
                } elseif ($emp && !empty($emp['push_token'])) {
                    expo_push([[ 'to' => $emp['push_token'], 'title' => $title, 'body' => $body,
                        'sound' => 'default', 'priority' => 'high', 'channelId' => 'matches', 'data' => ['type' => 'pending_apps'] ]]);
                }
                $result['pendingReminders']++;
            }

            // ── 0. Понедельник: сезонная сводка владельцу в Telegram ──
            if ((int)date('N') === 1) {
                $cutW = gmdate('Y-m-d\TH:i:s\Z', time() - 7 * 86400);
                $shiftMatches = count(sb_select('jm_likes', ['is_match' => 'eq.true', 'created_at' => 'gte.' . $cutW], 'id'));
                $permApproved = count(sb_select('jm_perm_applications', ['status' => 'eq.approved', 'created_at' => 'gte.' . $cutW], 'id'));
                $wtv = sb_select('jm_vacancies', ['created_at' => 'gte.' . $cutW], 'employer_id');
                $wpv = sb_select('jm_perm_vacancies', ['created_at' => 'gte.' . $cutW], 'employer_id');
                $wPubs = [];
                foreach (array_merge($wtv, $wpv) as $r) if (!empty($r['employer_id'])) $wPubs[$r['employer_id']] = true;
                $tgTotal = count(sb_select_all('jm_users', ['telegram_id' => 'not.is.null'], 'id'));
                $newWorkers = count(sb_select('jm_users', ['role' => 'eq.worker', 'created_at' => 'gte.' . $cutW], 'id'));
                $newApps = count(sb_select('jm_perm_applications', ['created_at' => 'gte.' . $cutW], 'id'));
                $matches = $shiftMatches + $permApproved;
                $sum = "📊 <b>JobToo — сводка за неделю</b>\n\n"
                    . "🤝 Мэтчей: <b>{$matches}</b> (цель 15) — смены {$shiftMatches}, вакансии {$permApproved}\n"
                    . "📦 Публиковали: <b>" . count($wPubs) . "</b> директоров (цель 15)\n"
                    . "📨 Новых откликов: {$newApps}\n"
                    . "✈️ Telegram привязан: {$tgTotal} чел (всего)\n"
                    . "🆕 Новых работников за неделю: {$newWorkers}";
                tg_send_message(1172082720, $sum, false);
                $result['weeklySummary'] = true;
            }

            // ── 1б. Авто-отклонение заявок, висящих без ответа 7+ дней ──
            $cut7d = gmdate('Y-m-d\TH:i:s\Z', time() - 7 * 86400);
            $stale = sb_select('jm_perm_applications', [
                'status' => 'eq.pending',
                'created_at' => 'lt.' . $cut7d,
            ], 'id,worker_id,vacancy_id');
            $result['autoRejected'] = 0;
            foreach ($stale as $srow) {
                sb_update('jm_perm_applications', ['id' => 'eq.' . $srow['id']], ['status' => 'rejected']);
                $vac = sb_single('jm_perm_vacancies', ['id' => 'eq.' . $srow['vacancy_id']], 'title');
                $vt = $vac ? $vac['title'] : 'вакансию';
                $wTitle = 'Отклик закрыт без ответа';
                $wBody = "Директор не ответил на ваш отклик на «{$vt}» за 7 дней. "
                    . 'Не ждите — посмотрите другие вакансии и смены рядом, отклик в два тапа.';
                sb_insert('jm_notifications', ['user_id' => $srow['worker_id'], 'title' => $wTitle, 'body' => $wBody]);
                $wu = sb_single('jm_users', ['id' => 'eq.' . $srow['worker_id']], 'telegram_id,push_token');
                if ($wu && !empty($wu['telegram_id'])) {
                    tg_send_message((int)$wu['telegram_id'], $wTitle . "\n\n" . $wBody, true);
                } elseif ($wu && !empty($wu['push_token'])) {
                    expo_push([[ 'to' => $wu['push_token'], 'title' => $wTitle, 'body' => $wBody,
                        'sound' => 'default', 'priority' => 'default', 'channelId' => 'matches', 'data' => ['type' => 'app_auto_rejected'] ]]);
                }
                $result['autoRejected']++;
            }

            // ── 1в. То же для откликов на смены: 7+ дней без решения директора ──
            $staleLikes = sb_select('jm_likes', [
                'worker_liked' => 'eq.true',
                'is_match' => 'eq.false',
                'employer_liked' => 'is.null',
                'created_at' => 'lt.' . $cut7d,
            ], 'id,worker_id,vacancy_id');
            $result['autoRejectedShifts'] = 0;
            foreach ($staleLikes as $lrow) {
                sb_update('jm_likes', ['id' => 'eq.' . $lrow['id']], ['employer_liked' => false]);
                $svac = sb_single('jm_vacancies', ['id' => 'eq.' . $lrow['vacancy_id']], 'title');
                $st = $svac ? $svac['title'] : 'смену';
                $wTitle = 'Отклик закрыт без ответа';
                $wBody = "Директор не ответил на ваш отклик на смену «{$st}» за 7 дней. "
                    . 'Посмотрите свежие смены рядом — отклик в два тапа.';
                sb_insert('jm_notifications', ['user_id' => $lrow['worker_id'], 'title' => $wTitle, 'body' => $wBody]);
                $result['autoRejectedShifts']++;
            }

            // ── 2. Директорам: пора размещать (раз в 3 дня) ──
            if ($dayIdx % 3 === 0) {
                $cut3d = gmdate('Y-m-d\TH:i:s\Z', time() - 3 * 86400);
                $employers = sb_select('jm_users', ['role' => 'eq.employer'], 'id,telegram_id,push_token');
                $recentTv = sb_select('jm_vacancies', ['created_at' => 'gte.' . $cut3d], 'employer_id');
                $recentPv = sb_select('jm_perm_vacancies', ['created_at' => 'gte.' . $cut3d], 'employer_id');
                $recentPosters = [];
                foreach (array_merge($recentTv, $recentPv) as $r) $recentPosters[$r['employer_id']] = true;
                $workersCnt = count(sb_select('jm_users', ['role' => 'eq.worker'], 'id'));

                $title = '👷 Работники ждут смен';
                $body = "В JobToo {$workersCnt}+ работников готовы выйти. Разместите смену или вакансию — отклики придут в тот же день.";
                foreach ($employers as $e) {
                    if (isset($recentPosters[$e['id']])) continue; // недавно публиковал — не трогаем
                    sb_insert('jm_notifications', ['user_id' => $e['id'], 'title' => $title, 'body' => $body]);
                    if (!empty($e['telegram_id'])) {
                        tg_send_message((int)$e['telegram_id'], $title . "\n\n" . $body, true);
                    } elseif (!empty($e['push_token'])) {
                        expo_push([[ 'to' => $e['push_token'], 'title' => $title, 'body' => $body,
                            'sound' => 'default', 'priority' => 'default', 'channelId' => 'default', 'data' => ['type' => 'post_nudge'] ]]);
                    }
                    $result['employerNudges']++;
                }
            }

            // ── 3. Работникам: посмотрите, что открыто (раз в 3 дня, сдвиг +1) ──
            if ($dayIdx % 3 === 1) {
                $today = date('Y-m-d');
                $openShifts = count(sb_select('jm_vacancies', ['status' => 'eq.open', 'date' => 'gte.' . $today], 'id'));
                $openPerm = count(sb_select('jm_perm_vacancies', ['status' => 'eq.open'], 'id'));
                if ($openShifts + $openPerm > 0) {
                    // Без конкретных цифр — малые числа отпугивают
                    $title = '⚡ Свежие смены и вакансии';
                    $body = 'В приложении появились новые варианты рядом с вашим метро. Загляните — отклик в два тапа.';
                    $workersAll = sb_select('jm_users', ['role' => 'eq.worker'], 'id,telegram_id,push_token');
                    $bellRows = array_map(fn($w) => ['user_id' => $w['id'], 'title' => $title, 'body' => $body], $workersAll);
                    if (!empty($bellRows)) { try { sb_insert('jm_notifications', $bellRows); } catch (Throwable $e) {} }
                    $pushMsgs = [];
                    foreach ($workersAll as $w) {
                        if (!empty($w['telegram_id'])) {
                            tg_send_message((int)$w['telegram_id'], $title . "\n\n" . $body, true);
                        } elseif (!empty($w['push_token'])) {
                            $pushMsgs[] = ['to' => $w['push_token'], 'title' => $title, 'body' => $body,
                                'sound' => 'default', 'priority' => 'default', 'channelId' => 'vacancies', 'data' => ['type' => 'browse_nudge']];
                        }
                        $result['workerNudges']++;
                    }
                    if (!empty($pushMsgs)) expo_push($pushMsgs);
                }
            }

            $data = $result;
            break;
        }

        // args: [title, body, roleFilter 'all'|'worker'|'employer']
        // Рассылка по всем с привязанным Telegram (кнопка приложения в каждом сообщении)
        case 'tgBroadcast': {
            @set_time_limit(300);
            @ignore_user_abort(true);
            [$bTitle, $bBody, $roleF] = [(string)$args[0], (string)$args[1], (string)($args[2] ?? 'all')];
            $filters = ['telegram_id' => 'not.is.null'];
            if ($roleF === 'worker' || $roleF === 'employer') $filters['role'] = 'eq.' . $roleF;
            $recipients = sb_select('jm_users', $filters, 'telegram_id');
            $text = '<b>' . $bTitle . '</b>' . ($bBody !== '' ? "\n\n" . $bBody : '');
            $sent = 0;
            foreach ($recipients as $r) {
                if (tg_send_message((int)$r['telegram_id'], $text, true)) $sent++;
            }
            $data = ['sent' => $sent, 'total' => count($recipients)];
            break;
        }

        // args: [userId] — отвязать Telegram от аккаунта
        case 'tgUnbindTelegram': {
            sb_update('jm_users', ['id' => 'eq.' . $args[0]], ['telegram_id' => null]);
            $data = true;
            break;
        }

        // args: [userId, text] — message the user's linked Telegram account
        case 'tgNotifyUser': {
            $u = sb_single('jm_users', ['id' => 'eq.' . $args[0]], 'telegram_id');
            $data = ($u && !empty($u['telegram_id']))
                ? tg_send_message((int)$u['telegram_id'], (string)$args[1])
                : false;
            break;
        }

        // ── Vacancies ──────────────────────────────────────────────────────────
        case 'dbGetVacancies':
            $data = sb_select('jm_vacancies', [], '*', 'created_at.desc'); break;

        case 'dbUpsertVacancy':
            sb_upsert('jm_vacancies', $args[0], 'id'); break;

        case 'dbUpsertVacancyBatch':
            // $args[0] — массив строк вакансий, пишется одним запросом
            sb_upsert('jm_vacancies', $args[0], 'id'); break;

        case 'dbUpdateVacancy':
            sb_update('jm_vacancies', ['id' => 'eq.' . $args[0]], $args[1]); break;

        // ── Likes ──────────────────────────────────────────────────────────────
        case 'dbGetLikes':
            $data = sb_select('jm_likes'); break;

        case 'dbGetLikesForUser': {
            $field = $args[1] === 'worker' ? 'worker_id' : 'employer_id';
            $data = sb_select('jm_likes', [$field => 'eq.' . $args[0]]); break;
        }

        case 'dbGetLikesByVacancy':
            $data = sb_select('jm_likes', ['vacancy_id' => 'eq.' . $args[0]]); break;

        case 'dbGetVacancyStatsMap': {
            $rows = sb_select_all('jm_likes', [], 'vacancy_id,worker_liked,employer_liked,worker_skipped,is_match');
            $viewRows = sb_select_all('jm_vacancy_views', [], 'vacancy_id');
            $map = [];
            foreach ($rows as $r) {
                $vid = $r['vacancy_id'];
                if (!$vid) continue;
                if (!isset($map[$vid])) $map[$vid] = ['applicants' => 0, 'rejected' => 0, 'views' => 0];
                if ($r['worker_liked'] === true && $r['is_match'] === false && $r['employer_liked'] !== false) {
                    $map[$vid]['applicants']++;
                }
                if ($r['employer_liked'] === false || ($r['worker_liked'] === false && $r['worker_skipped'] === true)) {
                    $map[$vid]['rejected']++;
                }
            }
            foreach ($viewRows as $v) {
                $vid = $v['vacancy_id'];
                if (!$vid) continue;
                if (!isset($map[$vid])) $map[$vid] = ['applicants' => 0, 'rejected' => 0, 'views' => 0];
                $map[$vid]['views']++;
            }
            $data = $map;
            break;
        }

        case 'dbGetVacancyViewers': {
            $rows = sb_select('jm_vacancy_views', ['vacancy_id' => 'eq.' . $args[0]], 'worker_id,viewed_at', 'viewed_at.desc');
            $data = array_values(array_unique(array_column($rows, 'worker_id')));
            break;
        }

        case 'dbRecordVacancyView': {
            [$vid, $wid] = [$args[0], $args[1]];
            sb('POST', 'jm_vacancy_views', ['on_conflict' => 'vacancy_id,worker_id'],
                ['vacancy_id' => $vid, 'worker_id' => $wid, 'viewed_at' => now_iso()],
                ['Prefer: resolution=ignore-duplicates,return=minimal']);
            break;
        }

        case 'dbGetPermVacancyViewers': {
            $rows = sb_select('jm_perm_vacancy_views', ['vacancy_id' => 'eq.' . $args[0]], 'worker_id,viewed_at', 'viewed_at.desc');
            $data = array_values(array_unique(array_column($rows, 'worker_id')));
            break;
        }

        case 'dbGetPermVacancyViewsMap': {
            $rows = sb_select_all('jm_perm_vacancy_views', [], 'vacancy_id');
            $map = [];
            foreach ($rows as $r) {
                $vid = $r['vacancy_id'];
                if (!$vid) continue;
                $map[$vid] = ($map[$vid] ?? 0) + 1;
            }
            $data = $map;
            break;
        }

        case 'dbRecordPermVacancyView': {
            [$vid, $wid] = [$args[0], $args[1]];
            sb('POST', 'jm_perm_vacancy_views', ['on_conflict' => 'vacancy_id,worker_id'],
                ['vacancy_id' => $vid, 'worker_id' => $wid, 'viewed_at' => now_iso()],
                ['Prefer: resolution=ignore-duplicates,return=minimal']);
            break;
        }

        case 'dbGetLikeByVacancyWorker':
            $data = sb_single('jm_likes', ['vacancy_id' => 'eq.' . $args[0], 'worker_id' => 'eq.' . $args[1]]); break;

        case 'dbUpsertLike': {
            [$vid, $wid, $eid, $upd] = [$args[0], $args[1], $args[2], $args[3]];
            $base = sb_single('jm_likes', ['vacancy_id' => 'eq.' . $vid, 'worker_id' => 'eq.' . $wid]) ?? [
                'id' => uid(), 'vacancy_id' => $vid, 'worker_id' => $wid, 'employer_id' => $eid,
                'worker_liked' => false, 'employer_liked' => null, 'worker_skipped' => false,
                'is_match' => false, 'matched_at' => null,
                'worker_confirmed' => false, 'employer_confirmed' => false,
                'worker_rated' => false, 'employer_rated' => false, 'shift_completed' => false,
            ];
            $row = array_merge($base, [
                'worker_liked'       => $upd['workerLiked']       ?? $base['worker_liked'],
                'employer_liked'     => $upd['employerLiked']     ?? $base['employer_liked'],
                'worker_skipped'     => $upd['workerSkipped']     ?? $base['worker_skipped'],
                'is_match'           => $upd['isMatch']           ?? $base['is_match'],
                'matched_at'         => $upd['matchedAt']         ?? $base['matched_at'],
                'worker_confirmed'   => $upd['workerConfirmed']   ?? $base['worker_confirmed'],
                'employer_confirmed' => $upd['employerConfirmed'] ?? $base['employer_confirmed'],
                'worker_rated'       => $upd['workerRated']       ?? $base['worker_rated'],
                'employer_rated'     => $upd['employerRated']     ?? $base['employer_rated'],
                'shift_completed'    => $upd['shiftCompleted']    ?? $base['shift_completed'],
            ]);
            $written = sb_upsert('jm_likes', $row, 'vacancy_id,worker_id', true);
            if (empty($written)) throw new RuntimeException('Like not saved: permission denied');
            $data = $row; break;
        }

        case 'dbRemoveLike':
            sb_delete('jm_likes', ['vacancy_id' => 'eq.' . $args[0], 'worker_id' => 'eq.' . $args[1]]); break;

        case 'dbDeleteMatch':
            sb_delete('jm_likes', ['id' => 'eq.' . $args[0]]); break;

        // ── Messages ───────────────────────────────────────────────────────────
        case 'dbGetMessages':
            $data = sb_select('jm_messages', ['chat_id' => 'eq.' . $args[0]], '*', 'created_at.asc'); break;

        case 'dbInsertMessage': {
            $msg = ['id' => uid(), 'chat_id' => $args[0], 'sender_id' => $args[1], 'text' => $args[2], 'created_at' => now_iso()];
            sb_insert('jm_messages', $msg);
            $data = $msg; break;
        }

        // ── Chats ──────────────────────────────────────────────────────────────
        case 'dbGetChats': {
            $field = $args[1] === 'worker' ? 'worker_id' : 'employer_id';
            $rows = sb_select('jm_chats', [$field => 'eq.' . $args[0]], '*', 'created_at.desc');
            if (empty($rows)) { $data = []; break; }
            $ids = array_map(fn($r) => $r['id'], $rows);
            $msgs = sb_select('jm_messages', ['chat_id' => 'in.(' . implode(',', $ids) . ')'], '*', 'created_at.desc');
            $last = [];
            foreach ($msgs as $m) { if (!isset($last[$m['chat_id']])) $last[$m['chat_id']] = $m; }
            $data = array_map(function($r) use ($last) { $r['_last_msg'] = $last[$r['id']] ?? null; return $r; }, $rows);
            break;
        }

        case 'dbGetChatById': {
            $chat = sb_single('jm_chats', ['id' => 'eq.' . $args[0]]);
            if (!$chat) { $data = null; break; }
            $chat['_messages'] = sb_select('jm_messages', ['chat_id' => 'eq.' . $args[0]], '*', 'created_at.asc');
            $data = $chat; break;
        }

        case 'dbCreateChat': {
            [$wid, $eid, $vid, $vt, $cn, $sm, $uw, $ue] =
                [$args[0], $args[1], $args[2], $args[3], $args[4], $args[5] ?? null, $args[6] ?? 0, $args[7] ?? 0];
            $ex = sb_single('jm_chats', ['vacancy_id' => 'eq.' . $vid, 'worker_id' => 'eq.' . $wid], 'id');
            if ($ex) { $data = $ex['id']; break; }
            $cid = uid();
            sb_insert('jm_chats', ['id' => $cid, 'vacancy_id' => $vid, 'worker_id' => $wid,
                'employer_id' => $eid, 'vac_title' => $vt, 'company_name' => $cn,
                'unread_worker' => $uw, 'unread_employer' => $ue, 'created_at' => now_iso()]);
            if ($sm) sb_insert('jm_messages', ['id' => uid(), 'chat_id' => $cid, 'sender_id' => 'system', 'text' => $sm, 'created_at' => now_iso()]);
            $data = $cid; break;
        }

        case 'dbMarkRead': {
            $f = $args[1] === 'worker' ? 'unread_worker' : 'unread_employer';
            sb_update('jm_chats', ['id' => 'eq.' . $args[0]], [$f => 0]); break;
        }

        case 'dbIncrementUnread': {
            $row = sb_single('jm_chats', ['id' => 'eq.' . $args[0]], 'unread_worker,unread_employer');
            if (!$row) break;
            $f = $args[1] === 'worker' ? 'unread_worker' : 'unread_employer';
            $cur = $args[1] === 'worker' ? ($row['unread_worker'] ?? 0) : ($row['unread_employer'] ?? 0);
            sb_update('jm_chats', ['id' => 'eq.' . $args[0]], [$f => $cur + 1]); break;
        }

        case 'dbDeleteChat':
            sb_delete('jm_messages', ['chat_id' => 'eq.' . $args[0]]);
            sb_delete('jm_chats', ['id' => 'eq.' . $args[0]]); break;

        // ── Saved ──────────────────────────────────────────────────────────────
        case 'dbGetSaved': {
            $rows = sb_select('jm_saved', ['user_id' => 'eq.' . $args[0]], 'vacancy_id');
            $data = array_map(fn($r) => $r['vacancy_id'], $rows); break;
        }

        case 'dbAddSaved':
            sb_upsert('jm_saved', ['user_id' => $args[0], 'vacancy_id' => $args[1]]); break;

        case 'dbRemoveSaved':
            sb_delete('jm_saved', ['user_id' => 'eq.' . $args[0], 'vacancy_id' => 'eq.' . $args[1]]); break;

        // ── Complaints ─────────────────────────────────────────────────────────
        case 'dbFileComplaint': {
            $p = $args[0];
            sb_insert('jm_complaints', [
                'id' => uid(), 'reporter_id' => $p['reporterId'], 'reporter_phone' => $p['reporterPhone'],
                'reporter_company' => $p['reporterCompany'] ?? null, 'target_id' => $p['targetId'],
                'target_phone' => $p['targetPhone'], 'target_company' => $p['targetCompany'] ?? null,
                'complaint_type' => $p['complaintType'], 'description' => $p['description'] ?? null,
                'created_at' => now_iso(),
            ]); break;
        }

        // ── Match logic ────────────────────────────────────────────────────────
        case 'dbCheckAndCreateMatch': {
            [$vid, $wid] = [$args[0], $args[1]];
            $like = sb_single('jm_likes', ['vacancy_id' => 'eq.' . $vid, 'worker_id' => 'eq.' . $wid]);
            if (!$like) { $data = ['matched' => false]; break; }
            if ($like['is_match']) {
                $ec = sb_single('jm_chats', ['vacancy_id' => 'eq.' . $vid, 'worker_id' => 'eq.' . $wid], 'id');
                $data = ['matched' => false, 'chatId' => $ec['id'] ?? null]; break;
            }
            if (!$like['worker_liked'] || $like['employer_liked'] !== true) { $data = ['matched' => false]; break; }
            sb_update('jm_likes', ['vacancy_id' => 'eq.' . $vid, 'worker_id' => 'eq.' . $wid],
                ['is_match' => true, 'matched_at' => now_iso()]);
            $vac = sb_single('jm_vacancies', ['id' => 'eq.' . $vid]);
            $ec2 = sb_single('jm_chats', ['vacancy_id' => 'eq.' . $vid, 'worker_id' => 'eq.' . $wid], 'id');
            $cid = $ec2['id'] ?? uid();
            if (!$ec2) {
                sb_insert('jm_chats', [
                    'id' => $cid, 'vacancy_id' => $vid, 'worker_id' => $wid,
                    'employer_id' => $like['employer_id'], 'vac_title' => $vac['title'] ?? '',
                    'company_name' => $vac['company'] ?? '', 'unread_worker' => 1, 'unread_employer' => 1,
                    'created_at' => now_iso(),
                ]);
            }
            sb_insert('jm_messages', ['id' => uid(), 'chat_id' => $cid, 'sender_id' => 'system',
                'text' => '🎉 У вас мэтч! Вы подошли друг другу. Познакомьтесь и обсудите детали!', 'created_at' => now_iso()]);
            sb_insert('jm_messages', ['id' => uid(), 'chat_id' => $cid, 'sender_id' => 'system_safety',
                'text' => "🔒 Рекомендуем не переводить общение в сторонние мессенджеры или почту, а продолжить его в чате JobToo: так у мошенников будет меньше шансов вас обмануть.\n\nГде бы вы ни общались — не сообщайте свой CVV-код, код из SMS и не вводите данные карты по ссылке.",
                'created_at' => now_iso()]);
            if ($vac) {
                $nf = ($vac['workers_found'] ?? 0) + 1;
                sb_update('jm_vacancies', ['id' => 'eq.' . $vid],
                    ['workers_found' => $nf, 'status' => $nf >= ($vac['workers_needed'] ?? 999) ? 'closed' : 'open']);
            }
            $data = ['matched' => true, 'chatId' => $cid]; break;
        }

        // ── Permanent vacancies ────────────────────────────────────────────────
        case 'dbGetPermVacancies':
            $data = sb_select('jm_perm_vacancies', ['status' => 'eq.open'], '*', 'created_at.desc'); break;

        case 'dbGetPermVacanciesByEmployer':
            $data = sb_select('jm_perm_vacancies', ['employer_id' => 'eq.' . $args[0]], '*', 'created_at.desc'); break;

        case 'dbUpsertPermVacancy':
            sb_upsert('jm_perm_vacancies', $args[0], 'id'); break;

        case 'dbClosePermVacancy':
            sb_update('jm_perm_vacancies', ['id' => 'eq.' . $args[0]], ['status' => 'closed']); break;

        case 'dbDeleteVacancy':
            sb_delete('jm_vacancies', ['id' => 'eq.' . $args[0]]); break;

        case 'dbDeletePermVacancy':
            sb_delete('jm_perm_vacancies', ['id' => 'eq.' . $args[0]]); break;

        // ── Permanent applications ─────────────────────────────────────────────
        case 'dbGetPermApplications': {
            $f = $args[1] === 'worker' ? 'worker_id' : 'employer_id';
            $data = sb_select('jm_perm_applications', [$f => 'eq.' . $args[0]], '*', 'created_at.desc'); break;
        }

        case 'dbGetPermApplicationsForVacancy':
            $data = sb_select('jm_perm_applications', ['vacancy_id' => 'eq.' . $args[0]], '*', 'created_at.desc'); break;

        case 'dbApplyPermVacancy':
            sb_upsert('jm_perm_applications', [
                'id' => uid(), 'vacancy_id' => $args[0], 'worker_id' => $args[1],
                'employer_id' => $args[2], 'status' => 'pending', 'created_at' => now_iso(),
            ], 'vacancy_id,worker_id'); break;

        case 'dbSetPermApplicationStatus':
            sb_update('jm_perm_applications', ['id' => 'eq.' . $args[0]], ['status' => $args[1]]); break;

        // ── Permanent saved ────────────────────────────────────────────────────
        case 'dbGetPermSaved': {
            $rows = sb_select('jm_perm_saved', ['user_id' => 'eq.' . $args[0]], 'vacancy_id');
            $data = array_map(fn($r) => $r['vacancy_id'], $rows); break;
        }

        case 'dbAddPermSaved':
            sb_upsert('jm_perm_saved', ['user_id' => $args[0], 'vacancy_id' => $args[1]]); break;

        case 'dbRemovePermSaved':
            sb_delete('jm_perm_saved', ['user_id' => 'eq.' . $args[0], 'vacancy_id' => 'eq.' . $args[1]]); break;

        // ── Ratings ────────────────────────────────────────────────────────────
        case 'dbGetRatingsForUser':
            $data = sb_select('jm_ratings', ['to_user_id' => 'eq.' . $args[0]], '*', 'created_at.desc'); break;

        // ── Shift confirmation ─────────────────────────────────────────────────
        case 'dbConfirmShift':
            sb_update('jm_likes', ['id' => 'eq.' . $args[0]],
                ['employer_confirmed' => true, 'worker_confirmed' => true, 'shift_completed' => true]);
            $data = ['bothConfirmed' => true]; break;

        // ── Rating + match cleanup ─────────────────────────────────────────────
        case 'dbSubmitRatingAndMaybeDelete': {
            $p = $args[0];
            ['likeId' => $lid, 'fromUserId' => $fuid, 'toUserId' => $tuid,
             'vacancyId' => $vid, 'rating' => $rat, 'role' => $rol] = $p;
            sb_insert('jm_ratings', [
                'id' => uid(), 'from_user_id' => $fuid, 'to_user_id' => $tuid,
                'vacancy_id' => $vid, 'like_id' => $lid, 'rating' => $rat,
                'role' => $rol, 'review_text' => $p['reviewText'] ?? null, 'created_at' => now_iso(),
            ]);
            $rf = $rol === 'worker' ? 'worker_rated' : 'employer_rated';
            sb_update('jm_likes', ['id' => 'eq.' . $lid], [$rf => true]);
            $all = sb_select('jm_ratings', ['to_user_id' => 'eq.' . $tuid], 'rating');
            if (!empty($all)) {
                $avg = round(array_sum(array_column($all, 'rating')) / count($all), 2);
                sb_update('jm_users', ['id' => 'eq.' . $tuid], ['avg_rating' => $avg, 'rating_count' => count($all)]);
            }
            $lr = sb_single('jm_likes', ['id' => 'eq.' . $lid], 'worker_rated,employer_rated');
            $data = ['bothRated' => !empty($lr['worker_rated']) && !empty($lr['employer_rated'])]; break;
        }

        // ── Push tokens ────────────────────────────────────────────────────────
        case 'dbSavePushToken':
            sb_update('jm_users', ['id' => 'eq.' . $args[0]], ['push_token' => $args[1]]); break;

        case 'dbGetPushToken': {
            $r = sb_single('jm_users', ['id' => 'eq.' . $args[0]], 'push_token');
            $data = $r['push_token'] ?? null; break;
        }

        case 'dbGetWorkerTokensByMetro':
            $data = sb_select('jm_users', [
                'role' => 'eq.worker',
                'metro_station' => 'eq.' . $args[0],
                'push_token' => 'not.is.null',
            ], 'id,push_token'); break;

        // ── Web push subscriptions ─────────────────────────────────────────────
        case 'dbGetWebPushSubscription': {
            $r = sb_single('jm_web_push_subscriptions', ['user_id' => 'eq.' . $args[0]], 'endpoint,p256dh,auth');
            $data = ($r && isset($r['endpoint'])) ? $r : null; break;
        }

        case 'dbSaveWebPushSubscription':
            sb_upsert('jm_web_push_subscriptions', [
                'user_id'    => $args[0],
                'endpoint'   => $args[1],
                'p256dh'     => $args[2],
                'auth'       => $args[3],
                'updated_at' => gmdate('Y-m-d\TH:i:s\Z'),
            ], 'user_id'); break;

        // ── Push notifications ─────────────────────────────────────────────────
        case 'sendPushNotification': {
            [$to, $title, $nbody, $nd] = [$args[0], $args[1], $args[2], $args[3] ?? []];
            $tokens = is_array($to) ? $to : [$to];
            $msgs = array_map(fn($t) => [
                'to' => $t, 'title' => $title, 'body' => $nbody,
                'sound' => 'default', 'priority' => 'high',
                'channelId' => $nd['channelId'] ?? 'default', 'data' => $nd,
            ], $tokens);
            $payload = count($msgs) === 1 ? $msgs[0] : $msgs;
            $ch = curl_init('https://exp.host/--/api/v2/push/send');
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => json_encode($payload),
                CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
                CURLOPT_TIMEOUT => 15,
            ]);
            $resp = curl_exec($ch); curl_close($ch);
            $data = json_decode($resp ?: 'null', true); break;
        }

        // args: [pushTitle, pushBody, tgHtml, dataType, groupHtml?, vacancyId?]
        // push + Telegram + bell + web push to ALL workers, plus a post in the group.
        // vacancyId (перм. вакансии) делает кнопку дип-линком на конкретную вакансию.
        case 'dbNotifyAllWorkersNewVacancy': {
            // Не дать хостингу убить скрипт до конца рассылки
            @set_time_limit(300);
            @ignore_user_abort(true);

            $vacancyId = (string)($args[5] ?? '');
            $btnUrl = $vacancyId !== ''
                ? 'https://t.me/JobToo_bot/app?startapp=vacancy_' . $vacancyId
                : true;

            // Пост в группу — ПЕРВЫМ (одна быстрая операция): длинные циклы
            // рассылки ниже могут упереться в лимит времени PHP
            $groupHtml = (string)($args[4] ?? '');
            // Старые клиенты не шлют groupHtml — собираем пост из tgHtml,
            // чтобы группа получала ВСЕ вакансии независимо от версии приложения
            if ($groupHtml === '' && (string)($args[2] ?? '') !== '') {
                $groupHtml = (string)$args[2]
                    . "\n\n⚡ В приложении смены появляются раньше — откликайся первым 👇";
            }
            $groupOk = false;
            if ($groupHtml !== '' && TG_GROUP_CHAT_ID !== 0) {
                $groupOk = tg_send_message(TG_GROUP_CHAT_ID, $groupHtml, $btnUrl);
            }

            $data = broadcast_workers((string)$args[0], (string)$args[1], (string)$args[2], (string)($args[3] ?? 'nearby_shift'), $btnUrl);
            $data['group'] = $groupOk;
            break;
        }

        // args: [company, workType, date, metro] — биржа: объявление всем работникам
        case 'dbNotifyAllWorkersNewBulletin': {
            $company = (string)$args[0]; $wt = (string)$args[1]; $date = (string)$args[2]; $metro = (string)$args[3];
            $body = "$company — «$wt», $date" . ($metro !== '' ? ", м. $metro" : '');
            $tgHtml = "📣 <b>Новое объявление на бирже!</b>\n\n👷 $wt — $company\n📅 $date" . ($metro !== '' ? "\n🚇 м. $metro" : '') . "\n\nУспей откликнуться 👇";
            $data = broadcast_workers('📣 Новое объявление на бирже!', $body, $tgHtml, 'nearby_shift');
            break;
        }

        case 'dbSaveNotification':
            sb_insert('jm_notifications', ['user_id' => $args[0], 'title' => $args[1], 'body' => $args[2]]); break;

        case 'dbGetNotifications':
            $data = sb_select('jm_notifications', ['user_id' => 'eq.' . $args[0]], '*', 'created_at.desc'); break;

        case 'dbMarkNotifRead':
            sb_update('jm_notifications', ['id' => 'eq.' . $args[0]], ['is_read' => true]); break;

        case 'dbMarkAllNotifsRead':
            sb_update('jm_notifications', ['user_id' => 'eq.' . $args[0]], ['is_read' => true]); break;

        case 'dbDeleteNotif':
            sb_delete('jm_notifications', ['id' => 'eq.' . $args[0]]); break;

        case 'dbDeleteAllNotifs':
            sb_delete('jm_notifications', ['user_id' => 'eq.' . $args[0]]); break;

        // ── Bulletins (Биржа) ──────────────────────────────────────────────────
        case 'dbCreateBulletin': {
            $p = $args[0];
            $id = uid();
            sb_insert('jm_bulletins', [
                'id' => $id, 'employer_id' => $p['employerId'], 'company' => $p['company'],
                'work_type' => $p['workType'], 'date' => $p['date'],
                'time_start' => $p['timeStart'], 'time_end' => $p['timeEnd'],
                'metro' => $p['metro'], 'address' => $p['address'],
                'comment' => $p['comment'] ?? null, 'status' => 'open', 'created_at' => now_iso(),
            ]);
            $data = $id; break;
        }

        case 'dbGetActiveBulletins': {
            $today = date('Y-m-d');
            $cutoff = time() + 30 * 60; // now + 30 min
            $rows = sb_select('jm_bulletins', ['status' => 'eq.open', 'date' => 'gte.' . $today], '*', 'created_at.desc');
            $data = array_values(array_filter($rows, function($b) use ($cutoff) {
                if (empty($b['date']) || empty($b['time_start'])) return true;
                $startTs = strtotime($b['date'] . ' ' . $b['time_start'] . ':00');
                return $startTs > $cutoff;
            }));
            break;
        }

        // Смены: автозакрытие в момент ОКОНЧАНИЯ смены (директора добирают людей
        // и в уже идущую смену). Ночные смены (конец меньше начала) заканчиваются
        // на следующий день. Без времени окончания — закрываем в конце дня смены.
        case 'dbAutoClosePastVacancies': {
            $today = date('Y-m-d');
            $yesterday = date('Y-m-d', time() - 86400);
            $now = time();
            $rows = sb_select('jm_vacancies', ['status' => 'eq.open', 'date' => 'lte.' . $today], 'id,date,time_start,time_end');
            $toClose = array_filter($rows, function($v) use ($now, $yesterday) {
                $d = $v['date'] ?? '';
                if ($d === '') return false;
                $ts = $v['time_start'] ?? '';
                $te = $v['time_end'] ?? '';
                if ($te !== '') {
                    $end = strtotime($d . ' ' . $te . ':00');
                    if ($end === false) return $d < $yesterday;
                    if ($ts !== '' && $te <= $ts) $end += 86400; // смена через полночь
                    return $end <= $now;
                }
                $eod = strtotime($d . ' 23:59:59');
                return $eod !== false && $eod <= $now;
            });
            foreach ($toClose as $row) {
                sb_update('jm_vacancies', ['id' => 'eq.' . $row['id']], ['status' => 'closed']);
            }
            $data = count($toClose);
            break;
        }

        case 'dbAutoClosePastBulletins': {
            $today = date('Y-m-d');
            $cutoff = time() + 30 * 60; // now + 30 min
            // fetch all open bulletins up to and including today
            $rows = sb_select('jm_bulletins', ['status' => 'eq.open', 'date' => 'lte.' . $today], 'id,date,time_start');
            $toClose = array_filter($rows, function($b) use ($today, $cutoff) {
                if ($b['date'] < $today) return true;
                if (empty($b['time_start'])) return false;
                $startTs = strtotime($b['date'] . ' ' . $b['time_start'] . ':00');
                return $startTs <= $cutoff;
            });
            foreach ($toClose as $row) {
                sb_update('jm_bulletins', ['id' => 'eq.' . $row['id']], ['status' => 'closed']);
            }
            $data = count($toClose);
            break;
        }

        case 'dbRespondToBulletin': {
            [$bid, $wid] = [$args[0], $args[1]];
            $bul = sb_single('jm_bulletins', ['id' => 'eq.' . $bid]);
            if (!$bul) throw new RuntimeException('Bulletin not found');
            $ex = sb_single('jm_chats', ['bulletin_id' => 'eq.' . $bid, 'worker_id' => 'eq.' . $wid], 'id');
            if ($ex) { $data = $ex['id']; break; }
            $dateLabel = $bul['date'];
            $greeting = "Здравствуйте! Видел объявление — {$bul['work_type']} {$dateLabel} {$bul['time_start']}–{$bul['time_end']}. Готов выйти.";
            $cid = uid();
            sb_insert('jm_chats', [
                'id' => $cid, 'vacancy_id' => $bid, 'worker_id' => $wid,
                'employer_id' => $bul['employer_id'],
                'vac_title' => $bul['work_type'] . ' ' . $dateLabel,
                'company_name' => $bul['company'], 'unread_worker' => 0, 'unread_employer' => 1,
                'bulletin_id' => $bid, 'is_locked' => false, 'created_at' => now_iso(),
            ]);
            sb_insert('jm_messages', [
                'id' => uid(), 'chat_id' => $cid, 'sender_id' => $wid,
                'text' => $greeting, 'created_at' => now_iso(),
            ]);
            $data = $cid; break;
        }

        case 'dbGetMyBulletins':
            $data = sb_select('jm_bulletins', ['employer_id' => 'eq.' . $args[0]], '*', 'created_at.desc'); break;

        case 'dbCloseBulletin': {
            $bid = $args[0];
            $closeMsg = 'Работника уже нашли, вакансия больше не актуальна';
            sb_update('jm_bulletins', ['id' => 'eq.' . $bid], ['status' => 'closed']);
            $chats = sb_select('jm_chats', ['bulletin_id' => 'eq.' . $bid], 'id');
            foreach ($chats as $chat) {
                sb_update('jm_chats', ['id' => 'eq.' . $chat['id']], ['is_locked' => true]);
                sb_insert('jm_messages', [
                    'id' => uid(), 'chat_id' => $chat['id'], 'sender_id' => 'system',
                    'text' => $closeMsg, 'created_at' => now_iso(),
                ]);
            }
            $data = true; break;
        }

        case 'dbIncrementBulletinViews': {
            sb_rpc('increment_bulletin_views', ['bid' => $args[0]]);
            $data = true; break;
        }

        case 'dbGetActiveWorkerSlots': {
            $today = date('Y-m-d');
            $cutoff = time() + 30 * 60;
            $rows = sb_select('jm_worker_slots', ['status' => 'eq.open', 'date' => 'gte.' . $today], '*', 'created_at.desc');
            $data = array_values(array_filter($rows, function($s) use ($cutoff) {
                if (empty($s['date']) || empty($s['time_start'])) return true;
                $startTs = strtotime($s['date'] . ' ' . $s['time_start'] . ':00');
                return $startTs > $cutoff;
            }));
            break;
        }

        case 'dbAutoClosePastWorkerSlots': {
            $today = date('Y-m-d');
            $cutoff = time() + 30 * 60;
            $rows = sb_select('jm_worker_slots', ['status' => 'eq.open', 'date' => 'lte.' . $today], 'id,date,time_start');
            $toClose = array_filter($rows, function($s) use ($today, $cutoff) {
                if ($s['date'] < $today) return true;
                if (empty($s['time_start'])) return false;
                $startTs = strtotime($s['date'] . ' ' . $s['time_start'] . ':00');
                return $startTs <= $cutoff;
            });
            foreach ($toClose as $row) {
                sb_update('jm_worker_slots', ['id' => 'eq.' . $row['id']], ['status' => 'closed']);
            }
            $data = count($toClose);
            break;
        }

        case 'dbGetMyWorkerSlots':
            $data = sb_select('jm_worker_slots', ['worker_id' => 'eq.' . $args[0]], '*', 'created_at.desc'); break;

        case 'dbCreateWorkerSlot': {
            $p = $args[0];
            $id = uid();
            sb_insert('jm_worker_slots', [
                'id' => $id,
                'worker_id' => $p['workerId'],
                'worker_name' => $p['workerName'],
                'work_type' => $p['workType'],
                'date' => $p['date'],
                'time_start' => $p['timeStart'],
                'time_end' => $p['timeEnd'],
                'metro' => $p['metro'],
                'comment' => $p['comment'] ?? null,
                'status' => 'open',
                'created_at' => now_iso(),
            ]);
            $data = $id; break;
        }

        case 'dbCloseWorkerSlot':
            sb_update('jm_worker_slots', ['id' => 'eq.' . $args[0]], ['status' => 'closed']);
            $data = true; break;

        case 'dbContactWorkerSlot': {
            [$slotId, $empId] = [$args[0], $args[1]];
            $slot = sb_single('jm_worker_slots', ['id' => 'eq.' . $slotId]);
            if (!$slot) throw new RuntimeException('Worker slot not found');
            $wid = $slot['worker_id'];
            $ex = sb_single('jm_chats', ['worker_slot_id' => 'eq.' . $slotId, 'employer_id' => 'eq.' . $empId], 'id');
            if ($ex) { $data = $ex['id']; break; }
            $emp = sb_single('jm_users', ['id' => 'eq.' . $empId]);
            $empName = $emp['company'] ?? $emp['first_name'];
            $cid = uid();
            $greeting = "Здравствуйте! Видели вашу заявку — {$slot['work_type']}, {$slot['date']}. Хотим пригласить вас на смену.";
            sb_insert('jm_chats', [
                'id' => $cid,
                'vacancy_id' => $slotId,
                'worker_id' => $wid,
                'employer_id' => $empId,
                'vac_title' => $slot['work_type'],
                'company_name' => $empName,
                'unread_worker' => 1,
                'unread_employer' => 0,
                'worker_slot_id' => $slotId,
                'is_locked' => false,
                'created_at' => now_iso(),
            ]);
            sb_insert('jm_messages', [
                'id' => uid(), 'chat_id' => $cid, 'sender_id' => $empId,
                'text' => $greeting, 'created_at' => now_iso(),
            ]);
            $data = $cid; break;
        }
        case 'dbGetAllWorkerTokens':
            $data = sb_select('jm_users', ['role' => 'eq.worker', 'push_token' => 'not.is.null'], 'id,push_token'); break;

        default:
            throw new RuntimeException('Unknown function: ' . $fn);
    }

    echo json_encode(['data' => $data]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
