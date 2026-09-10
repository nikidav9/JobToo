Warning: truncated output (original token count: 73549)
Total output lines: 4935

<?php
// Ответ прокси должен быть только JSON.
//
// Хостинг печатает предупреждения PHP прямо в ответ, и они оказываются ПЕРЕД
// телом: «<br /><b>Warning</b>: Undefined array key 0…{"data":null}». Клиент
// разбирает такое как JSON, спотыкается о первый символ и показывает
// «JSON Parse error: Unexpected character» — по этому тексту понять нельзя
// ничего. У директора так не публиковалась вакансия.
//
// Поэтому: предупреждения не печатаем (в лог хостинга они по-прежнему идут),
// а всё, что кто-то напечатает мимо, ловим буфером и выбрасываем перед
// выводом. Тихо ломаться хуже, чем громко, — но ломаться в разборе чужого
// текста хуже всего.
@ini_set('display_errors', '0');
@ini_set('html_errors', '0');
ob_start();
require_once __DIR__ . '/partner_billing.php';
require_once __DIR__ . '/superjob_oauth_lib.php';

/** Отдать ответ, отбросив всё, что случайно напечаталось до него. */
function jt_respond(array $payload, int $code = 200): void {
    if (ob_get_level() > 0) ob_end_clean();
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
}

// Адрес бэкенда — из секрета, как и ключ рядом.
//
// Так переключение между облаком и своим сервером (и откат обратно) — это
// смена одного значения в настройках, а не правка трёх файлов и выкладка.
// Откат важнее: если после переезда что-то пойдёт не так, вернуться надо
// быстро, а не собирать релиз.
//
// Значение не задано — работает облако. Выкладка сама по себе ничего не
// переключает, и это намеренно.
function sb_resolve_url(): string {
    $env = getenv('SB_URL');
    if (is_string($env) && trim($env) !== '') return rtrim(trim($env), '/');

    $file = __DIR__ . '/sb_url.php';
    if (is_readable($file)) {
        $v = @include $file;
        if (is_string($v) && trim($v) !== '') return rtrim(trim($v), '/');
    }
    // Умолчание — свой сервер в Москве.
    //
    // Раньше здесь стоял адрес облака, но 15.08 оно оказалось заблокировано
    // за превышение квоты на трафик, и приложение перестало работать.
    // Данные к тому моменту были уже перенесены и проверены, поэтому
    // умолчание переведено сюда: сервис важнее осторожности, когда простой
    // уже идёт.
    //
    // Секрет SB_URL по-прежнему перекрывает это значение — им же делается
    // и откат, если понадобится вернуться в облако.
    return 'https://jobtoo.ru';
}

define('SB_URL', sb_resolve_url());

// Ключ доступа к базе.
//
// Анонимный ключ публичен по своей природе: он лежит в бандле сайта
// jobtoo.ru, и достать его может любой, кто откроет исходники страницы.
// Пока RLS выключены, с ним читаются телефоны, имена и переписки. Поэтому
// прокси переводим на сервисный ключ — он остаётся на сервере.
//
// Откуда берём (в порядке приоритета):
//   1) переменная окружения SB_SERVICE_KEY;
//   2) файл sb_service_key.php рядом с этим скриптом — на хостинге, где
//      переменные окружения не задать, это единственный рабочий путь.
//      Расширение .php тут не случайно: если файл запросят по прямой
//      ссылке, сервер его выполнит и отдаст пустоту, а не сам ключ;
//   3) старый анонимный ключ — запасной вариант, чтобы ничего не легло,
//      пока сервисный не прописан.
//
// Как только сервисный ключ окажется на хостинге — можно применять
// миграцию 013_lock_down_rls.sql и закрывать базу от анонимного доступа.

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
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-App-Secret, X-Admin-Token, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jt_respond(['error' => 'Method not allowed'], 405); exit;
}

// Смена секрета не может быть мгновенной: у части людей приложение уже
// установлено и старый секрет зашит в него до следующего обновления по воздуху.
// Поэтому на время перехода принимаем и предыдущий — APP_SECRET_PREV.
// Когда все обновятся, секрет из GitHub Secrets убирается, и старый ключ
// перестаёт работать сам собой.
$provided = $_SERVER['HTTP_X_APP_SECRET'] ?? '';
$accepted = array_filter([
    jt_secret('APP_SECRET'),
    jt_secret('APP_SECRET_PREV'),
]);
//
// Считаем, сколько запросов ещё приходит со старым ключом. Без этого счёта
// решение «пора убирать» приходится принимать вслепую: уберёшь рано —
// отвалятся все, кто не обновился, и узнаешь об этом от них. Счётчик
// превращает догадку в число, которое видно в ежедневном отчёте.
$ok = false; $viaPrev = false;
$prev = jt_secret('APP_SECRET_PREV');
foreach ($accepted as $s) {
    if (hash_equals($s, $provided)) {
        $ok = true;
        if ($prev !== '' && hash_equals($prev, $provided)) $viaPrev = true;
    }
}
if ($ok && $viaPrev) {
    // Файл, а не база: это диагностика, и ронять из-за неё запрос нельзя.
    $mark = '/var/www/api/prev_secret_used';
    $today = gmdate('Y-m-d');
    $cur = @file_get_contents($mark);
    [$d, $n] = $cur ? array_pad(explode(' ', trim($cur), 2), 2, '0') : [$today, '0'];
    @file_put_contents($mark, $today . ' ' . ($d === $today ? (int)$n + 1 : 1), LOCK_EX);
}
if (!$ok) {
    jt_respond(['error' => 'Forbidden'], 403); exit;
}

$body = json_decode(file_get_contents('php://input'), true);
$fn   = $body['fn'] ?? null;
$args = $body['args'] ?? [];

if (!$fn) { jt_respond(['error' => 'Missing fn'], 400); exit; }

// Операции управления нельзя защищать тем же ключом, который встроен в
// публичный web/APK-клиент. ADMIN_API_TOKEN хранится только на сервере и в
// закрытом дашборде. Если он не настроен, административные вызовы безопасно
// закрыты, а пользовательские сценарии продолжают работать.
$adminFns = [
    'dbKeyKind', 'adminResetPassword', 'dbMigrateChatMedia', 'dbDeleteUser',
    'cronEveningDigest', 'cronDailyNudges', 'cronShiftNudge',
    'tgBroadcast', 'tgSendToUsers', 'surveyDormantSend', 'surveyResults',
    'scoreRecalcAll', 'billingReport',
    'extSourcesList', 'extSourceSave', 'extSourceDelete', 'extStats',
    'partnerTariffsList', 'partnerTariffSave', 'partnerBillableEventRecord',
    'partnerReconciliationRecord', 'partnerBillingReport', 'partnerReportSnapshotSave',
    'apiKeysList', 'apiKeyCreate', 'apiKeyRevoke',
    'botAdminGet', 'botAdminSet', 'supportClose', 'supportReopen',
    'supportReply', 'supportThreads', 'botReply', 'botInbox',
    'tgGroupInfo', 'tgPostToGroup', 'tgSetWebhook', 'tgWebhookInfo',
    'dbGetWorkerTokensByMetro', 'dbGetAllWorkerTokens',
];
if (in_array($fn, $adminFns, true)) {
    // На переходном этапе отдельный токен можно задать как ADMIN_API_TOKEN.
    // Если он ещё не создан, используем пароль закрытого дашборда: он уже
    // серверный и, в отличие от APP_SECRET, не попадает в web/APK-бандл.
    $adminToken = jt_secret('ADMIN_API_TOKEN');
    if ($adminToken === '') {
        $credFile = __DIR__ . '/admin_credentials.php';
        $creds = is_readable($credFile) ? @include $credFile : null;
        $adminToken = is_array($creds) ? (string)($creds['password'] ?? '') : '';
    }
    $providedAdmin = (string)($_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '');
    if ($adminToken === '' || !hash_equals($adminToken, $providedAdmin)) {
        jt_respond(['error' => 'Admin authorization required'], 403); exit;
    }
}

$authHeader = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? '');
$authUid = jt_session_uid($authHeader);
$publicFns = [
    'dbCountUsers', 'dbWarmup', 'dbCheckPhoneExists', 'dbLogin',
    'dbUpsertUser', 'tgAuth', 'dbGetVacancies', 'dbGetPermVacancies',
    'extVacancies', 'extClick', 'addressSuggest', 'dbLogOpen', 'guestEvent',
    'dbResponsivenessMap',
];
if (!in_array($fn, $publicFns, true) && !in_array($fn, $adminFns, true) && $authUid === null) {
    jt_respond(['error' => 'Authentication required'], 401); exit;
}

// Для операций, где первый/второй аргумент прямо обозначает владельца,
// сервер не доверяет ID из тела запроса и сверяет его с подписанной сессией.
$selfArgFns = [
    'tgPrepareLink' => 0, 'dbTouchLastSeen' => 0,
    'dbChangePassword' => 0, 'dbDeleteAccount' => 0,
    'dbRecordConsent' => 0, 'dbGetConsent' => 0,
    'tgBindTelegram' => 0, 'tgUnbindTelegram' => 0,
    'dbGetSkillResults' => 0, 'dbSubmitSkillTest' => 0,
    'supportHistory' => 0, 'supportSend' => 0,
    'dbGetLikesForUser' => 0, 'dbGetChats' => 0,
    'dbGetSaved' => 0, 'dbAddSaved' => 0, 'dbRemoveSaved' => 0,
    'dbGetPermVacanciesByEmployer' => 0, 'dbGetPermApplications' => 0,
    'dbGetPermSaved' => 0, 'dbAddPermSaved' => 0, 'dbRemovePermSaved' => 0,
    'dbSavePushToken' => 0, 'dbClearPushToken' => 0,
    'dbGetWebPushSubscription' => 0, 'dbSaveWebPushSubscription' => 0,
    'dbDeleteWebPushSubscription' => 0, 'dbGetNotifications' => 0,
    'dbMarkAllNotifsRead' => 0, 'dbDeleteAllNotifs' => 0,
    'dbRecordVacancyView' => 1, 'dbRecordPermVacancyView' => 1,
    'dbGetLikeByVacancyWorker' => 1, 'dbRemoveLike' => 1,
    'dbCheckAndCreateMatch' => 1, 'dbApplyPermVacancy' => 1,
];
if (isset($selfArgFns[$fn])) {
    $pos = $selfArgFns[$fn];
    if ($authUid === null || (string)($args[$pos] ?? '') !== $authUid) {
        jt_respond(['error' => 'Forbidden for this user'], 403); exit;
    }
}

// Переписка доступна только её участникам.
$chatArgFns = [
    'dbGetMessages' => 0, 'dbGetChatById' => 0, 'dbInsertMessage' => 0,
    'dbMarkRead' => 0, 'dbIncrementUnread' => 0, 'dbDeleteChat' => 0,
];
if (isset($chatArgFns[$fn])) {
    $chatId = (string)($args[$chatArgFns[$fn]] ?? '');
    $chat = $chatId !== '' ? sb_single('jm_chats', ['id' => 'eq.' . $chatId], 'worker_id,employer_id') : null;
    if (!$chat || ($authUid !== (string)$chat['worker_id'] && $authUid !== (string)$chat['employer_id'])) {
        jt_respond(['error' => 'Chat access denied'], 403); exit;
    }
    if ($fn === 'dbInsertMessage' && (string)($args[1] ?? '') !== $authUid) {
        jt_respond(['error' => 'Invalid sender'], 403); exit;
    }
}
if ($fn === 'dbCreateChat') {
    $workerId = (string)($args[0] ?? '');
    $employerId = (string)($args[1] ?? '');
    if ($authUid !== $workerId && $authUid !== $employerId) {
        jt_respond(['error' => 'Chat access denied'], 403); exit;
    }
}

// Создавать и менять объявления может только указанный в них работодатель.
if (in_array($fn, ['dbUpsertVacancy', 'dbUpsertPermVacancy'], true)) {
    $owner = (string)(($args[0]['employer_id'] ?? ''));
    if ($owner === '' || $owner !== $authUid) {
        jt_respond(['error' => 'Vacancy owner required'], 403); exit;
    }
}
if ($fn === 'dbUpsertVacancyBatch') {
    foreach ((array)($args[0] ?? []) as $row) {
        if ((string)($row['employer_id'] ?? '') !== $authUid) {
            jt_respond(['error' => 'Vacancy owner required'], 403); exit;
        }
    }
}
$ownedVacancyFns = [
    'dbUpdateVacancy' => ['jm_vacancies', 0],
    'dbDeleteVacancy' => ['jm_vacancies', 0],
    'dbGetLikesByVacancy' => ['jm_vacancies', 0],
    'dbGetVacancyViewers' => ['jm_vacancies', 0],
    'dbClosePermVacancy' => ['jm_perm_vacancies', 0],
    'dbDeletePermVacancy' => ['jm_perm_vacancies', 0],
    'dbGetPermApplicationsForVacancy' => ['jm_perm_vacancies', 0],
];
if (isset($ownedVacancyFns[$fn])) {
    [$table, $pos] = $ownedVacancyFns[$fn];
    $vac = sb_single($table, ['id' => 'eq.' . (string)($args[$pos] ?? '')], 'employer_id');
    if (!$vac || (string)($vac['employer_id'] ?? '') !== $authUid) {
        jt_respond(['error' => 'Vacancy owner required'], 403); exit;
    }
}
if ($fn === 'dbSetPermApplicationStatus') {
    $app = sb_single('jm_perm_applications', ['id' => 'eq.' . (string)($args[0] ?? '')], 'employer_id');
    if (!$app || (string)($app['employer_id'] ?? '') !== $authUid) {
        jt_respond(['error' => 'Application access denied'], 403); exit;
    }
}
if ($fn === 'dbSubmitRatingAndMaybeDelete') {
    $params = is_array($args[0] ?? null) ? $args[0] : [];
    if ((string)($params['fromUserId'] ?? '') !== $authUid) {
        jt_respond(['error' => 'Rating author mismatch'], 403); exit;
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

/**
 * Сколько строк в таблице — без выкачивания самих строк.
 *
 * PostgREST отдаёт число в заголовке Content-Range, если попросить
 * Prefer: count=exact и ограничить выдачу одной строкой. Через sb() так
 * нельзя: она отдаёт только тело ответа.
 */
function sb_count(string $t, array $f = []): int {
    $q = array_merge(['select' => 'id'], $f);
    $url = SB_URL . '/rest/v1/' . $t . '?' . http_build_query($q, '', '&', PHP_QUERY_RFC3986);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HEADER         => true,
        CURLOPT_HTTPHEADER     => [
            'apikey: ' . SB_KEY,
            'Authorization: Bearer ' . SB_KEY,
            'Prefer: count=exact',
            'Range: 0-0',
        ],
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $resp = curl_exec($ch);
    curl_close($ch);
    if (!is_string($resp)) return 0;
    // Content-Range: 0-0/357
    return preg_match('#Content-Range:\s*[^/]+/(\d+)#i', $resp, $m) ? (int)$m[1] : 0;
}

// Поля пользователя, которые можно отдавать клиенту.
//
// Раньше здесь стояла звёздочка, и вместе с профилем наружу уходило поле
// password. Пропуск к db.php публичен по своей природе — он лежит в бандле
// сайта, — так что одним запросом dbGetUsers выгружалась вся база: телефон
// и пароль каждого. Перечисляем поля поимённо: добавится новое, оно не
// просочится само собой.
define('USER_PUBLIC_COLS', implode(',', [
    'id', 'role', 'first_name', 'last_name', 'age',
    'metro_line_id', 'metro_station', 'work_types', 'company', 'bio',
    'avatar_url', 'avg_rating', 'rating_count', 'is_blocked',
    'created_at', 'last_seen_at',
]));

// bcrypt-хеш от пароля, положенного как есть, отличается началом строки.
// Версии три — $2a$, $2b$, $2y$: приложение хеширует библиотекой bcryptjs
// и даёт $2b$, PHP даёт $2y$, и проверить чужой хеш умеет каждый из них
// (проверено в обе стороны).
function is_bcrypt(string $s): bool {
    return (bool)preg_match('/^\$2[aby]\$/', $s);
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

// Сигнал приложению уходит отсюда, из обёрток записи, а не из мест вызова:
// так о нём невозможно забыть при следующей правке. Он идёт после самой
// записи — сначала данные, потом слово о них.
function sb_insert(string $t, array $data, bool $ret = false): array {
    $r = sb('POST', $t, [], $data, [$ret ? 'Prefer: return=representation' : 'Prefer: return=minimal']);
    rt_touch($t);
    return $r;
}

function sb_upsert(string $t, array $data, string $conflict = '', bool $ret = false): array {
    $pref = 'resolution=merge-duplicates,return=' . ($ret ? 'representation' : 'minimal');
    $q = $conflict ? ['on_conflict' => $conflict] : [];
    $r = sb('POST', $t, $q, $data, ['Prefer: ' . $pref]);
    rt_touch($t);
    return $r;
}

function sb_update(string $t, array $f, array $data): void {
    sb('PATCH', $t, $f, $data, ['Prefer: return=minimal']);
    rt_touch($t);
}

function sb_delete(string $t, array $f): void {
    sb('DELETE', $t, $f);
    rt_touch($t);
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


// ─── Секреты приложения ──────────────────────────────────────────────────────
// Раньше они лежали прямо в коде «на всякий случай». Пока репозиторий был
// закрытым, это сходило с рук; как только он стал публичным, токен бота и
// секрет приложения оказались доступны любому поиском по коду.
//
// Теперь берём их с хостинга: из переменных окружения либо из файла
// app_secrets.php рядом (см. app_secrets.example.php). Расширение .php не
// случайно: по прямой ссылке сервер выполнит файл и отдаст пустоту.
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

// ─── Пользовательские сессии ─────────────────────────────────────────────────
function jt_b64url_encode(string $raw): string {
    return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
}
function jt_b64url_decode(string $raw): string|false {
    $pad = strlen($raw) % 4;
    if ($pad) $raw .= str_repeat('=', 4 - $pad);
    return base64_decode(strtr($raw, '-_', '+/'), true);
}
function jt_session_key(): string {
    $key = jt_secret('SESSION_SECRET');
    return $key !== '' ? $key : SB_KEY;
}
function jt_session_issue(string $uid): string {
    $payload = jt_b64url_encode(json_encode([
        'uid' => $uid, 'exp' => time() + 30 * 86400,
    ], JSON_UNESCAPED_SLASHES));
    $sig = jt_b64url_encode(hash_hmac('sha256', $payload, jt_session_key(), true));
    return $payload . '.' . $sig;
}
function jt_session_uid(string $header): ?string {
    if (!preg_match('/^Bearer\s+(.+)$/i', trim($header), $m)) return null;
    $parts = explode('.', trim($m[1]), 2);
    if (count($parts) !== 2) return null;
    [$payload, $provided] = $parts;
    $expected = jt_b64url_encode(hash_hmac('sha256', $payload, jt_session_key(), true));
    if (!hash_equals($expected, $provided)) return null;
    $raw = jt_b64url_decode($payload);
    $data = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($data) || empty($data['uid']) || (int)($data['exp'] ?? 0) < time()) return null;
    return (string)$data['uid'];
}

// ─── Мгновенные сообщения ─────────────────────────────────────────────────────
// Раньше телефон слушал саму таблицу сообщений. Как только доступ к таблицам
// закрыли, такая подписка замолкает — она подчиняется тем же правилам.
//
// Поэтому сигналим иначе: сервер шлёт короткое «в этом чате что-то новое»
// через канал трансляций, а телефон в ответ забирает сообщения обычным путём,
// через прокси. Канал таблиц не касается, правила ему не помеха.
//
// В сигнале намеренно нет текста: каналы трансляции публичные, и всё, что
// туда попадёт, сможет прочитать любой, кто угадает имя канала. Пусть знает
// только то, что где-то шевельнулось.

/**
 * Разделы, об изменении которых приложению стоит узнать сразу.
 *
 * Раньше оно узнавало об этом подпиской на сами таблицы. Но чтобы такая
 * подписка что-то приносила, ключу приложения нужны права на чтение — а он
 * лежит в каждой установленной сборке и достаётся оттуда кем угодно. Ради
 * живой ленты пришлось бы открыть постороннему телефоны и переписку.
 *
 * Поэтому наружу уходит только имя раздела, без единой строки данных. По
 * нему приложение перечитывает нужное через этот же прокси, где проверяется
 * пропуск. Ключ из телефона годится ровно на одно: услышать «обновись».
 */
const RT_SECTIONS = [
    'jm_vacancies'        => 'vacancies',
    'jm_chats'            => 'chats',
    'jm_messages'         => 'chats',
    'jm_likes'            => 'likes',
    'jm_perm_vacancies'   => 'perm_vacancies',
    'jm_perm_applications'=> 'perm_applications',
    // jm_users намеренно нет. В эту таблицу пишется отметка «был в сети» —
    // у каждого человека раз в несколько минут. Сигнал оттуда заставлял бы
    // все открытые приложения перечитывать список из четырёхсот профилей
    // без всякого повода. Профиль меняется редко, и его подхватывает
    // обычное обновление по таймеру.
    'jm_saved'            => 'saved',
    'jm_perm_saved'       => 'perm_saved',
    'jm_ratings'          => 'ratings',
    'jm_notifications'    => 'notifications',
];

/**
 * Сказать приложению, что раздел изменился.
 *
 * Зовётся из обёрток записи, а не из мест вызова: так о новом разделе
 * невозможно забыть, а забытый сигнал — это молча не обновляющийся экран,
 * и никто не поймёт почему.
 */
function rt_touch(string $table): void {
    // За один запрос про раздел говорим однажды. Одна отправка отклика
    // трогает и лайки, и чаты, и сообщения; рассылка уведомлений — четыреста
    // строк подряд, и столько же сигналов были бы вредны, а не полезны.
    static $sent = [];
    static $broken = false;
    if ($broken) return;

    $what = RT_SECTIONS[$table] ?? null;
    if ($what === null || isset($sent[$what])) return;
    $sent[$what] = true;

    // Realtime молчит — перестаём его дёргать до конца запроса. Иначе
    // одиннадцать разделов по четыре секунды тайм-аута превратятся в
    // сорок секунд ожидания у человека, отправившего одно сообщение.
    if (!rt_broadcast('jt', 'changed', ['что' => $what])) $broken = true;
}

function rt_broadcast(string $topic, string $event, array $payload = []): bool {
    $body = json_encode([
        'messages' => [['topic' => $topic, 'event' => $event, 'payload' => $payload]],
    ], JSON_UNESCAPED_UNICODE);

    $ch = curl_init(SB_URL . '/realtime/v1/api/broadcast');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $body,
        // Коротко: сообщение уже записано, и если сигнал не уйдёт, телефон
        // всё равно подхватит его следующим опросом.
        CURLOPT_TIMEOUT => 4,
        CURLOPT_HTTPHEADER => [
            'apikey: ' . SB_KEY,
            'Authorization: Bearer ' . SB_KEY,
            'Content-Type: application/json',
        ],
    ]);
    $resp = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return $resp !== false && $code >= 200 && $code < 300;
}

// Единственное место, где сообщения попадают в базу: и обычные, и системные.
// Сигнал уходит отсюда, чтобы его нельзя было забыть добавить.
function msg_insert(array $row): array {
    sb_insert('jm_messages', $row);
    try {
        if (!empty($row['chat_id'])) {
            rt_broadcast('chat:' . $row['chat_id'], 'refresh');
        }
    } catch (\Throwable $e) {
        // Отправка сообщения не должна падать из-за сигнала.
    }
    return $row;
}

// ─── Карточка вакансии в чате ─────────────────────────────────────────────────
// Чат теперь один на пару людей, и в нём может идти речь о нескольких сменах.
// Чтобы не путаться, каждый новый отклик открывается карточкой: что за работа,
// когда и где. Раньше это висело полосой в шапке чата и относилось непонятно
// к чему — при второй смене шапка показывала бы только одну из них.
//
// Текстом, а не значками: карточка попадает и в список чатов, и в пуш, а там
// разметки нет. Эмодзи не ставим — от них в чате договорились уходить.

function fmt_date_ru(string $iso): string {
    if ($iso === '') return '';
    $ts = strtotime($iso);
    if (!$ts) return $iso;
    $days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    return $days[(int)date('w', $ts)] . ' ' . date('d.m', $ts);
}

/**
 * Завести переписку по отклику (или подхватить существующую).
 *
 * Чат один на пару людей, а не на каждую вакансию: директор с тремя сменами
 * получал три отдельные переписки с одним человеком, и разговор рассыпался.
 *
 * Первым сообщением идёт карточка вакансии — от системы, это справка. А вот
 * сам отклик пишет человек, и отправляется он от его имени. Раньше и отклик
 * слался от «system» шаблоном «Меня заинтересовала ваша вакансия»: на той
 * стороне видели автоответчик, и отвечать было нечему — из 132 чатов в 50
 * не прозвучало ни одного живого слова.
 *
 * $from — кто написал первое сообщение: true или 'worker' — работник,
 * 'employer' — работодатель, всё остальное — система.
 *
 * Работодатель появился здесь после разбора чата, где директор одобрила
 * кандидата и оба замолчали: чат открылся шаблоном «Поздравляем, свяжитесь с
 * кандидатом», и каждый стал ждать другого. На вопрос «почему перестали»
 * директор ответила: «не удобно, ни кто не писал» — буквально так и было,
 * два системных сообщения и ни одного человеческого.
 */
function chat_ensure(string $wid, string $eid, string $vid, string $vt, string $cn,
                     ?string $sm, int $uw, int $ue, bool|string $from = false): string {
    $author = ($from === true || $from === 'worker') ? $wid
            : ($from === 'employer' ? $eid : 'system');

    $ex = sb_single('jm_chats',
        ['worker_id' => 'eq.' . $wid, 'employer_id' => 'eq.' . $eid],
        'id,vacancy_id,unread_worker,unread_employer');

    if ($ex) {
        $cid = $ex['id'];
        // Карточку вакансии повторять незачем — чат уже про неё. А вот живое
        // сообщение уходит всегда: директор одобряет кандидата в той же
        // переписке, которую тот открыл своим откликом, и на «та же вакансия —
        // ничего не добавляем» его первые слова пропадали молча.
        $newVac = $vid !== '' && ($ex['vacancy_id'] ?? '') !== $vid;
        if ($newVac) {
            sb_update('jm_chats', ['id' => 'eq.' . $cid], [
                'vacancy_id' => $vid,
                'vac_title' => $vt,
                'company_name' => $cn,
                'unread_worker' => (int)($ex['unread_worker'] ?? 0) + $uw,
                'unread_employer' => (int)($ex['unread_employer'] ?? 0) + $ue,
            ]);
            $card = vacancy_card_text($vid);
            if ($card) {
                msg_insert(['id' => uid(), 'chat_id' => $cid, 'sender_id' => 'system',
                    'text' => $card, 'created_at' => now_iso()]);
            }
        } elseif ($sm !== null && $sm !== '' && ($uw > 0 || $ue > 0)) {
            sb_update('jm_chats', ['id' => 'eq.' . $cid], [
                'unread_worker' => (int)($ex['unread_worker'] ?? 0) + $uw,
                'unread_employer' => (int)($ex['unread_employer'] ?? 0) + $ue,
            ]);
        }
        if ($sm !== null && $sm !== '') {
            msg_insert(['id' => uid(), 'chat_id' => $cid, 'sender_id' => $author,
                'text' => $sm, 'created_at' => now_iso()]);
        }
        return $cid;
    }

    $cid = uid();
    sb_insert('jm_chats', ['id' => $cid, 'vacancy_id' => $vid, 'worker_id' => $wid,
        'employer_id' => $eid, 'vac_title' => $vt, 'company_name' => $cn,
        'unread_worker' => $uw, 'unread_employer' => $ue, 'created_at' => now_iso()]);
    $card = vacancy_card_text($vid);
    if ($card) {
        msg_insert(['id' => uid(), 'chat_id' => $cid, 'sender_id' => 'system',
            'text' => $card, 'created_at' => now_iso()]);
    }
    if ($sm) {
        msg_insert(['id' => uid(), 'chat_id' => $cid, 'sender_id' => $author,
            'text' => $sm, 'created_at' => now_iso()]);
    }
    return $cid;
}

function vacancy_card_text(string $vid): ?string {
    if (trim($vid) === '') return null;

    $v = sb_single('jm_vacancies', ['id' => 'eq.' . $vid]);
    if ($v) {
        $lines = ['Смена: ' . trim((string)($v['title'] ?? ''))];
        $date = fmt_date_ru((string)($v['date'] ?? ''));
        $time = ($v['time_start'] ?? '') && ($v['time_end'] ?? '')
            ? $v['time_start'] . '–' . $v['time_end'] : '';
        $when = trim($date . ($date && $time ? ', ' : '') . $time);
        if ($when !== '') $lines[] = 'Когда: ' . $when;
        $where = trim((string)($v['address'] ?? ''));
        if ($where === '' && !empty($v['metro_station'])) $where = 'м. ' . $v['metro_station'];
        if ($where !== '') $lines[] = 'Где: ' . $where;
        return implode("\n", $lines);
    }

    $p = sb_single('jm_perm_vacancies', ['id' => 'eq.' . $vid]);
    if ($p) {
        $lines = ['Постоянная работа: ' . trim((string)($p['title'] ?? ''))];
        if (!empty($p['schedule'])) $lines[] = 'График: ' . $p['schedule'];
        $where = trim((string)($p['address'] ?? ''));
        if ($where === '' && !empty($p['metro_station'])) $where = 'м. ' . $p['metro_station'];
        if ($where !== '') $lines[] = 'Где: ' . $where;
        return implode("\n", $lines);
    }

    return null;
}

// ─── Адреса и координаты ──────────────────────────────────────────────────────
// Геокодер только один — Яндекс (сервер в РФ: 152-ФЗ, локализация данных). Ключ
// серверный, лежит в app_secrets.php (YANDEX_GEOCODER_KEY). Иностранных
// геокодеров в проекте нет: если ключа нет или Яндекс молчит — координаты просто
// не определяются, но ни один запрос за границу не уходит. Все вызовы идут через
// geo_search() ниже.

// Серверный ключ Яндекс.Геокодера. Пусто — координаты не определяются.
function yandex_geocoder_key(): string {
    return jt_secret('YANDEX_GEOCODER_KEY');
}

// Геокодер Яндекса (HTTP API). Сервер в РФ. Формат ответа:
// response.GeoObjectCollection.featureMember[].GeoObject, координаты в
// Point.pos как «lon lat». Возвращаем список
// [ ['name'=>..., 'lat'=>float, 'lng'=>float], ... ].
function yandex_geocode_search(string $q, int $timeout = 6): array {
    $key = yandex_geocoder_key();
    if ($key === '') return [];
    $url = 'https://geocode-maps.yandex.ru/1.x/?' . http_build_query([
        'apikey'  => $key,
        'format'  => 'json',
        'geocode' => $q,
        'lang'    => 'ru_RU',
        'results' => 7,
        // Смещаем выдачу к Москве и области, но не жёстко (rspn=0).
        'll'   => '37.62,55.75',
        'spn'  => '1.30,0.80',
        'rspn' => 0,
    ]);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_HTTPHEADER     => ['Accept: application/json'],
    ]);
    $resp = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    $dec = json_decode($resp ?: 'null', true);
    if ($code !== 200 || !is_array($dec)) return [];

    $members = $dec['response']['GeoObjectCollection']['featureMember'] ?? null;
    if (!is_array($members)) return [];

    $out = [];
    foreach ($members as $m) {
        $obj = $m['GeoObject'] ?? null;
        if (!is_array($obj)) continue;
        $pos = trim((string)($obj['Point']['pos'] ?? '')); // «lon lat»
        if ($pos === '') continue;
        $parts = explode(' ', $pos);
        if (count($parts) < 2) continue;
        $lon = (float)$parts[0];
        $lat = (float)$parts[1];
        // Полный адрес: metaDataProperty.GeocoderMetaData.text, без «Россия,».
        $text = $obj['metaDataProperty']['GeocoderMetaData']['text']
            ?? trim(((string)($obj['description'] ?? '')) . ', ' . ((string)($obj['name'] ?? '')), ', ');
        $text = preg_replace('/^\s*Россия,\s*/u', '', (string)$text);
        $out[] = ['name' => $text, 'lat' => $lat, 'lng' => $lon];
    }
    return $out;
}

// Серверный ключ Яндекс.Геосаджеста (подсказки адреса). Российский сервис.
function yandex_suggest_key(): string {
    return jt_secret('YANDEX_SUGGEST_KEY');
}

// Яндекс.Геосаджест (suggest-maps.yandex.ru): подсказки адреса при вводе.
// Возвращаем ту же форму [ ['name'=>..., 'lat'=>float|null, 'lng'=>float|null] ].
// Координаты достаём из uri (ll=<lon>,<lat>), если Яндекс их отдал; иначе null —
// поле адреса и без координат работает (просто без метки на карте).
function yandex_suggest_search(string $q, int $timeout = 6): array {
    $key = yandex_suggest_key();
    if ($key === '') return [];
    $url = 'https://suggest-maps.yandex.ru/v1/suggest?' . http_build_query([
        'apikey'        => $key,
        'text'          => $q,
        'lang'          => 'ru',
        'results'       => 7,
        'print_address' => 1,
        // Смещаем подсказки к Москве и области.
        'll'  => '37.62,55.75',
        'spn' => '1.30,0.80',
    ]);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_HTTPHEADER     => ['Accept: application/json'],
    ]);
    $resp = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    $dec = json_decode($resp ?: 'null', true);
    if ($code !== 200 || !is_array($dec)) return [];

    $results = $dec['results'] ?? null;
    if (!is_array($results)) return [];

    $out = [];
    foreach ($results as $r) {
        $name = $r['address']['formatted_address']
            ?? trim(((string)($r['title']['text'] ?? '')) . ', ' . ((string)($r['subtitle']['text'] ?? '')), ', ');
        $name = preg_replace('/^\s*Россия,\s*/u', '', (string)$name);
        if ($name === '') continue;
        $lat = null; $lng = null;
        $uri = (string)($r['uri'] ?? '');
        // ymapsbm1://geo?ll=<lon>,<lat>&… — координаты, если пришли.
        if ($uri !== '' && preg_match('/[?&]ll=([-0-9.]+)(?:,|%2C)([-0-9.]+)/i', $uri, $mm)) {
            $lng = (float)$mm[1];
            $lat = (float)$mm[2];
        }
        $out[] = ['name' => $name, 'lat' => $lat, 'lng' => $lng];
    }
    return $out;
}

// Единая точка поиска адреса — только российские сервисы Яндекса. Если есть
// ключ HTTP-геокодера — берём его (даёт координаты точно); иначе — Геосаджест
// (подсказки, координаты по возможности). Иностранных сервисов здесь нет.
function geo_search(string $q, int $timeout = 6): array {
    if (yandex_geocoder_key() !== '') {
        $hits = yandex_geocode_search($q, $timeout);
        if (!empty($hits)) return $hits;
    }
    return yandex_suggest_search($q, $timeout);
}

// Работодатели пишут адрес как придётся. Готовим несколько написаний одного
// и того же адреса — от самого точного к самому общему.
function address_variants(string $address): array {
    $v = [];
    $s = trim($address);
    if ($s === '') return $v;
    $v[] = $s;

    // «Ул.», «Ул,», «улица» в начале Nominatim только сбивают
    $t = preg_replace('/^\s*(ул[.,]?|улица)\s+/ui', '', $s);

    // Улицы называют в родительном падеже: не «Скульптура Мухиной», а
    // «Скульптора». Работодатели регулярно пишут именительный.
    $t = preg_replace('/\bСкульптура\b/ui', 'Скульптора', $t);
    $t = preg_replace('/\bАрхитектура\b/ui', 'Архитектора', $t);

    // «2й проезд» → «2-й проезд»
    $t = preg_replace('/\b(\d+)(й|я|е|го)\b/u', '$1-$2', $t);
    if ($t !== $s) $v[] = $t;

    // Без корпуса и строения: «Мневники 7к2» → «Мневники 7»
    $u = preg_replace('/\s*(\d+)\s*[кс]\s*\d+[а-я]?\s*$/ui', ' $1', $t);
    if ($u !== $t) $v[] = trim($u);

    // Совсем без номера дома — хотя бы попасть на нужную улицу
    $w = preg_replace('/[\s,]+\d.*$/u', '', $u);
    if (mb_strlen(trim($w)) > 4 && trim($w) !== trim($u)) $v[] = trim($w);

    return array_values(array_unique($v));
}

// Координаты по адресу. Возвращает [lat, lng] или null.
// Города за пределами Москвы (Красногорск, Химки и прочие) не трогаем: если
// дописать им «, Москва», геокодер уводит метку в другой конец области.
function geocode_address(string $address, int $timeout = 4, float $budget = 6.0): ?array {
    $deadline = microtime(true) + $budget;
    $outsideMoscow = (bool)preg_match(
        '/\b(красногорск|химки|люберцы|балашиха|мытищи|реутов|котельники|видное|одинцово|подольск|домодедово|щербинка|долгопрудный|лобня|дзержинский)\b/ui',
        $address
    );

    foreach (address_variants($address) as $q) {
        // Вариантов бывает четыре, и каждый — запрос наружу. Когда Nominatim
        // молчит, это десятки секунд, и PHP успевает упереться в лимит
        // времени раньше, чем дойдёт до записи. Дороже координат.
        if (microtime(true) >= $deadline) break;
        $full = $outsideMoscow ? $q . ', Московская область' : $q . ', Москва';
        foreach (geo_search($full, $timeout) as $hit) {
            if ($hit['lat'] !== null && $hit['lng'] !== null) {
                return [$hit['lat'], $hit['lng']];
            }
        }
    }
    return null;
}

// Горизонт публикации смен: не дальше двух недель вперёд и не больше
// четырнадцати дат за одну публикацию.
//
// Ограничение было только в форме создания, а форма живёт в приложении, и
// приложение у людей на руках бывает старым. Так и вышло: 10 июля в 08:23:58
// одним запросом приехали 63 смены на каждый день до 10 сентября. Правило,
// которое проверяется только на клиенте, — не правило.
define('VACANCY_HORIZON_DAYS', 14);

function vacancy_dates_guard(array $rows): void {
    $today = new DateTimeImmutable('today', new DateTimeZone('Europe/Moscow'));
    $limit = $today->modify('+' . VACANCY_HORIZON_DAYS . ' days');
    $dates = [];
    foreach ($rows as $r) {
        $d = trim((string)($r['date'] ?? ''));
        if ($d === '') continue;
        $dates[$d] = true;
        $when = DateTimeImmutable::createFromFormat('Y-m-d', $d, new DateTimeZone('Europe/Moscow'));
        if (!$when) {
            throw new RuntimeException('Не разобрал дату смены: ' . $d);
        }
        if ($when > $limit) {
            throw new RuntimeException(
                'Смену можно выложить не дальше чем на ' . VACANCY_HORIZON_DAYS . ' дней вперёд. '
                . 'Дата ' . $d . ' слишком далеко.'
            );
        }
    }
    if (count($dates) > VACANCY_HORIZON_DAYS) {
        throw new RuntimeException(
            'За одну публикацию можно выложить не больше ' . VACANCY_HORIZON_DAYS . ' дней, '
            . 'а пришло ' . count($dates) . '.'
        );
    }
}

/**
 * Не публикуем требования к полу, возрасту, национальности или внешности.
 * Законные специальные требования редки и должны пройти ручную проверку,
 * а не попадать в массовую ленту автоматически.
 */
function vacancy_content_guard(array $row): void {
    $text = mb_strtolower(implode(' ', array_map(
        fn($v) => is_scalar($v) ? (string)$v : '',
        [
            $row['title'] ?? '', $row['description'] ?? '',
            $row['conditions'] ?? '', $row['requirements'] ?? '',
        ]
    )));
    $blocked = [
        '~\\bмужчин[аы]?\\b|мужского\\s+пола~u',
        '~\\bженщин[аы]?\\b|женского\\s+пола~u',
        '~русскоязычн|славянск(?:ая|ой)\\s+внешност~u',
        '~\\b(?:до|от)\\s*\\d{2}\\s*(?:лет|года)~u',
        '~\\b\\d{2}\\s*[–—-]\\s*\\d{2}\\s*(?:лет|года)~u',
    ];
    foreach ($blocked as $pattern) {
        if (preg_match($pattern, $text)) {
            throw new RuntimeException(
                'Уберите требования к полу, возрасту, национальности или внешности. '
                . 'Оставьте только навыки и условия работы.'
            );
        }
    }
}

// Дописываем координаты в строку вакансии перед сохранением. Без этого метка
// на карте не появляется вовсе: раньше телефон геокодировал адреса сам при
// каждом открытии карты, и пока все тридцать запросов не пройдут, на карте
// висела одна-единственная вакансия.
/**
 * Сохранить, а потом искать координаты.
 *
 * Раньше порядок был обратный: сначала геокодер, потом запись. Адрес идёт
 * во внешнюю службу до четырёх раз, и если та молчит, PHP упирается в лимит
 * времени и умирает — до того, как что-либо сохранит. Вакансия пропадала
 * целиком, а человек получал обрывок вместо ответа и не понимал, почему
 * «не публикуется».
 *
 * Теперь запись первая. Не нашлись координаты — метка встанет у метро, это
 * мелочь по сравнению с потерянной вакансией.
 */
function save_then_geocode(string $table, array $row): void {
    sb_upsert($table, $row, 'id');

    $hasCoords = isset($row['lat']) && $row['lat'] !== null
              && isset($row['lng']) && $row['lng'] !== null;
    $address = trim((string)($row['address'] ?? ''));
    $id = (string)($row['id'] ?? '');
    if ($hasCoords || $address === '' || $id === '') return;

    try {
        $c = geocode_address($address);
        if ($c) sb_update($table, ['id' => 'eq.' . $id], ['lat' => $c[0], 'lng' => $c[1]]);
    } catch (\Throwable $e) {}
}

function fill_coords(array $row): array {
    $hasCoords = isset($row['lat']) && $row['lat'] !== null
              && isset($row['lng']) && $row['lng'] !== null;
    $address = trim((string)($row['address'] ?? ''));
    if ($hasCoords || $address === '') return $row;

    // Сохранение вакансии не должно падать из-за геокодера: не нашлось —
    // значит не нашлось, метка встанет у метро.
    try {
        $c = geocode_address($address);
        if ($c) { $row['lat'] = $c[0]; $row['lng'] = $c[1]; }
    } catch (\Throwable $e) {}

    return $row;
}

// ─── Telegram Mini App ────────────────────────────────────────────────────────

// Запасного значения тут нарочно нет. Прежний токен утёк вместе с открытым
// репозиторием, и посторонний переписывал боту описание на рекламу. Токен
// отозван и живёт только в GitHub Secrets (TG_BOT_TOKEN), откуда выкладка
// собирает app_secrets.php. Если он не задан — лучше явная тишина, чем
// работа на ключе, который знает чужой.
define('TG_BOT_TOKEN', jt_secret('TG_BOT_TOKEN'));
define('DASHBOARD_URL', getenv('DASHBOARD_URL') ?: 'https://admin.jobtoo.ru');
// Часы работы поддержки, по Москве. Обещать круглосуточный ответ и молчать
// до утра хуже, чем сразу сказать, когда ответят.
define('SUPPORT_FROM_HOUR', 10);
define('SUPPORT_TO_HOUR', 21);

/**
 * Отметка «обращение закрыто» (null — открыто).
 *
 * Таблицы может ещё не быть: миграции выкладываются отдельным ходом, и один
 * раз этот ход уже не состоялся. Ради служебной отметки нельзя ронять ни
 * обращение человека, ни ответ из дашборда — поэтому переживаем. Но не молча:
 * возвращаем, получилось ли, иначе дашборд напишет «закрыто», а обращение при
 * следующем обновлении вернётся в список, и будет непонятно почему.
 */
function support_thread_set(string $userId, ?string $closedAt): bool {
    if ($userId === '') return false;
    try {
        sb_upsert('jm_support_threads', [
            'user_id' => $userId, 'closed_at' => $closedAt, 'updated_at' => now_iso(),
        ], 'user_id');
        return true;
    } catch (Throwable $e) { return false; }
}

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
function tg_send_message(int $chatId, string $text, bool|string $withAppButton = false, string $btnText = '🚀 Откликнуться в JobToo', ?array $keyboard = null): bool {
    if (TG_BOT_TOKEN === '') return false;
    $payload = [
        'chat_id' => $chatId,
        'text' => $text,
        'parse_mode' => 'HTML',
        'disable_web_page_preview' => true,
    ];
    // Готовая клавиатура — для сообщений с кнопками ответа, вроде «одобрить
    // или отклонить». Раньше такие отправлялись мимо этой функции, своим
    // curl, — и мимо повтора при обрыве связи вместе с ним. То есть
    // работодатель мог не узнать об отклике ровно по той же причине, по
    // которой не уходили объявления в группу.
    if ($keyboard !== null) {
        $payload['reply_markup'] = ['inline_keyboard' => $keyboard];
    } elseif ($withAppButton !== false) {
        $url = is_string($withAppButton) ? $withAppButton : 'https://t.me/JobToo_bot/app';
        $payload['reply_markup'] = ['inline_keyboard' => [[
            ['text' => $btnText, 'url' => $url],
        ]]];
    }
    // Три попытки, а не одна.
    //
    // Связь с api.telegram.org рваная: замер с сервера дал четыре ответа из
    // четырёх на одной настройке и один из двух на другой, в разное время
    // по-разному. При одной попытке этого достаточно, чтобы объявление
    // молча не ушло в группу — ровно то, на что и жаловались.
    //
    // Повторяем только когда виновата связь. На отказ по существу — «бот
    // исключён», «чат не найден» — повтор бессмыслен: ответ будет тот же,
    // а человек будет ждать втрое дольше.
    $resp = false; $err = ''; $dec = null; $ok = false;
    for ($try = 1; $try <= 3; $try++) {
        $ch = curl_init('https://api.telegram.org/bot' . TG_BOT_TOKEN . '/sendMessage');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_TIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => true,
            // Сперва по IPv6, и это не вкусовщина. Замеры с этой машины
            // изо дня в день одинаковы: по IPv6 к Телеграму доходит 4 из 4,
            // по IPv4 — 0 из 2. А когда стек не указан, выбирает система, и
            // примерно в четверти случаев она выбирает сломанный путь.
            // Отсюда и «иногда объявление не уходит».
            //
            // Последняя попытка — без указания: если однажды отвалится уже
            // IPv6, жёсткая привязка к нему превратила бы редкий сбой в
            // постоянный.
            CURLOPT_IPRESOLVE => $try < 3 ? CURL_IPRESOLVE_V6 : CURL_IPRESOLVE_WHATEVER,
            CURLOPT_POSTFIELDS => json_encode($payload),
        ]);
        $resp = curl_exec($ch);
        $err  = curl_error($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $dec = json_decode($resp ?: 'null', true);
        $ok  = is_array($dec) && ($dec['ok'] ?? false) === true;
        if ($ok) break;

        // Телеграм ответил и отказал — это его слово, а не обрыв связи.
        if ($resp !== false && $code < 500 && is_array($dec)) break;
        if ($try < 3) usleep($try * 400000);   // 0,4 с, потом 0,8 с
    }

    // Последний отказ запоминаем: молчаливый провал отправки в группу стоил
    // нам того, что объявления перестали доходить до «ПОДРАБОТОК», а понять
    // причину было нечем — код на месте, права есть, сообщений нет.
    if (!$ok) {
        $GLOBALS['jt_last_tg_error'] = [
            'chat' => $chatId,
            'ошибка' => $err ?: (($dec['description'] ?? null) ?: substr((string)$resp, 0, 200)),
            'попыток' => $try ?? 1,
            'когда' => now_iso(),
        ];
    }
    return $ok;
}

/**
 * Отправка пушей через Expo, пачками по сотне. Не бросает исключений.
 *
 * ВАЖНО про содержимое. Это единственное место, откуда данные уходят на
 * exp.host, то есть в США, а США нет в перечне государств с адекватной
 * защитой прав субъектов персональных данных (приказ РКН № 128 от
 * 05.08.2022). Значит, в title и body не должно быть ни имён, ни телефонов,
 * ни текста переписки — ничего, что относится к конкретному человеку.
 *
 * Названия смен и вакансий, компании и числа — можно: это не персональные
 * данные, а без них уведомление перестаёт что-либо значить.
 *
 * Полный текст с именем при этом никуда не девается: он идёт в колокольчик
 * (наша база в Москве) и в телеграм. Развилка — в notify_user(), параметр
 * $pushBody.
 */
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
 * Уведомить пользователя всем, что есть на сервере: колокольчик, телеграм,
 * пуш на телефон.
 *
 * Появилось после разбирательства с директором, который перестал выкладывать
 * вакансии: «мне не поступали отклики соискателей, сейчас зашла — сразу 4».
 * За это время человека нашли через другую компанию, а вакансию удалили.
 *
 * Причина была в том, что уведомление директору отправлял телефон соискателя,
 * уже после того как отклик сохранён. Старая версия приложения, оборвавшаяся
 * сеть, свёрнутое приложение — и директор не узнавал ничего, а ошибка
 * глоталась молча. Уведомление о событии должен слать тот, кто это событие
 * записал, то есть сервер.
 *
 * Повтор в течение минуты отбрасываем: пока не все обновились, старые клиенты
 * продолжают слать своё уведомление, и без этого directоr получал бы по два.
 */
/**
 * Карточка кандидата директору в телеграм, с кнопками «Одобрить/Отклонить».
 *
 * Раньше её заказывал телефон соискателя отдельным запросом после отклика.
 * Теперь зовём и с сервера, сразу при создании отклика: клиент мог не дойти
 * до этого вызова — старая версия, обрыв связи, свёрнутое приложение, — и
 * директор оставался без карточки, как и без самого уведомления.
 */
function tg_new_application_card(string $employerId, string $workerId, string $vacancyId, string $vTitle): bool {
            $emp = sb_single('jm_users', ['id' => 'eq.' . $employerId], 'telegram_id');
            if (!$emp || empty($emp['telegram_id'])) return false;

            $app = sb_single('jm_perm_applications', [
                'vacancy_id' => 'eq.' . $vacancyId,
                'worker_id'  => 'eq.' . $workerId,
                'order'      => 'created_at.desc',
            ], 'id');
            if (!$app) return false;

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

            // Через общую отправку, а не своим curl: раньше это сообщение
            // шло мимо неё, а вместе с ней — мимо повтора при обрыве связи.
            // Связь с Telegram отсюда рваная, и работодатель мог не узнать
            // об отклике по той же причине, по которой не уходили
            // объявления в группу. Одна неудачная попытка — и тишина.
            return tg_send_message((int)$emp['telegram_id'], implode("\n", $lines), false, '', [
                [
                    ['text' => '✅ Одобрить', 'callback_data' => 'appok_' . $app['id']],
                    ['text' => '❌ Отклонить', 'callback_data' => 'appno_' . $app['id']],
                ],
                [['text' => '💬 Написать кандидату', 'callback_data' => 'appmsg_' . $app['id']]],
                [['text' => '👤 Открыть в JobToo', 'url' => 'https://t.me/JobToo_bot/app']],
            ]);
}


/**
 * Уведомить человека всеми каналами сразу: колокольчик, телеграм, пуш.
 *
 * $pushBody — отдельный текст для пуша, и вот почему он появился.
 *
 * Пуш уходит на exp.host, то есть в США. США нет в перечне государств,
 * обеспечивающих адекватную защиту прав субъектов персональных данных
 * (приказ Роскомнадзора № 128 от 05.08.2022, действует с 01.03.2023), —
 * а мы отправляли туда имя и фамилию работника прямо в теле уведомления:
 * «Иван Петров хочет выйти на смену». Это трансграничная передача
 * персональных данных в страну вне перечня, причём по самому строгому
 * порядку: до неё нужно отдельное уведомление РКН и выжидание срока, и
 * ведомство вправе её запретить.
 *
 * Колокольчик живёт в нашей базе в Москве, поэтому там имя остаётся: оно
 * там и полезно. Наружу уходит обезличенный вариант.
 *
 * Если $pushBody не передан, в пуш идёт обычный текст — так и должно быть
 * для сообщений, где имён нет вовсе (а таких большинство).
 */
function notify_user(string $userId, string $title, string $body, string $type = '',
                     array $data = [], ?string $pushBody = null): void {
    if ($userId === '') return;

    $since = gmdate('Y-m-d\TH:i:s\Z', time() - 60);
    $dup = sb_select('jm_notifications', [
        'user_id'    => 'eq.' . $userId,
        'title'      => 'eq.' . $title,
        'created_at' => 'gte.' . $since,
    ], 'id');
    if ($dup) return;

    $row = ['user_id' => $userId, 'title' => $title, 'body' => $body];
    if ($type !== '') $row['type'] = $type;
    try {
        sb_insert('jm_notifications', $row);
    } catch (Throwable $e) {
        // Колонки type может не быть — пишем без неё, колокольчик важнее.
        sb_insert('jm_notifications', ['user_id' => $userId, 'title' => $title, 'body' => $body]);
    }

    $u = sb_single('jm_users', ['id' => 'eq.' . $userId], 'telegram_id,push_token');
    if (!$u) return;
    if (!empty($u['telegram_id'])) {
        tg_send_message((int)$u['telegram_id'],
            '<b>' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . "</b>\n\n"
            . htmlspecialchars($body, ENT_QUOTES, 'UTF-8'), true, '🚀 Открыть JobToo');
    }
    if (!empty($u['push_token'])) {
        expo_push([[
            'to' => $u['push_token'], 'title' => $title, 'body' => $pushBody ?? $body,
            'sound' => 'default', 'priority' => 'high', 'channelId' => 'matches',
            'data' => array_merge(['type' => $type], $data),
        ]]);
    }
}


/**
 * Раз в два дня — тем, у кого рядом действительно есть смена.
 *
 * Прежнее касание работников было слепым: раз в три дня всем «в приложении
 * появились новые варианты рядом с вашим метро», без единой цифры и без
 * проверки, есть ли там что-то рядом на самом деле. Кончилось тем, что
 * 27% людей, сами подключивших телеграм, заблокировали бота.
 *
 * Здесь наоборот: если рядом ничего нет — человек не получает ничего. Молчание
 * дешевле блокировки, а «рядом» считается по остановкам на его ветке, а не по
 * тому, что обе станции есть в Москве.
 *
 * Возвращает, скольким написали и скольких промолчали — второе число тоже
 * стоит смотреть: если молчим почти всем, значит смен мало, а не рассылка
 * плохая.
 */
function shift_nudge_run(): array {
    require_once __DIR__ . '/bot_brain.php';

    $today = gmdate('Y-m-d', time() + 3 * 3600);
    $open = sb_select('jm_vacancies', ['status' => 'eq.open', 'date' => 'gte.' . $today],
        'id,title,company,work_type,metro_station,date,time_start,time_end,salary');
    if (empty($open)) return ['sent' => 0, 'silent' => 0, 'note' => 'открытых смен нет'];

    // Кому уже писали за последние два дня.
    $cut = gmdate('Y-m-d\TH:i:s\Z', time() - 2 * 86400);
    $skip = [];
    foreach (sb_select('jm_notifications',
        ['type' => 'eq.shift_nudge', 'created_at' => 'gte.' . $cut], 'user_id') as $r) {
        $skip[$r['user_id']] = true;
    }

    $workers = sb_select('jm_users', ['role' => 'eq.worker'],
        'id,first_name,metro_station,telegram_id,push_token,is_blocked,nudge_off');
    $sent = 0; $silent = 0; $pushMsgs = [];

    foreach ($workers as $w) {
        if (!empty($w['is_blocked']) || !empty($w['nudge_off'])) continue;
        if (empty($w['telegram_id']) && empty($w['push_token'])) continue;
        if (isset($skip[$w['id']])) continue;

        $st = $w['metro_station'] ?? null;
        $near = [];
        foreach ($open as $v) {
            $d = bot_stops_between($st, $v['metro_station'] ?? null);
            if ($d === null || $d > BOT_NEAR_STOPS) continue;
            $v['_stops'] = $d;
            $near[] = $v;
        }
        if (empty($near)) { $silent++; continue; }

        usort($near, fn($a, $b) => $a['_stops'] === $b['_stops']
            ? strcmp((string)$a['date'], (string)$b['date'])
            : $a['_stops'] <=> $b['_stops']);
        $near = array_slice($near, 0, 3);

        $title = count($near) === 1 ? '⚡ Смена рядом с вами' : '⚡ Смены рядом с вами';
        $list = implode("\n", array_map('bot_shift_line', $near));
        $body = $list . "\n\nОткликнуться — в приложении, в два тапа.";

        try {
            sb_insert('jm_notifications',
                ['user_id' => $w['id'], 'title' => $title, 'body' => $body, 'type' => 'shift_nudge']);
        } catch (Throwable $e) {
            sb_insert('jm_notifications', ['user_id' => $w['id'], 'title' => $title, 'body' => $body]);
        }

        if (!empty($w['telegram_id'])) {
            tg_send_message((int)$w['telegram_id'], $title . "\n\n" . $body, true);
        } else {
            // В пуше видно две строки, поэтому там только ближайшая смена.
            $pushMsgs[] = ['to' => $w['push_token'], 'title' => $title,
                'body' => ltrim(bot_shift_line($near[0]), '• '),
                'sound' => 'default', 'priority' => 'default', 'channelId' => 'vacancies',
                'data' => ['type' => 'shift_nudge']];
        }
        $sent++;
    }
    if (!empty($pushMsgs)) expo_push($pushMsgs);

    return ['sent' => $sent, 'silent' => $silent];
}

/**
 * Понедельничный пост в группу «ПОДРАБОТКИ»: актуальные постоянные вакансии,
 * сгруппированные по роли и отсортированные по убыванию зарплаты. Каждая
 * станция — ссылка, открывающая вакансию в мини-аппе. Возвращает bool.
 */
function post_weekly_perm_digest(): bool {
    $rows = sb_select('jm_perm_vacancies', ['status' => 'eq.open'],
        'id,title,work_type,metro_station,salary');
    if (empty($rows)) return false;

    // Группы в порядке вывода. Все типы работ учтены, плюс запасная «Другие».
    $groups = [
        'stocker' => ['label' => '📦 Кладовщики', 'items' => []],
        'cook' => ['label' => '👨‍🍳 Повара', 'items' => []],
        'shift_supervisor' => ['label' => '👔 Старшие смены', 'items' => []],
        'picker' => ['label' => '🧺 Сборщики', 'items' => []],
        'other' => ['label' => '💼 Другие вакансии', 'items' => []],
    ];
    foreach ($rows as $r) {
        $key = classify_work_type($r['work_type'] ?? '', $r['title'] ?? '');
        if (!isset($groups[$key])) $key = 'other';
        $groups[$key]['items'][] = $r;
    }

    $lines = [];
    $total = count($rows);
    $lines[] = "💼 <b>Постоянная работа в Лавках — {$total} " . plural_vac($total) . "</b>";
    $lines[] = "";
    $lines[] = "👉 <b>Просто нажми на нужную вакансию — и она сразу откроется у тебя прямо в Telegram.</b> Дальше откликнись в два тапа.";

    foreach ($groups as $g) {
        if (empty($g['items'])) continue;
        usort($g['items'], fn($a, $b) => (float)($b['salary'] ?? 0) <=> (float)($a['salary'] ?? 0));
        $lines[] = "";
        $lines[] = "<b>{$g['label']}:</b>";
        foreach ($g['items'] as $v) {
            $metro = $v['metro_station'] ?: ($v['title'] ?? 'Вакансия');
            $sal = ((float)($v['salary'] ?? 0)) > 0
                ? number_format((float)$v['salary'], 0, '', ' ') . ' ₽'
                : 'по договорённости';
            $url = 'https://t.me/JobToo_bot/app?startapp=vacancy_' . $v['id'];
            $lines[] = '🚇 <a href="' . $url . '">' . htmlspecialchars($metro) . ' — ' . $sal . '</a>';
        }
    }

    $lines[] = "";
    $lines[] = "Есть и подработка на день — раздел «Смены» в приложении 👇";

    $text = implode("\n", $lines);
    if (TG_GROUP_CHAT_ID === 0) return false;
    return tg_send_message(TG_GROUP_CHAT_ID, $text, true);
}

/**
 * Определяет тип работы: сначала по полю work_type, а если оно пустое
 * (старые вакансии) — по названию. Так ни одна вакансия не выпадает.
 */
function classify_work_type(string $wt, string $title): string {
    $known = ['stocker', 'cook', 'shift_supervisor', 'picker'];
    if (in_array($wt, $known, true)) return $wt;
    $t = mb_strtolower($title);
    if (mb_strpos($t, 'повар') !== false) return 'cook';
    if (mb_strpos($t, 'сборщик') !== false) return 'picker';
    if (mb_strpos($t, 'старш') !== false) return 'shift_supervisor';
    if (mb_strpos($t, 'кладовщик') !== false) return 'stocker';
    return 'other';
}

/** Склонение слова «вакансия» по числу. */
function plural_vac(int $n): string {
    $n10 = $n % 10; $n100 = $n % 100;
    if ($n10 === 1 && $n100 !== 11) return 'вакансия';
    if ($n10 >= 2 && $n10 <= 4 && ($n100 < 12 || $n100 > 14)) return 'вакансии';
    return 'вакансий';
}

/**
 * Объявить о новой смене всем работникам, у кого есть куда написать.
 *
 * Некоторое время объявление уходило только тем, кому до смены недалеко по
 * своей ветке. Причина была: за один день ушло семь сообщений подряд —
 * человеку с Новогиреево четырежды про Ховрино, — и 27% из тех, кто сам
 * подключил телеграм, бота заблокировали.
 *
 * Но адресность стоила слишком дорого. На смене в Строгино объявление ушло
 * 19 людям вместо 149: география отрезала тех, кто готов ехать, а таких
 * среди складских много — час дороги за смену это нормальная плата. Хуже
 * того, оба человека, живущие на самом Строгино, оказались без телеграма и
 * push-токена, то есть ближайшие всё равно не узнали.
 *
 * Поэтому пишем всем, а от заваливания защищаемся не расстоянием, а счётом:
 * не больше NEARBY_MAX_PER_DAY объявлений в сутки на человека. Директор
 * может выложить смены на неделю одну за другой — это не повод писать семь
 * раз. Серия на несколько дней и так шлёт одно сообщение, а не по одному
 * на дату.
 *
 * Счётчик берётся из колокольчика — и теперь это честно: колокольчик
 * получают все работники, и рассылка идёт всем работникам, значит запись в
 * колокольчике ровно соответствует попытке написать. Пока рассылка была
 * адресной, а колокольчик общим, счётчик врал: человеку с Рязанского
 * проспекта записывалась смена в Строгино, и после двух таких смен где
 * угодно в Москве он переставал получать сообщения даже про соседний дом.
 *
 * Колокольчик в приложении получают все, включая тех, кому написать некуда:
 * он ничего не требует от человека и никого не будит.
 */
const NEARBY_MAX_PER_DAY = 4;

function notify_workers(string $title, string $body,
                        string $tgHtml, string $dataType, bool|string $btnUrl = true,
                        string $vacancyMetro = '', string $vacancyWorkType = ''): array {
    $all = sb_select('jm_users', ['role' => 'eq.worker'],
        'id,metro_station,work_types,telegram_id,push_token,is_blocked,nudge_off,vacancy_delivery_mode');

    // Колокольчик — всем.
    $bell = array_map(fn($w) => ['user_id' => $w['id'], 'title' => $title,
                                 'body' => $body, 'type' => $dataType], $all);
    if (!empty($bell)) {
        try { sb_insert('jm_notifications', $bell); }
        catch (Throwable $e) {
            $plain = array_map(fn($r) => ['user_id' => $r['user_id'], 'title' => $r['title'],
                                          'body' => $r['body']], $bell);
            try { sb_insert('jm_notifications', $plain); } catch (Throwable $e2) {}
        }
    }

    // Сколько объявлений человек уже получил сегодня (по московскому дню).
    $since = gmdate('Y-m-d\T00:00:00\Z', time() + 3 * 3600);
    $seen = [];
    foreach (sb_select('jm_notifications',
        ['type' => 'in.(nearby_shift,nearby_perm)', 'created_at' => 'gte.' . $since],
        'user_id') as $r) {
        $seen[$r['user_id']] = ($seen[$r['user_id']] ?? 0) + 1;
    }

    $pushMsgs = []; $tgOk = 0; $mute = 0; $capped = 0; $filtered = 0; $webIds = [];
    foreach ($all as $w) {
        $mode = (string)($w['vacancy_delivery_mode'] ?? 'all');
        if ($mode === '') $mode = 'all';
        if (!empty($w['is_blocked']) || !empty($w['nudge_off']) || $mode === 'off') {
            $mute++; continue;
        }

        // Персонализация добровольная: пока человек ничего не выбрал, он
        // получает всё как раньше. Фильтры относятся только к внешним
        // Telegram/push сообщениям; колокольчик и общий канал сохраняют
        // полную ленту, поэтому пользователь ничего не теряет.
        $needsMetro = in_array($mode, ['metro', 'work_types_metro'], true);
        $needsWork = in_array($mode, ['work_types', 'work_types_metro'], true);
        $profileMetro = mb_strtolower(trim((string)($w['metro_station'] ?? '')));
        $targetMetro = mb_strtolower(trim($vacancyMetro));
        if ($needsMetro && ($profileMetro === '' || $targetMetro === '' || $profileMetro !== $targetMetro)) {
            $filtered++; continue;
        }
        if ($needsWork) {
            $types = $w['work_types'] ?? [];
            if (is_string($types)) {
                $decoded = json_decode($types, true);
                $types = is_array($decoded) ? $decoded : [];
            }
            $types = array_map(fn($v) => mb_strtolower(trim((string)$v)), is_array($types) ? $types : []);
            if ($vacancyWorkType === '' || !in_array(mb_strtolower(trim($vacancyWorkType)), $types, true)) {
                $filtered++; continue;
            }
        }
        // Запись про эту самую смену уже лежит в колокольчике, поэтому
        // сравниваем со строгим «больше», а не «больше или равно».
        if (($seen[$w['id']] ?? 0) > NEARBY_MAX_PER_DAY) { $capped++; continue; }

        if (!empty($w['telegram_id'])) {
            if (tg_send_message((int)$w['telegram_id'], $tgHtml, $btnUrl)) $tgOk++;
        } elseif (!empty($w['push_token'])) {
            $pushMsgs[] = ['to' => $w['push_token'], 'title' => $title, 'body' => $body,
                'sound' => 'default', 'priority' => 'high',
                'channelId' => 'vacancies', 'data' => ['type' => $dataType]];
        } else {
            // Ни телеграма, ни push-токена. Может быть подписка из браузера —
            // для четверых это единственный способ узнать о смене.
            $webIds[$w['id']] = true;
        }
    }
    if (!empty($pushMsgs)) expo_push($pushMsgs);
    $webOk = web_push_to($webIds, $title, $body, $dataType);

    return ['telegram' => $tgOk, 'push' => count($pushMsgs), 'webpush' => $webOk,
            'muted' => $mute, 'filtered' => $filtered, 'capped' => $capped, 'bell' => count($bell)];
}

/**
 * Push в браузер тем, у кого нет ни телеграма, ни приложения.
 *
 * Уходит через дашборд: ключи подписи (VAPID) лежат там, и держать их вторым
 * экземпляром здесь — лишний способ их потерять.
 */
function web_push_to(array $userIds, string $title, string $body, string $dataType): int {
    if (empty($userIds)) return 0;
    $ok = 0;
    try {
        $subs = sb_select('jm_web_push_subscriptions', [], 'user_id,endpoint,p256dh,auth');
        $appSecret = jt_secret('APP_SECRET');
        foreach ($subs as $s) {
            if (!isset($userIds[$s['user_id']]) || empty($s['endpoint'])) continue;
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
            if (is_array($dec) && ($dec['ok'] ?? false)) $ok++;
        }
    } catch (Throwable $e) {}
    return $ok;
}


// ─── JobToo Score ─────────────────────────────────────────────────────────────
//
// Рейтинг работника из фактов. Считаем на сервере и складываем в строку
// пользователя: показывать его надо всюду, где показывают человека, и
// пересчитывать это в приложении на каждом экране было бы и дорого, и
// по-разному в каждом месте.
//
// Веса. Половина — надёжность и пунктуальность: работодателю, набирающему
// два десятка человек на завтра, важнее всего, что они придут и придут
// вовремя. Четверть — оценки: это мнение, ценное, но мнение. Остальное —
// качество, скорость и опыт.
const SCORE_WEIGHTS = [
    'reliability' => 30,
    'punctuality' => 15,
    'rating'      => 25,
    'quality'     => 10,
    'speed'       => 10,
    'experience'  => 10,
];

// Меньше трёх отработанных смен — числа не показываем вовсе.
//
// Не из осторожности: у человека с одной смены выходит либо 100, либо 0, и
// оба ответа решают за работодателя на пустом месте. Пусть лучше видит
// «новичок» и решает сам.
const SCORE_MIN_SHIFTS = 3;

// К скольким сменам опыт считается набранным. Тридцать — это примерно
// полтора месяца регулярных подработок; дальше разница между сотней смен и
// тремя сотнями работодателю уже ничего не говорит.
const SCORE_EXPERIENCE_FULL = 30;

/**
 * Пересчитать рейтинг одного работника и записать в его строку.
 *
 * Возвращает то, что записал, — пригождается и вызывающему, и проверке.
 * Ошибки наружу не выпускает: пересчёт идёт следом за записью исхода смены
 * или оценки, и сорвать саму запись из-за него нельзя.
 */
function jt_recalc_score(string $uid): array {
    $out = [
        'score' => null, 'score_shifts' => 0,
        'score_reliability' => null, 'score_punctuality' => null,
        'score_quality' => null, 'score_speed' => null,
        'score_employers' => 0, 'score_updated_at' => now_iso(),
    ];
    try {
        $likes = sb_select_all('jm_likes', ['worker_id' => 'eq.' . $uid],
            'employer_id,outcome,late_minutes');

        $worked = 0; $noShow = 0; $onTime = 0; $lateKnown = 0;
        $employers = [];
        foreach ($likes as $l) {
            $o = $l['outcome'] ?? null;
            if ($o === 'worked') {
                $worked++;
                if ($l['employer_id']) $employers[(string)$l['employer_id']] = true;
                // late_minutes заполняется только с августа 2026. У смен
                // постарше его нет, и записывать их как «пришёл вовремя»
                // значило бы выдумать пунктуальность, которой не мерили.
                if ($l['late_minutes'] !== null) {
                    $lateKnown++;
                    if ((int)$l['late_minutes'] === 0) $onTime++;
                }
            } elseif ($o === 'no_show') {
                $noShow++;
            }
            // worker_cancelled: предупредил заранее — это не невыход, и в
            // надёжность не идёт. employer_cancelled и cancelled_legacy к
            // работнику отношения не имеют вовсе.
        }

        $out['score_shifts'] = $worked;
        $out['score_employers'] = count($employers);

        $ratings = sb_select_all('jm_ratings',
            ['to_user_id' => 'eq.' . $uid, 'role' => 'eq.employer'],
            'rating,quality,speed');
        // role здесь — роль оценивающего: 'employer' значит «работодатель
        // оценил работника». Оценки, которые сам работник ставил другим, в
        // его рейтинг, разумеется, не идут.
        $rSum = 0; $rN = 0; $qSum = 0; $qN = 0; $sSum = 0; $sN = 0;
        foreach ($ratings as $r) {
            if ($r['rating'] !== null) { $rSum += (float)$r['rating']; $rN++; }
            if ($r['quality'] !== null) { $qSum += (float)$r['quality']; $qN++; }
            if ($r['speed'] !== null) { $sSum += (float)$r['speed']; $sN++; }
        }

        $out['score_reliability'] = ($worked + $noShow) > 0
            ? round($worked / ($worked + $noShow), 4) : null;
        $out['score_punctuality'] = $lateKnown > 0 ? round($onTime / $lateKnown, 4) : null;
        $out['score_quality'] = $qN > 0 ? round(($qSum / $qN) / 5, 4) : null;
        $out['score_speed']   = $sN > 0 ? round(($sSum / $sN) / 5, 4) : null;

        if ($worked >= SCORE_MIN_SHIFTS) {
            $оси = [
                'reliability' => $out['score_reliability'],
                'punctuality' => $out['score_punctuality'],
                'rating'      => $rN > 0 ? ($rSum / $rN) / 5 : null,
                'quality'     => $out['score_quality'],
                'speed'       => $out['score_speed'],
                'experience'  => min(1.0, $worked / SCORE_EXPERIENCE_FULL),
            ];
            // Ось, по которой нечего сказать, не тянет вниз — она просто не
            // участвует, а её вес перераспределяется на остальные. Иначе
            // работник, которого забыли оценить, оказывался бы хуже того,
            // кого оценили на тройку.
            $вес = 0; $сумма = 0;
            foreach (SCORE_WEIGHTS as $ключ => $w) {
                if ($оси[$ключ] === null) continue;
                $вес += $w;
                $сумма += $w * max(0.0, min(1.0, (float)$оси[$ключ]));
            }
            if ($вес > 0) $out['score'] = (int)round(100 * $сумма / $вес);
        }

        sb_update('jm_users', ['id' => 'eq.' . $uid], $out);
    } catch (Throwable $e) {
        // Пересчёт — дело служебное. Смена отмечена, оценка записана; если
        // рейтинг не сошёлся, он сойдётся при следующей записи.
    }
    return $out;
}

// Репутация работодателя. Оси те же четыре, что в презентации: соответствие
// описанию, отношение, выплаты и отмены смен.
//
// Отмены — единственная ось, которую не спрашивают, а считают: с августа у
// каждой несостоявшейся смены записана причина. Спрашивать у человека то,
// что уже лежит в базе, значит получить худшие данные и заодно удлинить
// форму, которую и так половина пропускает.
const EMP_WEIGHTS = [
    'kept'     => 30,   // не отменяет смены
    'pay'      => 30,   // платит вовремя
    'desc'     => 20,   // работа совпала с описанием
    'attitude' => 20,   // отношение к людям
];
const EMP_MIN_SHIFTS = 3;

function jt_recalc_employer_score(string $uid): array {
    $out = [
        'emp_score' => null, 'emp_score_shifts' => 0,
        'emp_sco…23549 tokens truncated…      $event = $eventId !== '' ? sb_single('jm_partner_billable_events',
                ['id' => 'eq.' . $eventId], 'id,source_id,application_id,status') : null;
            if (!$event) { $data = ['error' => 'Оплачиваемое событие не найдено']; break; }
            $issue = pb_reconciliation_issue($event, [
                'status' => (string)($v['partner_status'] ?? ''),
                'reason_code' => (string)($v['reason_code'] ?? 'status_mismatch'),
                'reason_text' => $v['reason_text'] ?? null,
            ]);
            if ($issue === null) { $data = ['created' => false, 'reason' => 'statuses_match']; break; }
            $issue['id'] = uid();
            try { sb_insert('jm_partner_reconciliation_issues', $issue); }
            catch (Throwable $e) {
                if (stripos($e->getMessage(), 'duplicate') === false
                    && stripos($e->getMessage(), 'unique') === false) throw $e;
            }
            $data = ['created' => true, 'issue' => $issue]; break;
        }

        case 'partnerConsentRecord': {
            $v = is_array($args[0] ?? null) ? $args[0] : [];
            if ($authUid === null || (string)($v['worker_id'] ?? '') !== $authUid) {
                $data = ['error' => 'Нельзя записать согласие за другого пользователя']; break;
            }
            $required = ['source_id','worker_id','ext_vacancy_id','recipient_name','consent_version'];
            foreach ($required as $key) {
                if (trim((string)($v[$key] ?? '')) === '') {
                    $data = ['error' => 'Не заполнено поле согласия: ' . $key]; break 2;
                }
            }
            $categories = is_array($v['data_categories'] ?? null)
                ? array_values(array_intersect($v['data_categories'], ['profile','application','messages','statuses'])) : [];
            if (!$categories) { $data = ['error' => 'Не указан состав передаваемых данных']; break; }
            $row = [
                'id' => uid(), 'source_id' => (string)$v['source_id'],
                'worker_id' => (string)$v['worker_id'], 'ext_vacancy_id' => (string)$v['ext_vacancy_id'],
                'application_id' => $v['application_id'] ?? null,
                'recipient_name' => (string)$v['recipient_name'], 'data_categories' => $categories,
                'purpose' => trim((string)($v['purpose'] ?? '')) ?: 'Передача отклика, сообщений и статусов по выбранной смене',
                'consent_version' => (string)$v['consent_version'], 'accepted_at' => now_iso(),
                'evidence' => [
                    'ip_hash' => isset($v['ip']) ? hash('sha256', (string)$v['ip']) : null,
                    'user_agent' => substr((string)($v['user_agent'] ?? ''), 0, 300),
                ],
            ];
            $previous = sb_single('jm_partner_data_consents', [
                'source_id' => 'eq.' . $row['source_id'], 'worker_id' => 'eq.' . $row['worker_id'],
                'ext_vacancy_id' => 'eq.' . $row['ext_vacancy_id'],
                'consent_version' => 'eq.' . $row['consent_version'],
            ], 'id');
            if ($previous) {
                $row['id'] = $previous['id'];
                $row['revoked_at'] = null;
                sb_upsert('jm_partner_data_consents', $row, 'id');
            } else {
                sb_insert('jm_partner_data_consents', $row);
            }
            $data = ['recorded' => true, 'consent_version' => $row['consent_version']]; break;
        }

        // SuperJob OAuth начинается только для вошедшего пользователя. В state
        // нет user_id — наружу уходит случайная строка, а в базе лежит её хеш.
        case 'superjobOauthStart': {
            if ($authUid === null) throw new RuntimeException('Нужна авторизация JobToo');
            $clientId = sjo_cfg('SUPERJOB_CLIENT_ID');
            if ($clientId === '' || sjo_client_secret() === '') {
                throw new RuntimeException('SuperJob OAuth ещё не настроен');
            }
            $state = jt_b64url_encode(random_bytes(32));
            $returnUrl = trim((string)($args[0] ?? ''));
            if (!preg_match('~^(?:https://jobtoo\.ru/|onspaceapp://)~i', $returnUrl)) {
                $returnUrl = 'https://jobtoo.ru/';
            }
            sb_insert('jm_superjob_oauth_states', [
                'state_hash' => hash('sha256', $state),
                'worker_id' => $authUid,
                'return_url' => $returnUrl,
                'expires_at' => gmdate('Y-m-d\TH:i:s', time() + 600) . '.000Z',
            ]);
            $redirectUri = 'https://jobtoo.ru/api/superjob_oauth.php';
            $data = ['url' => 'https://www.superjob.ru/authorize/?' . http_build_query([
                'client_id' => $clientId,
                'redirect_uri' => $redirectUri,
                'state' => $state,
            ], '', '&', PHP_QUERY_RFC3986)];
            break;
        }

        case 'superjobOauthStatus': {
            if ($authUid === null) { $data = ['connected' => false]; break; }
            $connection = sb_single('jm_superjob_connections', ['worker_id' => 'eq.' . $authUid],
                'resume_id,expires_at,connected_at,last_error');
            $data = $connection ? [
                'connected' => true,
                'has_resume' => !empty($connection['resume_id']),
                'connected_at' => $connection['connected_at'] ?? null,
                'last_error' => $connection['last_error'] ?? null,
            ] : ['connected' => false];
            break;
        }

        case 'superjobOauthDisconnect': {
            if ($authUid === null) throw new RuntimeException('Нужна авторизация JobToo');
            sb_delete('jm_superjob_connections', ['worker_id' => 'eq.' . $authUid]);
            $data = ['disconnected' => true];
            break;
        }

        // Отправляем только ID резюме, выбранный самим SuperJob как основной,
        // и ID вакансии из нашей серверной копии. Клиент не может подставить их.
        case 'superjobApply': {
            $v = is_array($args[0] ?? null) ? $args[0] : [];
            $vacancyId = trim((string)($v['ext_vacancy_id'] ?? ''));
            $consentVersion = trim((string)($v['consent_version'] ?? ''));
            $comment = mb_substr(trim((string)($v['comment'] ?? '')), 0, 1000);
            if ($authUid === null || $vacancyId === '' || $consentVersion === '') {
                throw new RuntimeException('Не хватает данных для отклика');
            }
            $vacancy = sb_single('jm_ext_vacancies', [
                'id' => 'eq.' . $vacancyId, 'source_id' => 'eq.superjob',
                'active' => 'is.true', 'environment' => 'eq.production',
            ], 'id,external_id');
            $consent = sb_single('jm_partner_data_consents', [
                'source_id' => 'eq.superjob', 'worker_id' => 'eq.' . $authUid,
                'ext_vacancy_id' => 'eq.' . $vacancyId,
                'consent_version' => 'eq.' . $consentVersion, 'revoked_at' => 'is.null',
            ], 'id');
            if (!$vacancy || !$consent) throw new RuntimeException('Вакансия или согласие не найдены');

            $existing = sb_single('jm_partner_applications', [
                'source_id' => 'eq.superjob', 'worker_id' => 'eq.' . $authUid,
                'ext_vacancy_id' => 'eq.' . $vacancyId,
            ], 'id,status');
            if ($existing && ($existing['status'] ?? '') !== 'failed') {
                $data = ['id' => $existing['id'], 'status' => $existing['status'], 'created' => false]; break;
            }
            $connection = sb_single('jm_superjob_connections', ['worker_id' => 'eq.' . $authUid]);
            if (!$connection) throw new RuntimeException('Подключите аккаунт SuperJob');
            if (empty($connection['resume_id'])) throw new RuntimeException('В SuperJob нет основного резюме');

            try {
                $access = sjo_decrypt((string)$connection['access_token_enc'], SB_KEY);
                if (strtotime((string)$connection['expires_at']) <= time() + 60) {
                    $refresh = sjo_decrypt((string)$connection['refresh_token_enc'], SB_KEY);
                    $token = sjo_request('GET', 'https://api.superjob.ru/2.0/oauth2/refresh_token/?' . http_build_query([
                        'refresh_token' => $refresh,
                        'client_id' => sjo_cfg('SUPERJOB_CLIENT_ID'),
                        'client_secret' => sjo_client_secret(),
                    ], '', '&', PHP_QUERY_RFC3986));
                    $access = (string)($token['access_token'] ?? '');
                    $newRefresh = (string)($token['refresh_token'] ?? $refresh);
                    if ($access === '') throw new RuntimeException('SuperJob did not refresh the token');
                    $ttl = (int)($token['ttl'] ?? 0);
                    $expires = $ttl > time() ? $ttl : time() + max(300, (int)($token['expires_in'] ?? 3600));
                    sb_update('jm_superjob_connections', ['worker_id' => 'eq.' . $authUid], [
                        'access_token_enc' => sjo_encrypt($access, SB_KEY),
                        'refresh_token_enc' => sjo_encrypt($newRefresh, SB_KEY),
                        'expires_at' => gmdate('Y-m-d\TH:i:s', $expires) . '.000Z',
                        'updated_at' => now_iso(), 'last_error' => null,
                    ]);
                }
                sjo_request('POST', 'https://api.superjob.ru/2.0/send_cv_on_vacancy/', [
                    'id_cv' => (string)$connection['resume_id'],
                    'id_vacancy' => (string)$vacancy['external_id'],
                    'comment' => $comment,
                ], $access);
                $applicationId = $existing['id'] ?? uid();
                sb_upsert('jm_partner_applications', [
                    'id' => $applicationId, 'source_id' => 'superjob',
                    'ext_vacancy_id' => $vacancyId, 'worker_id' => $authUid,
                    'status' => 'submitted', 'consent_version' => $consentVersion,
                    'failure_code' => null, 'failure_message' => null,
                    'updated_at' => now_iso(), 'partner_updated_at' => now_iso(),
                ], 'id');
                $data = ['id' => $applicationId, 'status' => 'submitted', 'created' => !$existing];
            } catch (Throwable $e) {
                sb_update('jm_superjob_connections', ['worker_id' => 'eq.' . $authUid], [
                    'last_error' => mb_substr($e->getMessage(), 0, 300), 'updated_at' => now_iso(),
                ]);
                throw new RuntimeException('SuperJob не принял отклик. Попробуйте ещё раз.');
            }
            break;
        }

        // Отклик внутри JobToo доступен только для боевой embedded-интеграции.
        // В очередь кладём непрозрачные ID; профиль партнёру собирает уже
        // серверный адаптер, поэтому клиент не может подменить персональные данные.
        case 'partnerApplicationCreate': {
            $v = is_array($args[0] ?? null) ? $args[0] : [];
            $workerId = trim((string)($v['worker_id'] ?? ''));
            $sourceId = trim((string)($v['source_id'] ?? ''));
            $vacancyId = trim((string)($v['ext_vacancy_id'] ?? ''));
            $consentVersion = trim((string)($v['consent_version'] ?? ''));
            if ($authUid === null || $workerId === '' || $workerId !== $authUid) {
                $data = ['error' => 'Нельзя отправить отклик за другого пользователя']; break;
            }
            if ($sourceId === '' || $vacancyId === '' || $consentVersion === '') {
                $data = ['error' => 'Не хватает данных для отклика']; break;
            }
            $source = sb_single('jm_ext_sources', [
                'id' => 'eq.' . $sourceId, 'enabled' => 'is.true',
                'environment' => 'eq.production', 'integration_mode' => 'eq.embedded',
            ], 'id');
            $vacancy = sb_single('jm_ext_vacancies', [
                'id' => 'eq.' . $vacancyId, 'source_id' => 'eq.' . $sourceId,
                'active' => 'is.true', 'environment' => 'eq.production',
            ], 'id');
            if (!$source || !$vacancy) {
                $data = ['error' => 'Встроенный отклик для этой вакансии недоступен']; break;
            }
            $existing = sb_single('jm_partner_applications', [
                'source_id' => 'eq.' . $sourceId, 'ext_vacancy_id' => 'eq.' . $vacancyId,
                'worker_id' => 'eq.' . $workerId,
            ], 'id,status');
            if ($existing) {
                try {
                    sb_insert('jm_partner_outbox', [
                        'id' => uid(), 'source_id' => $sourceId,
                        'aggregate_type' => 'application', 'aggregate_id' => $existing['id'],
                        'event_kind' => 'application.submit',
                        'idempotency_key' => 'application.submit:' . $existing['id'],
                        'payload' => ['application_id' => $existing['id'], 'ext_vacancy_id' => $vacancyId],
                        'delivery_status' => 'pending', 'attempts' => 0,
                        'next_attempt_at' => now_iso(), 'created_at' => now_iso(),
                    ]);
                } catch (Throwable $e) {
                    if (stripos($e->getMessage(), 'duplicate') === false
                        && stripos($e->getMessage(), 'unique') === false) throw $e;
                }
                $data = ['id' => $existing['id'], 'status' => $existing['status'], 'created' => false]; break;
            }
            $consent = sb_single('jm_partner_data_consents', [
                'source_id' => 'eq.' . $sourceId, 'worker_id' => 'eq.' . $workerId,
                'ext_vacancy_id' => 'eq.' . $vacancyId, 'consent_version' => 'eq.' . $consentVersion,
                'revoked_at' => 'is.null',
            ], 'id');
            if (!$consent) { $data = ['error' => 'Сначала подтвердите передачу данных партнёру']; break; }

            $applicationId = uid();
            $createdAt = now_iso();
            try {
                sb_insert('jm_partner_applications', [
                    'id' => $applicationId, 'source_id' => $sourceId,
                    'ext_vacancy_id' => $vacancyId, 'worker_id' => $workerId,
                    'status' => 'local_created', 'status_version' => 1,
                    'consent_version' => $consentVersion,
                    'created_at' => $createdAt, 'updated_at' => $createdAt,
                ]);
                sb_insert('jm_partner_outbox', [
                    'id' => uid(), 'source_id' => $sourceId,
                    'aggregate_type' => 'application', 'aggregate_id' => $applicationId,
                    'event_kind' => 'application.submit',
                    'idempotency_key' => 'application.submit:' . $applicationId,
                    'payload' => ['application_id' => $applicationId, 'ext_vacancy_id' => $vacancyId],
                    'delivery_status' => 'pending', 'attempts' => 0,
                    'next_attempt_at' => $createdAt, 'created_at' => $createdAt,
                ]);
                sb_update('jm_partner_data_consents', ['id' => 'eq.' . $consent['id']], [
                    'application_id' => $applicationId,
                ]);
            } catch (Throwable $e) {
                $existing = sb_single('jm_partner_applications', [
                    'source_id' => 'eq.' . $sourceId, 'ext_vacancy_id' => 'eq.' . $vacancyId,
                    'worker_id' => 'eq.' . $workerId,
                ], 'id,status');
                if (!$existing) throw $e;
                $data = ['id' => $existing['id'], 'status' => $existing['status'], 'created' => false]; break;
            }
            $data = ['id' => $applicationId, 'status' => 'local_created', 'created' => true]; break;
        }

        case 'partnerApplicationsGet': {
            $workerId = trim((string)($args[0] ?? ''));
            if ($authUid === null || $workerId === '' || $workerId !== $authUid) {
                $data = ['error' => 'Нельзя читать чужие отклики']; break;
            }
            $rows = sb_select('jm_partner_applications', [
                'worker_id' => 'eq.' . $workerId,
            ], 'id,source_id,ext_vacancy_id,worker_id,status,created_at,updated_at', 'updated_at.desc');
            $vacancyIds = [];
            $sourceIds = [];
            foreach ($rows as $row) {
                $vacancyIds[(string)$row['ext_vacancy_id']] = true;
                $sourceIds[(string)$row['source_id']] = true;
            }
            $vacancies = [];
            if ($vacancyIds) {
                foreach (sb_select('jm_ext_vacancies', [
                    'id' => 'in.(' . implode(',', array_keys($vacancyIds)) . ')',
                ], 'id,title,company,address,salary,pay_period') as $vacancy) {
                    $vacancies[(string)$vacancy['id']] = $vacancy;
                }
            }
            $sources = [];
            if ($sourceIds) {
                foreach (sb_select('jm_ext_sources', [
                    'id' => 'in.(' . implode(',', array_keys($sourceIds)) . ')',
                ], 'id,name') as $source) {
                    $sources[(string)$source['id']] = $source['name'];
                }
            }
            foreach ($rows as &$row) {
                $vacancy = $vacancies[(string)$row['ext_vacancy_id']] ?? [];
                $row['title'] = $vacancy['title'] ?? null;
                $row['company'] = $vacancy['company'] ?? null;
                $row['address'] = $vacancy['address'] ?? null;
                $row['salary'] = $vacancy['salary'] ?? null;
                $row['pay_period'] = $vacancy['pay_period'] ?? null;
                $row['source_name'] = $sources[(string)$row['source_id']] ?? null;
            }
            unset($row);
            $data = $rows; break;
        }

        case 'partnerBillingReport': {
            $sourceId = trim((string)($args[0] ?? ''));
            $from = trim((string)($args[1] ?? ''));
            $to = trim((string)($args[2] ?? ''));
            if ($sourceId === '' || !preg_match('~^\\d{4}-\\d{2}-\\d{2}$~', $from)
                || !preg_match('~^\\d{4}-\\d{2}-\\d{2}$~', $to)) {
                $data = ['error' => 'Нужны источник и границы периода']; break;
            }
            $events = sb_select_all('jm_partner_billable_events', [
                'source_id' => 'eq.' . $sourceId,
                'occurred_at' => 'gte.' . $from . 'T00:00:00Z',
                'and' => '(occurred_at.lt.' . $to . 'T23:59:59Z)',
            ], 'id,source_id,application_id,worker_id,ext_vacancy_id,partner_event_id,event_kind,occurred_at,amount_rub,status,partner_status,rejection_reason');
            $issues = sb_select_all('jm_partner_reconciliation_issues', [
                'source_id' => 'eq.' . $sourceId,
                'detected_at' => 'gte.' . $from . 'T00:00:00Z',
            ], 'id,billable_event_id,local_status,partner_status,reason_code,reason_text,resolution_status,detected_at,resolved_at');
            $approved = array_values(array_filter($events, fn($e) => in_array($e['status'] ?? '', ['approved','invoiced','paid'], true)));
            $amount = array_sum(array_map(fn($e) => (float)($e['amount_rub'] ?? 0), $approved));
            $data = [
                'source_id' => $sourceId, 'period_start' => $from, 'period_end' => $to,
                'events' => $events, 'discrepancies' => $issues,
                'summary' => [
                    'events' => count($events), 'approved' => count($approved),
                    'rejected' => count(array_filter($events, fn($e) => ($e['status'] ?? '') === 'rejected')),
                    'open_discrepancies' => count(array_filter($issues, fn($i) => ($i['resolution_status'] ?? '') === 'open')),
                    'amount_rub' => round($amount, 2),
                ],
            ];
            break;
        }

        case 'partnerReportSnapshotSave': {
            $v = is_array($args[0] ?? null) ? $args[0] : [];
            $required = ['source_id','period_start','period_end','checksum_sha256'];
            foreach ($required as $key) {
                if (trim((string)($v[$key] ?? '')) === '') {
                    $data = ['error' => 'Не заполнено поле отчёта: ' . $key]; break 2;
                }
            }
            $row = [
                'id' => trim((string)($v['id'] ?? '')) ?: uid(),
                'source_id' => (string)$v['source_id'],
                'period_start' => (string)$v['period_start'],
                'period_end' => (string)$v['period_end'],
                'status' => 'generated',
                'event_count' => max(0, (int)($v['event_count'] ?? 0)),
                'amount_rub' => max(0, round((float)($v['amount_rub'] ?? 0), 2)),
                'approved_count' => max(0, (int)($v['approved_count'] ?? 0)),
                'rejected_count' => max(0, (int)($v['rejected_count'] ?? 0)),
                'discrepancy_count' => max(0, (int)($v['discrepancy_count'] ?? 0)),
                'checksum_sha256' => (string)$v['checksum_sha256'],
                'generated_at' => now_iso(),
            ];
            sb_upsert('jm_partner_report_runs', $row, 'source_id,period_start,period_end');
            $data = ['saved' => true, 'report' => $row]; break;
        }


        // ── Ключи внешнего API ─────────────────────────────────────────────
        //
        // Управление отсюда, а не правкой таблицы руками: ключ, выданный в
        // обход учёта, живёт вечно и без имени — а потом ищи, чей он.
        case 'apiKeysList': {
            $rows = sb_select('jm_api_keys', ['order' => 'created_at.desc'],
                'id,name,scopes,created_at,revoked_at,last_used_at,hits,rate_limit');
            $data = $rows; break;
        }

        // Ключ показывается ровно один раз — здесь, в ответе. В базе только
        // отпечаток, так что «покажи ещё раз» невозможно даже для нас. Это
        // неудобно один раз при выдаче и спасает при утечке базы.
        case 'apiKeyCreate': {
            $name = trim((string)($args[0] ?? ''));
            if ($name === '') { $data = ['error' => 'нужно имя']; break; }
            $scopes = is_array($args[1] ?? null) && $args[1] ? $args[1] : ['vacancies:read'];
            $limit = (int)($args[2] ?? 1000);

            $secret = 'jt_' . bin2hex(random_bytes(24));
            sb_insert('jm_api_keys', [
                'id' => uid(),
                'name' => $name,
                'key_hash' => hash('sha256', $secret),
                'scopes' => $scopes,
                'rate_limit' => $limit,
                'created_at' => now_iso(),
            ]);
            $data = ['key' => $secret, 'name' => $name, 'scopes' => $scopes];
            break;
        }

        // Отзыв отметкой, а не удалением: строка нужна, чтобы через полгода
        // можно было ответить, кто и когда выгружал наши вакансии.
        case 'apiKeyRevoke': {
            $id = (string)($args[0] ?? '');
            if ($id === '') { $data = ['error' => 'нужен id']; break; }
            sb_update('jm_api_keys', ['id' => 'eq.' . $id], ['revoked_at' => now_iso()]);
            $data = ['ok' => true]; break;
        }

        // Кому бот пересылает то, что люди пишут ему в личку.
        case 'botAdminGet':
            $data = sb_single('jm_settings', ['key' => 'eq.admin_chat_id'], 'value'); break;

        case 'botAdminSet': {
            $v = trim((string)($args[0] ?? ''));
            if ($v === '') { sb_delete('jm_settings', ['key' => 'eq.admin_chat_id']); $data = null; break; }
            sb_upsert('jm_settings', ['key' => 'admin_chat_id', 'value' => $v, 'updated_at' => now_iso()], 'key');
            $data = $v; break;
        }

        // ── Поддержка ──────────────────────────────────────────────────────
        //
        // Тред один на человека: заводить тикеты с номерами значит заставлять
        // объяснять всё заново каждый раз.
        //
        // Часы работы честные. Обещать круглосуточный ответ и молчать до утра
        // хуже, чем сразу сказать, когда ответят: человек не сидит и не ждёт.

        case 'supportHistory':
            $data = sb_select('jm_support_messages', ['user_id' => 'eq.' . (string)($args[0] ?? '')],
                'id,direction,text,created_at', 'created_at.asc'); break;

        // Закрыть обращение: прощальное слово человеку + отметка «закрыто».
        //
        // Текст обязателен и приходит из дашборда: закрывать молча — значит
        // оборвать разговор на полуслове, а человек не знает, ждать ему ещё
        // или нет. Отметка отдельно от переписки (см. 023_support_close.sql).
        case 'supportClose': {
            $uid = (string)($args[0] ?? '');
            $text = trim((string)($args[1] ?? ''));
            if ($uid === '') { $data = ['ok' => false, 'reason' => 'no_user']; break; }
            if ($text !== '') {
                sb_insert('jm_support_messages', [
                    'id' => uid(), 'user_id' => $uid, 'direction' => 'out',
                    'text' => $text, 'created_at' => now_iso(),
                ]);
                notify_user($uid, '🆘 Ответ поддержки', $text, 'support');
            }
            $marked = support_thread_set($uid, now_iso());
            $data = ['ok' => true, 'marked' => $marked]; break;
        }

        // Снова открыть — если закрыли по ошибке.
        case 'supportReopen': {
            $uid = (string)($args[0] ?? '');
            if ($uid === '') { $data = ['ok' => false]; break; }
            $marked = support_thread_set($uid, null);
            $data = ['ok' => true, 'marked' => $marked]; break;
        }

        case 'supportSend': {
            $uid = (string)($args[0] ?? '');
            $text = trim((string)($args[1] ?? ''));
            if ($uid === '' || $text === '') { $data = ['ok' => false]; break; }

            // Написал снова — обращение снова открыто, даже если мы его
            // закрывали. Иначе человек пишет в пустоту: у нас в списке
            // «закрыто», а он ждёт ответа.
            support_thread_set($uid, null);

            sb_insert('jm_support_messages', [
                'id' => uid(), 'user_id' => $uid, 'direction' => 'in',
                'text' => $text, 'created_at' => now_iso(),
            ]);

            // Никите — в телеграм, сразу и с контекстом. Без этого обращение
            // лежало бы в базе, пока кто-нибудь не откроет дашборд.
            $adm = sb_single('jm_settings', ['key' => 'eq.admin_chat_id'], 'value');
            if ($adm && !empty($adm['value'])) {
                $u = sb_single('jm_users', ['id' => 'eq.' . $uid],
                    'first_name,last_name,phone,role,metro_station');
                $who = trim(($u['first_name'] ?? '') . ' ' . ($u['last_name'] ?? '')) ?: 'Без имени';
                $meta = array_filter([$u['role'] ?? null, $u['phone'] ?? null, $u['metro_station'] ?? null]);
                $prev = sb_select('jm_support_messages', ['user_id' => 'eq.' . $uid],
                    'direction,text,created_at', 'created_at.desc');
                $first = count($prev) <= 1;
                tg_send_message((int)$adm['value'],
                    "🆘 <b>Поддержка</b> — " . htmlspecialchars($who, ENT_QUOTES, 'UTF-8')
                    . ($meta ? "\n" . htmlspecialchars(implode(' · ', $meta), ENT_QUOTES, 'UTF-8') : '')
                    . ($first ? "\n<i>Пишет впервые.</i>" : '')
                    . "\n\n" . htmlspecialchars($text, ENT_QUOTES, 'UTF-8')
                    . "\n\n<i>Ответить — в дашборде, раздел «Поддержка».</i>",
                    DASHBOARD_URL . '/support', '🖥 Открыть дашборд');
            }

            // Вне часов работы — сразу говорим, когда ответим.
            $hour = (int)gmdate('G', time() + 3 * 3600);
            if ($hour < SUPPORT_FROM_HOUR || $hour >= SUPPORT_TO_HOUR) {
                sb_insert('jm_support_messages', [
                    'id' => uid(), 'user_id' => $uid, 'direction' => 'out',
                    'text' => 'Спасибо, получили! Поддержка отвечает с '
                        . SUPPORT_FROM_HOUR . ':00 до ' . SUPPORT_TO_HOUR . ':00 по Москве — '
                        . 'ответим, как начнём. Если вопрос срочный, напишите об этом здесь же.',
                    'created_at' => now_iso(),
                ]);
            }
            $data = ['ok' => true]; break;
        }

        // Ответ поддержки. Человеку — всеми каналами: он ждёт именно его.
        case 'supportReply': {
            $uid = (string)($args[0] ?? '');
            $text = trim((string)($args[1] ?? ''));
            if ($uid === '' || $text === '') { $data = ['ok' => false]; break; }
            sb_insert('jm_support_messages', [
                'id' => uid(), 'user_id' => $uid, 'direction' => 'out',
                'text' => $text, 'created_at' => now_iso(),
            ]);
            notify_user($uid, '🆘 Ответ поддержки', $text, 'support');
            $data = ['ok' => true]; break;
        }

        // Все обращения для дашборда — свежие сверху.
        case 'supportThreads':
            $data = sb_select('jm_support_messages', [], 'id,user_id,direction,text,created_at',
                'created_at.desc'); break;

        // Ответить человеку из дашборда — от имени бота.
        //
        // Отвечать реплаем в телеграме удобно, пока разговоров пять. Когда их
        // становится двадцать, нужен список, где видно, кто ждёт, — и отвечать
        // логично там же, а не перепрыгивая в другое приложение и обратно.
        // Ответ ложится в тот же журнал: иначе через день не вспомнить, что
        // уже сказано, и человек получит то же самое дважды.
        case 'botReply': {
            $tg = (int)($args[0] ?? 0);
            $text = trim((string)($args[1] ?? ''));
            if ($tg <= 0 || $text === '') { $data = ['ok' => false, 'reason' => 'empty']; break; }

            $ok = tg_send_message($tg, $text);
            if ($ok) {
                try {
                    sb_insert('jm_bot_messages', [
                        'id' => uid(), 'telegram_id' => $tg, 'direction' => 'out',
                        'name' => 'Никита', 'topic' => 'admin',
                        'text' => $text, 'created_at' => now_iso(),
                    ]);
                } catch (Throwable $e) {}
                sb_update('jm_bot_messages',
                    ['telegram_id' => 'eq.' . $tg, 'answered' => 'is.false'], ['answered' => true]);
            }
            $data = ['ok' => $ok, 'reason' => $ok ? '' : 'telegram_failed'];
            break;
        }

        // Ящик входящих боту — для дашборда.
        case 'botInbox':
            $data = sb_select('jm_bot_messages', ['limit' => (string)((int)($args[0] ?? 100))],
                '*', 'created_at.desc'); break;

        // args: [userId] — отвязать Telegram от аккаунта
        case 'tgUnbindTelegram': {
            sb_update('jm_users', ['id' => 'eq.' . $args[0]], ['telegram_id' => null]);
            $data = true;
            break;
        }

        // args: [userId, text] — message the user's linked Telegram account
        case 'tgNotifyUser': {
            $u = sb_single('jm_users', ['id' => 'eq.' . $args[0]], 'telegram_id');
            $btn = isset($args[2]) && $args[2] ? true : false; // показать кнопку «Открыть JobToo»
            $data = ($u && !empty($u['telegram_id']))
                ? tg_send_message((int)$u['telegram_id'], (string)$args[1], $btn, '🚀 Открыть JobToo')
                : false;
            break;
        }

        // ── Vacancies ──────────────────────────────────────────────────────────
        case 'dbGetVacancies':
            $data = sb_select('jm_vacancies', [], '*', 'created_at.desc'); break;

        case 'dbUpsertVacancy':
            vacancy_dates_guard([$args[0]]);
            vacancy_content_guard($args[0]);
            save_then_geocode('jm_vacancies', $args[0]); break;

        case 'dbUpsertVacancyBatch': {
            // $args[0] — массив строк вакансий, пишется одним запросом.
            // Один адрес на всю пачку смен, поэтому геокодируем его однажды.
            $rows = $args[0];
            vacancy_dates_guard($rows);
            $cache = [];
            foreach ($rows as $k => $r) {
                vacancy_content_guard($r);
                $a = trim((string)($r['address'] ?? ''));
                if ($a === '' || (isset($r['lat']) && $r['lat'] !== null)) continue;
                if (!array_key_exists($a, $cache)) $cache[$a] = fill_coords($r);
                $rows[$k]['lat'] = $cache[$a]['lat'] ?? null;
                $rows[$k]['lng'] = $cache[$a]['lng'] ?? null;
            }
            sb_upsert('jm_vacancies', $rows, 'id'); break;
        }

        case 'dbUpdateVacancy':
            // Если правят адрес, координаты пересчитываем: иначе метка
            // осталась бы висеть на старом месте.
            vacancy_dates_guard([$args[1]]);
            vacancy_content_guard($args[1]);
            sb_update('jm_vacancies', ['id' => 'eq.' . $args[0]], fill_coords($args[1])); break;

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

        case 'dbLogOpen': {
            // Событие «открыл приложение». args: [anon_id, user_id|null, role|null, platform|null]
            $anon = isset($args[0]) ? (string)$args[0] : '';
            if ($anon === '') { $data = false; break; }
            sb('POST', 'jm_app_opens', [], [
                'anon_id'   => $anon,
                'user_id'   => $args[1] ?? null,
                'role'      => $args[2] ?? null,
                'platform'  => $args[3] ?? null,
                'opened_at' => now_iso(),
            ], ['Prefer: return=minimal']);
            $data = true;
            break;
        }

        case 'guestEvent': {
            // Гостевая воронка: только случайный идентификатор и строгий набор
            // технических полей. Произвольный payload и персональные данные не принимаем.
            $anon = trim((string)($args[0] ?? ''));
            $event = (string)($args[1] ?? '');
            $vacancyId = isset($args[2]) ? trim((string)$args[2]) : '';
            $kind = isset($args[3]) ? (string)$args[3] : '';
            $sourceId = isset($args[4]) ? trim((string)$args[4]) : '';
            $platform = isset($args[5]) ? (string)$args[5] : '';
            $campaignId = isset($args[6]) ? trim((string)$args[6]) : '';
            $channel = isset($args[7]) ? (string)$args[7] : '';

            $events = ['guest_started', 'vacancy_impression', 'apply_intent',
                'registration_started', 'registration_completed', 'external_click',
                'campaign_published', 'campaign_open', 'campaign_apply', 'campaign_shared'];
            $kinds = ['', 'shift', 'permanent', 'external'];
            $platforms = ['', 'web', 'ios', 'android', 'windows', 'macos'];
            $channels = ['', 'telegram_group', 'telegram_dm', 'user_share'];
            if ($anon === '' || strlen($anon) > 128 || !preg_match('/^[A-Za-z0-9._:-]+$/', $anon)
                || !in_array($event, $events, true)
                || !in_array($kind, $kinds, true)
                || !in_array($platform, $platforms, true)
                || !in_array($channel, $channels, true)
                || strlen($vacancyId) > 160 || strlen($sourceId) > 160
                || strlen($campaignId) > 64
                || ($campaignId !== '' && !preg_match('/^[A-Za-z0-9-]+$/', $campaignId))) {
                jt_respond(['error' => 'Invalid guest analytics event'], 400); exit;
            }

            sb('POST', 'jm_guest_events', [], [
                'id' => uid(),
                'anon_id' => $anon,
                'event_type' => $event,
                'vacancy_id' => $vacancyId !== '' ? $vacancyId : null,
                'vacancy_kind' => $kind !== '' ? $kind : null,
                'source_id' => $sourceId !== '' ? $sourceId : null,
                'platform' => $platform !== '' ? $platform : null,
                'campaign_id' => $campaignId !== '' ? $campaignId : null,
                'channel' => $channel !== '' ? $channel : null,
                'occurred_at' => now_iso(),
            ], ['Prefer: return=minimal']);
            $data = true;
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

            // Директору об отклике на смену — тоже отсюда. Тот же случай, что
            // и с постоянными вакансиями: раньше сообщение слал телефон
            // соискателя уже после записи, и терялось оно молча.
            $justApplied = !empty($row['worker_liked']) && empty($base['worker_liked']);
            if ($justApplied && !empty($eid)) {
                $w = sb_single('jm_users', ['id' => 'eq.' . $wid], 'first_name,last_name');
                $v = sb_single('jm_vacancies', ['id' => 'eq.' . $vid], 'title');
                $wName = trim(($w['first_name'] ?? '') . ' ' . ($w['last_name'] ?? '')) ?: 'Кандидат';
                $vTitle = (string)($v['title'] ?? 'смена');
                notify_user((string)$eid, '📥 Новый отклик!',
                    $wName . ' хочет выйти на смену «' . $vTitle . '». Посмотрите кандидата!',
                    'new_applicant', [],
                    // В пуш — без имени: он уходит за границу. Директор всё
                    // равно открывает приложение, чтобы посмотреть кандидата,
                    // и имя в шторке ничего не решает.
                    'Кто-то хочет выйти на смену «' . $vTitle . '». Посмотрите кандидата!');
            }
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
            msg_insert($msg);
            $data = $msg; break;
        }

        // ── Файлы ──────────────────────────────────────────────────────────────
        // Аватары, фотографии и голосовые из чатов.
        //
        // Раньше приложение клало их в хранилище само, ключом, который лежит
        // в каждой установленной сборке. Чтобы это работало, тому ключу нужно
        // право записи — то есть любой, кто достанет его из сборки, мог бы
        // залить в наше хранилище что угодно и сколько угодно.
        //
        // Теперь файл идёт сюда, а отсюда в хранилище служебным ключом,
        // который не покидает сервер. Заодно здесь же проверяется пропуск
        // приложения — там его не было вовсе.
        //
        // args: [имя файла, содержимое в base64, тип]
        case 'dbUploadFile': {
            $name = (string)($args[0] ?? '');
            $b64  = (string)($args[1] ?? '');
            $type = (string)($args[2] ?? 'application/octet-stream');

            // Имя приходит от приложения, а уходит в путь. Пускаем только то,
            // из чего нельзя составить выход за пределы каталога.
            if (!preg_match('#^[A-Za-z0-9._/-]{1,180}$#', $name) || str_contains($name, '..')) {
                $data = ['error' => 'плохое имя файла']; break;
            }
            $bytes = base64_decode($b64, true);
            if ($bytes === false || $bytes === '') { $data = ['error' => 'пустой файл']; break; }
            if (strlen($bytes) > 25 * 1024 * 1024) { $data = ['error' => 'файл больше 25 МБ']; break; }

            $ch = curl_init(SB_URL . '/storage/v1/object/avatars/' . $name);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CUSTOMREQUEST => 'POST',
                CURLOPT_POSTFIELDS => $bytes,
                CURLOPT_TIMEOUT => 60,
                CURLOPT_HTTPHEADER => [
                    'apikey: ' . SB_KEY,
                    'Authorization: Bearer ' . SB_KEY,
                    'Content-Type: ' . $type,
                    'Cache-Control: max-age=3600',
                    // Перезапись: аватар кладётся под одним и тем же именем,
                    // и без этого вторая смена фотографии молча не проходила бы.
                    'x-upsert: true',
                ],
            ]);
            $resp = curl_exec($ch);
            $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $err  = curl_error($ch);
            curl_close($ch);

            if ($code < 200 || $code >= 300) {
                // Возвращаем причину, а не просто «не вышло»: без неё
                // разбираться придётся по чужим экранам.
                $data = ['error' => $err ?: ('хранилище ответило ' . $code . ': ' . substr((string)$resp, 0, 200))];
                break;
            }
            $data = ['url' => SB_URL . '/storage/v1/object/public/avatars/' . $name];
            break;
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
            // Девятый аргумент — автор первого сообщения: true/'worker' —
            // работник, 'employer' — работодатель, иначе система. Оно и
            // отправляется от его имени, а не от системы.
            [$wid, $eid, $vid, $vt, $cn, $sm, $uw, $ue] =
                [$args[0], $args[1], $args[2], $args[3], $args[4], $args[5] ?? null,
                 $args[6] ?? 0, $args[7] ?? 0];
            $author = $args[8] ?? false;
            $data = chat_ensure($wid, $eid, (string)$vid, (string)$vt, (string)$cn,
                                $sm, (int)$uw, (int)$ue,
                                is_string($author) ? $author : (bool)$author);
            break;
        }

        case 'dbMarkRead': {
            // Вместе со счётчиком запоминаем и время: по нему собеседник
            // увидит вторую галочку. Одно без другого бессмысленно —
            // счётчик говорит «сколько», а галочка «с какого момента».
            $f = $args[1] === 'worker' ? 'unread_worker' : 'unread_employer';
            $t = $args[1] === 'worker' ? 'worker_read_at' : 'employer_read_at';
            sb_update('jm_chats', ['id' => 'eq.' . $args[0]], [$f => 0, $t => now_iso()]); break;
        }

        case 'dbIncrementUnread': {
            $row = sb_single('jm_chats', ['id' => 'eq.' . $args[0]], 'unread_worker,unread_employer');
            if (!$row) break;
            $f = $args[1] === 'worker' ? 'unread_worker' : 'unread_employer';
            $cur = $args[1] === 'worker' ? ($row['unread_worker'] ?? 0) : ($row['unread_employer'] ?? 0);
            sb_update('jm_chats', ['id' => 'eq.' . $args[0]], [$f => $cur + 1]); break;
        }

        // Разовая уборка после перехода на «один чат — одна пара людей».
        // Пары, у которых чатов больше одного, сливаем в старший: перед каждым
        // блоком ставим карточку его вакансии, сообщения переносим с их
        // временем, лишний чат удаляем (сообщения к этому моменту уже не его).
        //
        // args: [apply] — без true только считает и показывает план.
        // Повторный запуск безопасен: сливать станет нечего.
        case 'dbMergeDuplicateChats': {
            @set_time_limit(300);
            $apply = ($args[0] ?? false) === true;

            $all = sb_select('jm_chats', [], 'id,worker_id,employer_id,vacancy_id,unread_worker,unread_employer,created_at', 'created_at.asc');
            $groups = [];
            foreach ($all as $c) {
                $groups[$c['worker_id'] . '|' . $c['employer_id']][] = $c;
            }

            $report = ['pairs' => 0, 'chatsMerged' => 0, 'messagesMoved' => 0, 'cards' => 0, 'details' => []];
            foreach ($groups as $key => $group) {
                if (count($group) < 2) continue;
                $report['pairs']++;
                $keeper = $group[0];   // created_at.asc — первый и есть старший

                foreach ($group as $ch) {
                    $msgs = sb_select('jm_messages', ['chat_id' => 'eq.' . $ch['id']], 'id,created_at', 'created_at.asc');
                    // Карточка встаёт на секунду раньше первого сообщения блока
                    $first = $msgs[0]['created_at'] ?? $ch['created_at'];
                    $stamp = gmdate('Y-m-d\TH:i:s.v\Z', max(0, strtotime($first) - 1));
                    $card = vacancy_card_text((string)($ch['vacancy_id'] ?? ''));

                    if ($card) {
                        $report['cards']++;
                        if ($apply) {
                            sb_insert('jm_messages', ['id' => uid(), 'chat_id' => $keeper['id'],
                                'sender_id' => 'system', 'text' => $card, 'created_at' => $stamp]);
                        }
                    }

                    if ($ch['id'] === $keeper['id']) continue;

                    $report['chatsMerged']++;
                    $report['messagesMoved'] += count($msgs);
                    if ($apply && $msgs) {
                        sb_update('jm_messages', ['chat_id' => 'eq.' . $ch['id']], ['chat_id' => $keeper['id']]);
                    }
                }

                if ($apply) {
                    $uw = 0; $ue = 0;
                    foreach ($group as $ch) {
                        $uw += (int)($ch['unread_worker'] ?? 0);
                        $ue += (int)($ch['unread_employer'] ?? 0);
                    }
                    sb_update('jm_chats', ['id' => 'eq.' . $keeper['id']],
                        ['unread_worker' => $uw, 'unread_employer' => $ue]);
                    foreach ($group as $ch) {
                        // Только строку чата: сообщения уже переехали к старшему
                        if ($ch['id'] !== $keeper['id']) sb_delete('jm_chats', ['id' => 'eq.' . $ch['id']]);
                    }
                }

                $report['details'][] = ['pair' => $key, 'keep' => $keeper['id'], 'chats' => count($group)];
            }

            $report['applied'] = $apply;
            $data = $report; break;
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
            $eid = $like['employer_id'];
            if ($like['is_match']) {
                $ec = sb_single('jm_chats', ['worker_id' => 'eq.' . $wid, 'employer_id' => 'eq.' . $eid], 'id');
                $data = ['matched' => false, 'chatId' => $ec['id'] ?? null]; break;
            }
            if (!$like['worker_liked'] || $like['employer_liked'] !== true) { $data = ['matched' => false]; break; }
            sb_update('jm_likes', ['vacancy_id' => 'eq.' . $vid, 'worker_id' => 'eq.' . $wid],
                ['is_match' => true, 'matched_at' => now_iso()]);
            $vac = sb_single('jm_vacancies', ['id' => 'eq.' . $vid]);

            // Чат ищем по паре людей: со вторым мэтчем разговор продолжается
            // там же, где начался, а не заводится заново.
            $ec2 = sb_single('jm_chats', ['worker_id' => 'eq.' . $wid, 'employer_id' => 'eq.' . $eid], 'id');
            $isNewChat = !$ec2;
            $cid = $ec2['id'] ?? uid();
            if ($isNewChat) {
                sb_insert('jm_chats', [
                    'id' => $cid, 'vacancy_id' => $vid, 'worker_id' => $wid,
                    'employer_id' => $eid, 'vac_title' => $vac['title'] ?? '',
                    'company_name' => $vac['company'] ?? '', 'unread_worker' => 1, 'unread_employer' => 1,
                    'created_at' => now_iso(),
                ]);
            } else {
                sb_update('jm_chats', ['id' => 'eq.' . $cid], [
                    'vacancy_id' => $vid,
                    'vac_title' => $vac['title'] ?? '',
                    'company_name' => $vac['company'] ?? '',
                ]);
            }

            // Карточка смены открывает блок: дальше в чате может идти речь о
            // другой смене, и без неё непонятно, к чему относится разговор.
            $card = vacancy_card_text($vid);
            if ($card) {
                msg_insert(['id' => uid(), 'chat_id' => $cid, 'sender_id' => 'system',
                    'text' => $card, 'created_at' => now_iso()]);
            }
            msg_insert(['id' => uid(), 'chat_id' => $cid, 'sender_id' => 'system',
                'text' => '🎉 У вас мэтч! Вы подошли друг другу. Познакомьтесь и обсудите детали!', 'created_at' => now_iso()]);
            // Предупреждение о безопасности — один раз, при заведении чата.
            // Повторять его на каждую смену незачем: читать перестанут.
            if ($isNewChat) {
                msg_insert(['id' => uid(), 'chat_id' => $cid, 'sender_id' => 'system_safety',
                    'text' => "🔒 Рекомендуем не переводить общение в сторонние мессенджеры или почту, а продолжить его в чате JobToo: так у мошенников будет меньше шансов вас обмануть.\n\nГде бы вы ни общались — не сообщайте свой CVV-код, код из SMS и не вводите данные карты по ссылке.",
                    'created_at' => now_iso()]);
            }
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
            vacancy_content_guard($args[0]);
            save_then_geocode('jm_perm_vacancies', $args[0]); break;

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

        case 'dbApplyPermVacancy': {
            [$vid, $wid, $eid, $sm] = [$args[0], $args[1], $args[2], $args[3] ?? null];
            sb_upsert('jm_perm_applications', [
                'id' => uid(), 'vacancy_id' => $vid, 'worker_id' => $wid,
                'employer_id' => $eid, 'status' => 'pending', 'created_at' => now_iso(),
            ], 'vacancy_id,worker_id');

            // Отклик на постоянную вакансию раньше уходил молча: строка в
            // таблице со статусом «ожидает», и всё. Работодатель видел имя в
            // списке и решал вслепую, а сказать о себе человеку было негде —
            // при том что именно на постоянные приходится большая часть
            // откликов. Теперь отклик открывает переписку, как и на сменах.
            $pv = sb_single('jm_perm_vacancies', ['id' => 'eq.' . $vid], 'title,company');
            if ($sm) {
                $data = chat_ensure($wid, $eid, (string)$vid,
                    (string)($pv['title'] ?? ''), (string)($pv['company'] ?? ''),
                    $sm, 0, 1, true);
            }

            // Директору — здесь же, а не с телефона соискателя. Раньше отклик
            // сохранялся, а сообщение слал клиент: старая версия или обрыв
            // связи — и о кандидате никто не узнавал.
            $w = sb_single('jm_users', ['id' => 'eq.' . $wid], 'first_name,last_name');
            $wName = trim(($w['first_name'] ?? '') . ' ' . ($w['last_name'] ?? '')) ?: 'Кандидат';
            $vTitle = (string)($pv['title'] ?? 'вакансию');
            notify_user((string)$eid, '📥 Новая заявка!',
                "{$wName} откликнулся на вакансию «{$vTitle}». Посмотрите кандидата!",
                'new_perm_applicant', [],
                "Есть отклик на вакансию «{$vTitle}». Посмотрите кандидата!");
            // И карточка с кнопками «Одобрить/Отклонить» — решение в один тап,
            // не открывая приложение.
            tg_new_application_card((string)$eid, (string)$wid, (string)$vid, $vTitle);
            break;
        }

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

        // ── Итог смены ─────────────────────────────────────────────────────────
        // Раньше здесь было двое ворот: «подтвердить» и «отменить». Отмена
        // означала и невыход, и предупредивший отказ, и отмену самим
        // работодателем — то есть ровно то, что нужно рейтингу, и терялось.
        // Старые колонки заполняем по-прежнему: по ним написан экран «Мэтчи».
        case 'dbSetShiftOutcome': {
            $lid = $args[0];
            $out = $args[1];
            $opts = $args[2] ?? [];
            $ok = ['worked', 'no_show', 'worker_cancelled', 'employer_cancelled', 'other_cancelled'];
            if (!in_array($out, $ok, true)) throw new Exception('неизвестный итог смены');
            $worked = $out === 'worked';
            sb_update('jm_likes', ['id' => 'eq.' . $lid], [
                'outcome'      => $out,
                'late_minutes' => $worked ? (int)($opts['lateMinutes'] ?? 0) : null,
                'outcome_at'   => now_iso(),
                'outcome_by'   => $opts['by'] ?? null,
                'employer_confirmed' => $worked,
                'worker_confirmed'   => $worked,
                'shift_completed'    => $worked,
                'cancelled'          => !$worked,
            ]);
            // Рейтинг работника меняется именно здесь: выход, невыход и
            // опоздание — это три четверти всего, из чего он складывается.
            $lk = sb_single('jm_likes', ['id' => 'eq.' . $lid], 'worker_id,employer_id');
            if (!empty($lk['worker_id'])) jt_recalc_score((string)$lk['worker_id']);
            // И работодателя: отмена смены — это его ось, а не работника.
            if (!empty($lk['employer_id'])) jt_recalc_employer_score((string)$lk['employer_id']);
            $data = true; break;
        }

        // Старые имена — для приложений, до которых обновление ещё не дошло.
        //
        // Сервер выкладывается сразу, а установленное приложение обновляется
        // при следующем запуске, и между этими двумя моментами у человека на
        // телефоне живёт прежний код. Убери эти два случая — и у него просто
        // перестала бы работать кнопка «подтвердить смену», без единого
        // слова о причине.
        //
        // Причины у такой отметки нет и быть не может: старое приложение её
        // не спрашивало. Поэтому подтверждение пишем как выход с неизвестной
        // пунктуальностью, а отмену — как cancelled_legacy, то есть «отменено,
        // виноватого не знаем». Приписать сюда невыход значило бы испортить
        // человеку рейтинг за то, о чём его не спросили.
        case 'dbConfirmShift': {
            sb_update('jm_likes', ['id' => 'eq.' . $args[0]], [
                'outcome' => 'worked', 'late_minutes' => null, 'outcome_at' => now_iso(),
                'employer_confirmed' => true, 'worker_confirmed' => true,
                'shift_completed' => true, 'cancelled' => false,
            ]);
            $lk = sb_single('jm_likes', ['id' => 'eq.' . $args[0]], 'worker_id,employer_id');
            if (!empty($lk['worker_id'])) jt_recalc_score((string)$lk['worker_id']);
            if (!empty($lk['employer_id'])) jt_recalc_employer_score((string)$lk['employer_id']);
            $data = ['bothConfirmed' => true]; break;
        }

        case 'dbCancelShift': {
            sb_update('jm_likes', ['id' => 'eq.' . $args[0]], [
                'outcome' => 'cancelled_legacy', 'outcome_at' => now_iso(),
                'cancelled' => true, 'shift_completed' => false,
            ]);
            $data = true; break;
        }

        // ── Rating + match cleanup ─────────────────────────────────────────────
        case 'dbSubmitRatingAndMaybeDelete': {
            $p = $args[0];
            ['likeId' => $lid, 'fromUserId' => $fuid, 'toUserId' => $tuid,
             'vacancyId' => $vid, 'rating' => $rat, 'role' => $rol] = $p;
            // Качество и скорость необязательны: кто не захотел отвечать,
            // ставит только звёзды, как было раньше. Ноль здесь не годится —
            // «не ответили» и «работал на ноль» это разные вещи, и пустое
            // поле должно остаться пустым.
            $ш = fn(string $к) => isset($p[$к]) && $p[$к] > 0 ? (float)$p[$к] : null;
            sb_insert('jm_ratings', [
                'id' => uid(), 'from_user_id' => $fuid, 'to_user_id' => $tuid,
                'vacancy_id' => $vid, 'like_id' => $lid, 'rating' => $rat,
                // Про работника — качество и скорость; про работодателя —
                // совпало ли с описанием, как относились, заплатили ли
                // вовремя. Лишние поля просто останутся пустыми.
                'quality' => $ш('quality'), 'speed' => $ш('speed'),
                'emp_matched_desc' => $ш('matchedDesc'),
                'emp_attitude'     => $ш('attitude'),
                'emp_paid_on_time' => $ш('paidOnTime'),
                'role' => $rol, 'review_text' => $p['reviewText'] ?? null, 'created_at' => now_iso(),
            ]);
            // Сигнал тому, кого оценили: у него открыт профиль — обновится сам.
            try { rt_broadcast('ratings:' . $tuid, 'refresh'); } catch (\Throwable $e) {}
            $rf = $rol === 'worker' ? 'worker_rated' : 'employer_rated';
            sb_update('jm_likes', ['id' => 'eq.' . $lid], [$rf => true]);
            $all = sb_select('jm_ratings', ['to_user_id' => 'eq.' . $tuid], 'rating');
            if (!empty($all)) {
                $avg = round(array_sum(array_column($all, 'rating')) / count($all), 2);
                sb_update('jm_users', ['id' => 'eq.' . $tuid], ['avg_rating' => $avg, 'rating_count' => count($all)]);
            }
            // Оценка работодателя — четверть рейтинга работника, плюс
            // качество и скорость. Работника оценивают в role='employer'.
            if ($rol === 'employer') jt_recalc_score($tuid);
            else jt_recalc_employer_score($tuid);
            $lr = sb_single('jm_likes', ['id' => 'eq.' . $lid], 'worker_rated,employer_rated');
            $data = ['bothRated' => !empty($lr['worker_rated']) && !empty($lr['employer_rated'])]; break;
        }

        // ── Телеграм: пост в общую группу ─────────────────────────────────────
        // Объявления для всех разом — в группу «ПОДРАБОТКИ», а не письмами
        // каждому. Адрес группы берётся из настроек сервера и не приходит
        // в запросе: APP_SECRET лежит в открытом коде, и с параметром-адресом
        // ботом можно было бы писать в любой чат.
        // Состояние группы: жив ли доступ и не сменился ли её номер.
        //
        // Понадобилось, когда объявления перестали приходить в «ПОДРАБОТКИ»,
        // а причину было нечем посмотреть: код публикации на месте, токен
        // рабочий, а сообщений нет. Классическая причина — группу повысили
        // до супергруппы, и её номер сменился; старый перестаёт отвечать.
        // Ничего не отправляет, только спрашивает.
        case 'tgGroupInfo': {
            if (TG_BOT_TOKEN === '') { $data = ['ok' => false, 'error' => 'нет токена']; break; }
            $ch = curl_init('https://api.telegram.org/bot' . TG_BOT_TOKEN . '/getChat?chat_id=' . TG_GROUP_CHAT_ID);
            curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15]);
            $chat = json_decode((string)curl_exec($ch), true); curl_close($ch);

            $ch = curl_init('https://api.telegram.org/bot' . TG_BOT_TOKEN . '/getMe');
            curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15]);
            $me = json_decode((string)curl_exec($ch), true); curl_close($ch);
            $botId = (int)($me['result']['id'] ?? 0);

            $member = null;
            if ($botId) {
                $ch = curl_init('https://api.telegram.org/bot' . TG_BOT_TOKEN
                    . '/getChatMember?chat_id=' . TG_GROUP_CHAT_ID . '&user_id=' . $botId);
                curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15]);
                $member = json_decode((string)curl_exec($ch), true); curl_close($ch);
            }
            // Проверка возможности писать — без единого видимого сообщения.
            // sendChatAction требует тех же прав, что и отправка, но в чате
            // после него ничего не остаётся. Точный текст отказа от телеграма
            // ценнее любых догадок о правах.
            $ch = curl_init('https://api.telegram.org/bot' . TG_BOT_TOKEN . '/sendChatAction');
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_TIMEOUT => 15,
                CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
                CURLOPT_POSTFIELDS => json_encode(['chat_id' => TG_GROUP_CHAT_ID, 'action' => 'typing']),
            ]);
            $can = json_decode((string)curl_exec($ch), true); curl_close($ch);

            $data = ['chat_id' => TG_GROUP_CHAT_ID, 'chat' => $chat,
                     'бот_в_группе' => $member, 'может_писать' => $can];
            break;
        }

        case 'tgPostToGroup': {
            if (TG_BOT_TOKEN === '') { $data = ['ok' => false, 'error' => 'TG_BOT_TOKEN не задан на сервере']; break; }
            if (TG_GROUP_CHAT_ID === 0) { $data = ['ok' => false, 'error' => 'Группа не настроена']; break; }
            $text = trim((string)($args[0] ?? ''));
            if ($text === '') { $data = ['ok' => false, 'error' => 'Пустой текст']; break; }
            $data = ['sent' => tg_send_message(TG_GROUP_CHAT_ID, $text, true), 'chat' => TG_GROUP_CHAT_ID];
            break;
        }

        // ── Телеграм: переустановка вебхука ───────────────────────────────────
        // Нужна после смены токена бота. Токен при этом никуда не передаётся —
        // сервер берёт его сам из app_secrets.php.
        //
        // Адрес зашит здесь намеренно и не берётся из запроса: APP_SECRET лежит
        // в открытом коде, и с параметром-адресом любой желающий увёл бы
        // вебхук на себя вместе со всеми сообщениями людей.
        case 'tgSetWebhook': {
            $token = TG_BOT_TOKEN;
            if ($token === '') { $data = ['ok' => false, 'error' => 'TG_BOT_TOKEN не задан на сервере']; break; }
            // Не через дашборд: вебхук идёт прямо в обработчик, на имя без
            // A-записи. Пересылка была крюком вокруг сломанного IPv4, и
            // возвращать её этой кнопкой было бы шагом назад.
            $url = 'https://tg.jobtoo.ru/api/tg.php';
            $ch = curl_init('https://api.telegram.org/bot' . $token . '/setWebhook');
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST => true,
                CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
                CURLOPT_TIMEOUT => 15,
                CURLOPT_POSTFIELDS => json_encode([
                    'url' => $url,
                    'secret_token' => jt_secret('APP_SECRET'),
                    'allowed_updates' => ['message', 'callback_query'],
                    'drop_pending_updates' => false,
                ]),
            ]);
            $resp = curl_exec($ch); curl_close($ch);
            $data = ['target' => $url, 'telegram' => json_decode($resp ?: 'null', true)];
            break;
        }

        // ── Телеграм: что сейчас с вебхуком ───────────────────────────────────
        case 'tgWebhookInfo': {
            $token = TG_BOT_TOKEN;
            if ($token === '') { $data = ['ok' => false, 'error' => 'TG_BOT_TOKEN не задан на сервере']; break; }
            $ch = curl_init('https://api.telegram.org/bot' . $token . '/getWebhookInfo');
            curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15]);
            $resp = curl_exec($ch); curl_close($ch);
            $data = json_decode($resp ?: 'null', true);
            break;
        }

        // ── Push tokens ────────────────────────────────────────────────────────
        // Токен принадлежит устройству, а не человеку. Если на телефоне сменили
        // аккаунт, тот же токен остался бы записан и за прежним — и уведомления
        // для обоих приходили бы на один телефон. Поэтому сначала снимаем его
        // со всех остальных.
        case 'dbSavePushToken':
            sb_update('jm_users', ['push_token' => 'eq.' . $args[1], 'id' => 'neq.' . $args[0]], ['push_token' => null]);
            sb_update('jm_users', ['id' => 'eq.' . $args[0]], ['push_token' => $args[1]]); break;

        // Выход из аккаунта. Без этого сервер продолжал слать уведомления на
        // телефон, с которого человек вышел: приложение он не удалял, а токен
        // так и лежал в его строке.
        case 'dbClearPushToken':
            sb_update('jm_users', ['id' => 'eq.' . $args[0]], ['push_token' => null]); break;

        // Разбор завалов: те, кто вышел до появления dbClearPushToken, так и
        // остались с токеном в базе, а войти и почиститься не могут — они же
        // вышли. Здесь ищем по самому токену, аккаунт знать не нужно.
        case 'dbReleasePushToken':
            sb_update('jm_users', ['push_token' => 'eq.' . $args[0]], ['push_token' => null]); break;

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

        // Выход из аккаунта в браузере — то же, что снятие токена на телефоне.
        case 'dbDeleteWebPushSubscription':
            sb_delete('jm_web_push_subscriptions', ['user_id' => 'eq.' . $args[0]]); break;

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
            $dataType = (string)($args[3] ?? 'nearby_shift');
            $deepKind = $dataType === 'nearby_perm' ? 'perm' : 'shift';

            // Идемпотентность по вакансии. Рассылка — отдельный вызов с клиента,
            // и при обрыве сети он молча терялся: вакансия в ленте есть, а
            // объявление в группе «ПОДРАБОТКИ» не пришло. Теперь клиент вправе
            // повторить вызов, но повтор НЕ должен разослать пуши всем повторно
            // и запостить в группу дважды. Поэтому «столбим» вакансию заранее:
            // если по ней уже начинали рассылку — сразу выходим. Отметку ставим
            // ДО работы (claim), чтобы гонка повторов не дала дублей.
            if ($vacancyId !== '') {
                if (sb_single('jm_settings', ['key' => 'eq.bcast:' . $vacancyId], 'key')) {
                    $data = ['ok' => true, 'skipped' => 'already_sent'];
                    break;
                }
                sb_upsert('jm_settings', [
                    'key' => 'bcast:' . $vacancyId,
                    'value' => now_iso(),
                    'updated_at' => now_iso(),
                ], 'key');
            }
            $dmCampaign = bin2hex(random_bytes(8));
            $groupCampaign = bin2hex(random_bytes(8));
            $btnUrl = $vacancyId !== ''
                ? 'https://t.me/JobToo_bot/app?startapp=' . $deepKind . '_' . $vacancyId . '_' . $dmCampaign
                : true;
            $groupBtnUrl = $vacancyId !== ''
                ? 'https://t.me/JobToo_bot/app?startapp=' . $deepKind . '_' . $vacancyId . '_' . $groupCampaign
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
                $groupOk = tg_send_message(TG_GROUP_CHAT_ID, $groupHtml, $groupBtnUrl);
            }
            // Итог публикации сохраняем: иначе он теряется, а следующий раз
            // выяснять причину снова будет нечем.
            try {
                sb_upsert('jm_settings', [
                    'key' => 'last_group_post',
                    'value' => json_encode([
                        'ok' => $groupOk,
                        'когда' => now_iso(),
                        'длина_текста' => strlen($groupHtml),
                        'кнопка' => is_string($groupBtnUrl) ? $groupBtnUrl : 'по умолчанию',
                        'отказ' => $GLOBALS['jt_last_tg_error'] ?? null,
                    ], JSON_UNESCAPED_UNICODE),
                    'updated_at' => now_iso(),
                ], 'key');
            } catch (Throwable $e) { /* запись отчёта не должна ломать рассылку */ }

            // Фиксируем факт публикации отдельно от открытий. Никаких данных
            // Telegram-пользователя в этой строке нет.
            if ($vacancyId !== '') {
                if ($groupOk) {
                    try {
                        sb('POST', 'jm_guest_events', [], [
                            'id' => uid(),
                            'anon_id' => 'campaign:' . $groupCampaign,
                            'event_type' => 'campaign_published',
                            'vacancy_id' => $vacancyId,
                            'vacancy_kind' => $deepKind === 'perm' ? 'permanent' : 'shift',
                            'platform' => 'web',
                            'campaign_id' => $groupCampaign,
                            'channel' => 'telegram_group',
                            'occurred_at' => now_iso(),
                        ], ['Prefer: return=minimal']);
                    } catch (Throwable $e) { /* аналитика не блокирует рассылку */ }
                }
            }

            // Старые клиенты не передают тип работы: для пользователей без
            // выбранного фильтра поведение всё равно остаётся прежним.
            $vacancyMetro = (string)($args[6] ?? '');
            $vacancyWorkType = (string)($args[7] ?? '');
            $data = notify_workers((string)$args[0], (string)$args[1], (string)$args[2],
                                   (string)($args[3] ?? 'nearby_shift'), $btnUrl,
                                   $vacancyMetro, $vacancyWorkType);
            $data['group'] = $groupOk;

            // DM-публикация существует только если Telegram действительно
            // доставил хотя бы одно сообщение. Так отчёт не завышает охват.
            if ($vacancyId !== '' && ($data['telegram'] ?? 0) > 0) {
                try {
                    sb('POST', 'jm_guest_events', [], [
                        'id' => uid(),
                        'anon_id' => 'campaign:' . $dmCampaign,
                        'event_type' => 'campaign_published',
                        'vacancy_id' => $vacancyId,
                        'vacancy_kind' => $deepKind === 'perm' ? 'permanent' : 'shift',
                        'platform' => 'web',
                        'campaign_id' => $dmCampaign,
                        'channel' => 'telegram_dm',
                        'occurred_at' => now_iso(),
                    ], ['Prefer: return=minimal']);
                } catch (Throwable $e) { /* аналитика не блокирует рассылку */ }
            }
            break;
        }

        case 'addressSuggest': {
            $text = trim((string)($args[0] ?? ''));
            $data = mb_strlen($text) >= 3 ? geo_search($text . ', Москва') : [];
            break;
        }

        case 'dbSaveNotification': {
            // type/payload нужны, чтобы по нажатию на уведомление открылся
            // нужный экран. Колонок может ещё не быть — тогда сохраняем как
            // раньше, только заголовок и текст.
            $row = ['user_id' => $args[0], 'title' => $args[1], 'body' => $args[2]];
            $type = $args[3] ?? null;
            $payload = $args[4] ?? null;
            if ($type) $row['type'] = $type;
            if ($payload) $row['payload'] = json_encode($payload, JSON_UNESCAPED_UNICODE);
            try {
                sb_insert('jm_notifications', $row);
            } catch (\Throwable $e) {
                if (stripos($e->getMessage(), 'type') !== false || stripos($e->getMessage(), 'payload') !== false) {
                    unset($row['type'], $row['payload']);
                    sb_insert('jm_notifications', $row);
                } else {
                    throw $e;
                }
            }
            break;
        }

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

        case 'dbGetAllWorkerTokens':
            $data = sb_select('jm_users', ['role' => 'eq.worker', 'push_token' => 'not.is.null'], 'id,push_token'); break;

        default:
            throw new RuntimeException('Unknown function: ' . $fn);
    }

    jt_respond(['data' => $data]);
} catch (Throwable $e) {
    jt_respond(['error' => $e->getMessage()], 500);
}
