Warning: truncated output (original token count: 78114)
Total output lines: 5199

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
// Адрес бэкенда — свой сервер в Москве, и только он.
//
// Раньше здесь была пара «переменная окружения SB_URL или файл sb_url.php, а
// иначе умолчание». Заводилось это как быстрый откат в облако, если переезд
// пойдёт не так. Переезд состоялся 15.08, данные давно в России, а рычаг
// остался — и это ровно тот рычаг, которым первичная запись ПДн граждан РФ
// одной настройкой уводится за границу, мимо ч. 5 ст. 18 152-ФЗ.
//
// Поэтому адрес теперь в коде. Сменить его — правка и коммит, и это осознанно:
// так переезд виден в истории, а не случается от значения в чужом окружении.
define('SB_URL', 'https://jobtoo.ru');

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
    // dbGetUsers отдаёт всех пользователей разом. Приложение её не зовёт
    // (в services/db.ts обёртка есть, вызовов нет), а любому вошедшему она
    // выгружала бы список всех людей сервиса одним запросом. Дашборд ходит в
    // базу своим путём, поэтому место операции — здесь.
    'dbGetUsers',
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
$authClaims = jt_session_claims($authHeader);
$authUid = $authClaims['uid'] ?? null;

// Токен подписан верно — но этого мало.
//
// Он живёт тридцать дней и до сих пор ничем не гасился: ни сменой пароля, ни
// блокировкой. То есть увели токен — и он работает месяц, сколько пароль ни
// меняй; а заблокированный пользователь просто продолжал ходить в API, потому
// что is_blocked спрашивали только рассылки, решая, слать ли уведомление.
//
// Поэтому один запрос к своей же строке: он заодно ловит и удалённый аккаунт.
// Колонки sessions_valid_from может ещё не быть (миграция 046) — тогда
// проверяем хотя бы блокировку, а не роняем всё приложение.
if ($authUid !== null) {
    $acct = null;
    try {
        $acct = sb_single('jm_users', ['id' => 'eq.' . $authUid], 'id,is_blocked,sessions_valid_from');
    } catch (\Throwable $e) {
        try { $acct = sb_single('jm_users', ['id' => 'eq.' . $authUid], 'id,is_blocked'); }
        catch (\Throwable $e2) { $acct = null; }
    }
    if (!is_array($acct)) {
        jt_respond(['error' => 'Session is no longer valid'], 401); exit;
    }
    if (!empty($acct['is_blocked'])) {
        jt_respond(['error' => 'Аккаунт заблокирован'], 403); exit;
    }
    $validFrom = isset($acct['sessions_valid_from']) && $acct['sessions_valid_from'] !== null
        ? (int)strtotime((string)$acct['sessions_valid_from']) : 0;
    // Пять секунд допуска: отметка времени в базе и iat в токене ставятся
    // разными часами и с разным округлением, а без запаса свежевыданный при
    // смене пароля токен мог бы оказаться «старше» самой отметки.
    if ($validFrom > 0 && (int)($authClaims['iat'] ?? 0) + 5 < $validFrom) {
        jt_respond(['error' => 'Session is no longer valid'], 401); exit;
    }
}
$publicFns = [
    'dbCountUsers', 'dbWarmup', 'dbCheckPhoneExists', 'dbLogin',
    'dbUpsertUser', 'tgAuth', 'dbGetVacancies', 'dbGetPermVacancies',
    'extVacancies', 'extVacancyCount', 'extSourceOptions', 'extClick', 'addressSuggest', 'dbLogOpen', 'guestEvent',
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
// ─── Перебор ──────────────────────────────────────────────────────────────────
//
// Вход — это номер телефона и пароль, и оба подбираются: `dbCheckPhoneExists`
// отвечает, есть ли такой номер, а `dbLogin` — верен ли к нему пароль. Обе
// операции публичные (иначе нельзя ни зарегистрироваться, ни войти), и до сих
// пор ни одна из них не считала попытки. В админке такой счёт есть с самого
// начала — здесь его не было, хотя перебирать выгоднее как раз здесь.
//
// Счёт файловый, как в admin.php: база для этого слишком дорога, а запрос
// ронять из-за счётчика нельзя. REMOTE_ADDR — настоящий адрес клиента: nginx
// отдаёт PHP по FastCGI и стоит на краю, без второго прокси перед собой.
const JT_TRY_WINDOW = 900;          // 15 минут
const JT_TRY_MAX = ['login' => 10, 'phone' => 30];

function jt_try_file(string $kind): string {
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    return sys_get_temp_dir() . '/jm_try_' . $kind . '_' . hash('sha256', $ip) . '.json';
}

function jt_try_blocked(string $kind): bool {
    $st = json_decode((string)@file_get_contents(jt_try_file($kind)), true);
    if (!is_array($st)) return false;
    if ((int)($st['since'] ?? 0) + JT_TRY_WINDOW < time()) return false;
    return (int)($st['fails'] ?? 0) >= (JT_TRY_MAX[$kind] ?? 10);
}

function jt_try_note(string $kind): void {
    $f = jt_try_file($kind);
    $st = json_decode((string)@file_get_contents($f), true);
    if (!is_array($st) || (int)($st['since'] ?? 0) + JT_TRY_WINDOW < time()) {
        $st = ['since' => time(), 'fails' => 0];
    }
    $st['fails'] = (int)($st['fails'] ?? 0) + 1;
    @file_put_contents($f, json_encode($st), LOCK_EX);
}

function jt_try_reset(string $kind): void { @unlink(jt_try_file($kind)); }

// Ключ подписи сессий — свой, а не ключ базы.
//
// Раньше при пустом SESSION_SECRET подпись считалась ключом Supabase. Две беды
// сразу: ротация ключа базы разлогинивала всех разом, а если ключ до сервера
// не доехал и оказался пустым, подпись считалась пустым ключом — и токен на
// любой чужой uid подделывался в две строки.
//
// Теперь ключ берётся свой (bootstrap.sh заводит его при первом запуске), а
// ключ базы остаётся запасным, пока свой не доехал: иначе эта правка в момент
// выкатки положила бы вход всем. Пустым ключ не бывает ни при каком раскладе —
// на этом и держалась подделка.
function jt_session_key(): string {
    $key = jt_secret('SESSION_SECRET');
    if ($key === '') $key = SB_KEY;
    if ($key === '') {
        // Подписывать нечем. Молчать нельзя: пустой ключ — это подделываемые
        // токены, то есть вход под любым чужим id.
        jt_respond(['error' => 'Server is not configured to issue sessions'], 500);
        exit;
    }
    return $key;
}
/**
 * Ключ, которым подписаны токены, выданные до появления SESSION_SECRET.
 *
 * Принимается только на проверке — тот же приём, что с APP_SECRET_PREV: дать
 * уже выданным токенам дожить, а не разлогинивать четыреста человек разом.
 */
function jt_session_key_prev(): string {
    return jt_secret('SESSION_SECRET') !== '' ? SB_KEY : '';
}
function jt_session_issue(string $uid): string {
    $payload = jt_b64url_encode(json_encode([
        'uid' => $uid, 'iat' => time(), 'exp' => time() + 30 * 86400,
    ], JSON_UNESCAPED_SLASHES));
    $sig = jt_b64url_encode(hash_hmac('sha256', $payload, jt_session_key(), true));
    return $payload . '.' . $sig;
}
/**
 * Кто предъявил токен — или null.
 *
 * Возвращает пару [uid, iat]: время выдачи нужно, чтобы смена пароля и
 * блокировка гасили уже выданные токены. У токенов, выданных до этой правки,
 * iat нет — считаем их выданными в нулевой момент, то есть первая же смена
 * пароля их погасит.
 */
function jt_session_claims(string $header): ?array {
    if (!preg_match('/^Bearer\s+(.+)$/i', trim($header), $m)) return null;
    $parts = explode('.', trim($m[1]), 2);
    if (count($parts) !== 2) return null;
    [$payload, $provided] = $parts;
    $ok = false;
    foreach ([jt_session_key(), jt_session_key_prev()] as $key) {
        if ($key === '') continue;
        if (hash_equals(jt_b64url_encode(hash_hmac('sha256', $payload, $key, true)), $provided)) {
            $ok = true; break;
        }
    }
    if (!$ok) return null;
    $raw = jt_b64url_decode($payload);
    $data = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($data) || empty($data['uid']) || (int)($data['exp'] ?? 0) < time()) return null;
    return ['uid' => (string)$data['uid'], 'iat' => (int)($data['iat'] ?? 0)];
}
function jt_session_uid(string $header): ?string {
    $c = jt_session_claims($header);
    return $c === null ? null : $c['uid'];
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
 * а не попа…48114 tokens truncated…ancy_views', ['vacancy_id' => 'eq.' . $args[0]], 'worker_id,viewed_at', 'viewed_at.desc');
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

            // Бакет avatars — публичный, и лежит он на том же имени, что и сам
            // сайт: ссылка вида jobtoo.ru/storage/v1/object/public/avatars/…
            // открывается в том же origin, где работает веб-приложение.
            //
            // Значит тип файла нельзя брать с клиента. Иначе достаточно
            // зарегистрироваться, залить «аватар» с типом text/html и кинуть
            // ссылку в переписку: страница выполнится как своя, с доступом к
            // сохранённому токену сессии. Пускаем только картинки, и проверяем
            // не заявленный тип, а сами байты.
            $byType = [
                'image/jpeg' => IMAGETYPE_JPEG,
                'image/png'  => IMAGETYPE_PNG,
                'image/webp' => IMAGETYPE_WEBP,
            ];
            if (!isset($byType[$type])) {
                $data = ['error' => 'аватаром может быть только JPEG, PNG или WebP']; break;
            }

            // Имя тоже не с клиента: под ним лежит чужой аватар, а запись идёт
            // с x-upsert, то есть поверх. Единственное допустимое имя — своё.
            if ($authUid === null || $name !== 'avatar_' . $authUid . '.jpg') {
                $data = ['error' => 'плохое имя файла']; break;
            }
            if (!preg_match('#^[A-Za-z0-9._/-]{1,180}$#', $name) || str_contains($name, '..')) {
                $data = ['error' => 'плохое имя файла']; break;
            }
            $bytes = base64_decode($b64, true);
            if ($bytes === false || $bytes === '') { $data = ['error' => 'пустой файл']; break; }
            if (strlen($bytes) > 25 * 1024 * 1024) { $data = ['error' => 'файл больше 25 МБ']; break; }

            // Заявленный тип сверяем с содержимым: бывают файлы, которые и
            // картинка, и разметка сразу, — такой проходит по типу, а
            // открывается как страница.
            $probe = @getimagesizefromstring($bytes);
            if (!is_array($probe) || ($probe[2] ?? null) !== $byType[$type]) {
                $data = ['error' => 'содержимое не похоже на ' . $type]; break;
            }

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
