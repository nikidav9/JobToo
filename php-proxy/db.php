<?php
define('SB_URL', 'https://bbiqmkeysalwdonlnylb.supabase.co');

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
define('SB_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJiaXFta2V5c2Fsd2RvbmxueWxiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MTI5NTIsImV4cCI6MjA5MzM4ODk1Mn0.HHYjTdjdP6lN-GosNfGypts6Kg-2CYyoMPMTnLfdfJQ');

function sb_resolve_key(): string {
    $env = getenv('SB_SERVICE_KEY');
    if (is_string($env) && trim($env) !== '') return trim($env);

    $file = __DIR__ . '/sb_service_key.php';
    if (is_readable($file)) {
        $v = @include $file;
        if (is_string($v) && trim($v) !== '') return trim($v);
    }

    return SB_ANON_KEY;
}

define('SB_KEY', sb_resolve_key());

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-App-Secret');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405); echo json_encode(['error' => 'Method not allowed']); exit;
}

// Смена секрета не может быть мгновенной: у части людей приложение уже
// установлено и старый секрет зашит в него до следующего обновления по воздуху.
// Поэтому на время перехода принимаем и предыдущий — APP_SECRET_PREV.
// Когда все обновятся, секрет из GitHub Secrets убирается, и старый ключ
// перестаёт работать сам собой.
$provided = $_SERVER['HTTP_X_APP_SECRET'] ?? '';
$accepted = array_filter([
    jt_secret('APP_SECRET', 'ebb565bbbe600d111d88ad03b4d2e1731ebf9055d1dfd9bb147af91a6597d5f6'),
    jt_secret('APP_SECRET_PREV'),
]);
$ok = false;
foreach ($accepted as $s) { if (hash_equals($s, $provided)) $ok = true; }
if (!$ok) {
    http_response_code(403); echo json_encode(['error' => 'Forbidden']); exit;
}

$body = json_decode(file_get_contents('php://input'), true);
$fn   = $body['fn'] ?? null;
$args = $body['args'] ?? [];

if (!$fn) { http_response_code(400); echo json_encode(['error' => 'Missing fn']); exit; }

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
    'id', 'role', 'phone', 'first_name', 'last_name', 'age',
    'metro_line_id', 'metro_station', 'work_types', 'company', 'bio',
    'avatar_url', 'avg_rating', 'rating_count', 'is_blocked',
    'created_at', 'push_token', 'telegram_id', 'last_seen_at',
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

function rt_broadcast(string $topic, string $event, array $payload = []): void {
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
    curl_exec($ch);
    curl_close($ch);
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
 */
function chat_ensure(string $wid, string $eid, string $vid, string $vt, string $cn,
                     ?string $sm, int $uw, int $ue, bool $fromWorker = false): string {
    $author = $fromWorker ? $wid : 'system';

    $ex = sb_single('jm_chats',
        ['worker_id' => 'eq.' . $wid, 'employer_id' => 'eq.' . $eid],
        'id,vacancy_id,unread_worker,unread_employer');

    if ($ex) {
        $cid = $ex['id'];
        // Та же вакансия — ничего не добавляем, чат уже про неё.
        if ($vid !== '' && ($ex['vacancy_id'] ?? '') !== $vid) {
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
            if ($sm) {
                msg_insert(['id' => uid(), 'chat_id' => $cid, 'sender_id' => $author,
                    'text' => $sm, 'created_at' => now_iso()]);
            }
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
// Ищем через OpenStreetMap/Nominatim: бесплатно, без ключа и работает с
// сервера — в отличие от Яндекса, у которого наш ключ умеет только рисовать
// карту.

function nominatim_search(string $q, int $timeout = 8): array {
    $url = 'https://nominatim.openstreetmap.org/search?' . http_build_query([
        'q' => $q,
        'format' => 'jsonv2',
        'addressdetails' => 1,
        'limit' => 7,
        'accept-language' => 'ru',
        'countrycodes' => 'ru',
        // приоритет Москве и области, но не жёстко (bounded=0)
        'viewbox' => '36.80,56.02,37.97,55.14',
        'bounded' => 0,
    ]);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_SSL_VERIFYPEER => true,
        // Nominatim требует идентифицирующий User-Agent
        CURLOPT_HTTPHEADER => ['User-Agent: JobToo/1.0 (+https://jobtoo.ru)', 'Accept: application/json'],
    ]);
    $resp = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    $dec = json_decode($resp ?: 'null', true);
    if ($code !== 200 || !is_array($dec)) return [];

    $out = [];
    foreach ($dec as $r) {
        $name = $r['display_name'] ?? '';
        if ($name === '') continue;
        // Убираем хвост «, Россия» и почтовый индекс — короче и чище
        $name = preg_replace('/,\s*Россия$/u', '', $name);
        $name = preg_replace('/,\s*\d{6}(?=,|$)/u', '', $name);
        $out[] = [
            'name' => $name,
            'lat' => isset($r['lat']) ? (float)$r['lat'] : null,
            'lng' => isset($r['lon']) ? (float)$r['lon'] : null,
        ];
    }
    return $out;
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
function geocode_address(string $address, int $timeout = 6): ?array {
    $outsideMoscow = (bool)preg_match(
        '/\b(красногорск|химки|люберцы|балашиха|мытищи|реутов|котельники|видное|одинцово|подольск|домодедово|щербинка|долгопрудный|лобня|дзержинский)\b/ui',
        $address
    );

    foreach (address_variants($address) as $q) {
        $full = $outsideMoscow ? $q . ', Московская область' : $q . ', Москва';
        foreach (nominatim_search($full, $timeout) as $hit) {
            if ($hit['lat'] !== null && $hit['lng'] !== null) {
                return [$hit['lat'], $hit['lng']];
            }
        }
    }
    return null;
}

// Дописываем координаты в строку вакансии перед сохранением. Без этого метка
// на карте не появляется вовсе: раньше телефон геокодировал адреса сам при
// каждом открытии карты, и пока все тридцать запросов не пройдут, на карте
// висела одна-единственная вакансия.
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
define('DASHBOARD_URL', getenv('DASHBOARD_URL') ?: 'https://dashboard-nujus-projects.vercel.app');
define('TG_GROUP_CHAT_ID', (int)(getenv('TG_GROUP_CHAT_ID') ?: -1001709270025)); // группа «ПОДРАБОТКИ»
define('YANDEX_SUGGEST_KEY', jt_secret('YANDEX_SUGGEST_KEY', '44152824-d925-46ab-b464-3ce4d9fd50c7')); // Suggest API (адреса)

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
function tg_send_message(int $chatId, string $text, bool|string $withAppButton = false, string $btnText = '🚀 Откликнуться в JobToo'): bool {
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
            ['text' => $btnText, 'url' => $url],
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
    // type — чтобы по нажатию в колокольчике открылся нужный раздел
    $rows = array_map(fn($w) => ['user_id' => $w['id'], 'title' => $title, 'body' => $body, 'type' => $dataType], $all);
    if (!empty($rows)) {
        try {
            sb_insert('jm_notifications', $rows);
        } catch (Throwable $e) {
            // Колонки type ещё нет — пишем как раньше
            $plain = array_map(fn($r) => ['user_id' => $r['user_id'], 'title' => $r['title'], 'body' => $r['body']], $rows);
            try { sb_insert('jm_notifications', $plain); } catch (Throwable $e2) {}
        }
    }

    // Web push (PWA users) — sent through the dashboard's VAPID endpoint
    $webOk = 0;
    try {
        $workerIds = array_flip(array_column($all, 'id'));
        $subs = sb_select('jm_web_push_subscriptions', [], 'user_id,endpoint,p256dh,auth');
        $appSecret = jt_secret('APP_SECRET', 'ebb565bbbe600d111d88ad03b4d2e1731ebf9055d1dfd9bb147af91a6597d5f6');
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
            $data = sb_single('jm_users', ['id' => 'eq.' . $args[0]], USER_PUBLIC_COLS); break;

        case 'dbGetUsers':
            $data = sb_select('jm_users', [], USER_PUBLIC_COLS, 'created_at.asc'); break;

        // Только число для приветственного экрана. Раньше он считал сам,
        // напрямую из базы публичным ключом, — и после закрытия базы получал
        // отказ, показывая число из кэша телефона, замороженное навсегда.
        case 'dbCountUsers':
            $data = sb_count('jm_users'); break;

        // Заявка на привязку Telegram: живёт 15 минут, бот заберёт её по «/start»
        case 'tgPrepareLink': {
            $all = tg_pending_read();
            $all[(string)$args[0]] = time();
            tg_pending_write($all);
            $data = true; break;
        }

        // Отметка «был в сети». Колонки может ещё не быть — тогда просто молчим:
        // ради фоновой отметки нельзя возвращать клиенту ошибку.
        case 'dbTouchLastSeen':
            try {
                sb_update('jm_users', ['id' => 'eq.' . $args[0]], ['last_seen_at' => now_iso()]);
            } catch (\Throwable $e) { /* колонки нет — не беда */ }
            break;

        // Пароль хешируется здесь, на сервере. Раньше приложение клало его в
        // базу как есть, и с конца июня так набралось 176 паролей открытым
        // текстом. Уже готовый хеш второй раз не трогаем: этой же операцией
        // сохраняется профиль целиком, и пароль в нём приезжает обратно.
        case 'dbUpsertUser': {
            $u = $args[0];
            // Пустой пароль — это не «сотри пароль», а «в профиле его нет».
            // После того как вход перестал отдавать пароль наружу, сохранение
            // профиля присылает сюда пустую строку — записать её значит
            // запереть человека без единой ошибки.
            if (empty($u['password'])) {
                unset($u['password']);
            } elseif (!is_bcrypt($u['password'])) {
                $u['password'] = password_hash((string)$u['password'], PASSWORD_BCRYPT);
            }
            sb_upsert('jm_users', $u, 'id'); break;
        }

        // Вход. Сверка переехала сюда с клиента: раньше приложение спрашивало
        // профиль по номеру телефона и сравнивало пароль у себя — а значит
        // пароль (или его хеш) уходил наружу всякому, кто знает номер.
        //
        // Принимаем обе формы. Пока у части людей пароль лежит открытым
        // текстом, отказывать им нельзя; зато при удачном входе такой пароль
        // тут же превращается в хеш — база вычищается сама, по мере того как
        // люди заходят.
        case 'dbLogin': {
            $phone = preg_replace('/\D+/', '', (string)($args[0] ?? ''));
            $pass  = (string)($args[1] ?? '');
            $row = $phone === '' ? null : sb_single('jm_users', ['phone' => 'eq.' . $phone]);
            if (!$row || $pass === '' || empty($row['password'])) { $data = null; break; }

            $stored = (string)$row['password'];
            $ok = is_bcrypt($stored) ? password_verify($pass, $stored) : hash_equals($stored, $pass);
            if (!$ok) { $data = null; break; }

            if (!is_bcrypt($stored)) {
                try {
                    sb_update('jm_users', ['id' => 'eq.' . $row['id']],
                        ['password' => password_hash($pass, PASSWORD_BCRYPT)]);
                } catch (\Throwable $e) { /* вход важнее, чем перевод в хеш */ }
            }

            unset($row['password']);
            $data = $row; break;
        }

        // Смена пароля в профиле. Тоже на сервере — на клиенте старый пароль
        // сравнивался строкой, то есть для всех, у кого уже хеш, смена пароля
        // попросту не работала.
        case 'dbChangePassword': {
            $row = sb_single('jm_users', ['id' => 'eq.' . ($args[0] ?? '')], 'id,password');
            $old = (string)($args[1] ?? '');
            $new = (string)($args[2] ?? '');
            if (!$row || $new === '') { $data = ['ok' => false, 'reason' => 'not_found']; break; }

            $stored = (string)($row['password'] ?? '');
            $ok = is_bcrypt($stored) ? password_verify($old, $stored) : hash_equals($stored, $old);
            if (!$ok) { $data = ['ok' => false, 'reason' => 'wrong_password']; break; }

            sb_update('jm_users', ['id' => 'eq.' . $row['id']],
                ['password' => password_hash($new, PASSWORD_BCRYPT)]);
            $data = ['ok' => true]; break;
        }

        case 'dbWarmup':
            // Раньше просто возвращалось true — прогревался только PHP, а сама
            // база оставалась холодной. Теперь делаем самое дешёвое чтение:
            // этим же вызовом её будит и расписание раз в пять минут.
            try { sb_select('jm_users', ['limit' => '1'], 'id'); } catch (\Throwable $e) {}
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

                // Понедельничный пост в группу: актуальные постоянные вакансии со ссылками
                $result['weeklyPermDigest'] = post_weekly_perm_digest();
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
            sb_upsert('jm_vacancies', fill_coords($args[0]), 'id'); break;

        case 'dbUpsertVacancyBatch': {
            // $args[0] — массив строк вакансий, пишется одним запросом.
            // Один адрес на всю пачку смен, поэтому геокодируем его однажды.
            $rows = $args[0];
            $cache = [];
            foreach ($rows as $k => $r) {
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
            msg_insert($msg);
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
            // Девятый аргумент — «сообщение написал сам работник». Тогда оно и
            // отправляется от его имени, а не от системы.
            [$wid, $eid, $vid, $vt, $cn, $sm, $uw, $ue, $fromWorker] =
                [$args[0], $args[1], $args[2], $args[3], $args[4], $args[5] ?? null,
                 $args[6] ?? 0, $args[7] ?? 0, !empty($args[8])];
            $data = chat_ensure($wid, $eid, (string)$vid, (string)$vt, (string)$cn,
                                $sm, (int)$uw, (int)$ue, $fromWorker);
            break;
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
            sb_upsert('jm_perm_vacancies', fill_coords($args[0]), 'id'); break;

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
            if ($sm) {
                $pv = sb_single('jm_perm_vacancies', ['id' => 'eq.' . $vid], 'title,company');
                $data = chat_ensure($wid, $eid, (string)$vid,
                    (string)($pv['title'] ?? ''), (string)($pv['company'] ?? ''),
                    $sm, 0, 1, true);
            }
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

        // ── Shift confirmation ─────────────────────────────────────────────────
        case 'dbConfirmShift':
            sb_update('jm_likes', ['id' => 'eq.' . $args[0]],
                ['employer_confirmed' => true, 'worker_confirmed' => true, 'shift_completed' => true]);
            $data = ['bothConfirmed' => true]; break;

        case 'dbCancelShift':
            // Отмена смены директором — мэтч уходит в «Завершённые» как отменённый
            sb_update('jm_likes', ['id' => 'eq.' . $args[0]], ['cancelled' => true]);
            $data = true; break;

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
            // Сигнал тому, кого оценили: у него открыт профиль — обновится сам.
            try { rt_broadcast('ratings:' . $tuid, 'refresh'); } catch (\Throwable $e) {}
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

        // ── Телеграм: пост в общую группу ─────────────────────────────────────
        // Объявления для всех разом — в группу «ПОДРАБОТКИ», а не письмами
        // каждому. Адрес группы берётся из настроек сервера и не приходит
        // в запросе: APP_SECRET лежит в открытом коде, и с параметром-адресом
        // ботом можно было бы писать в любой чат.
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
            $url = rtrim(DASHBOARD_URL, '/') . '/api/tg';
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

        case 'addressSuggest': {
            $text = trim((string)($args[0] ?? ''));
            $data = mb_strlen($text) >= 3 ? nominatim_search($text . ', Москва') : [];
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

    echo json_encode(['data' => $data]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
