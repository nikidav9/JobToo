<?php
// Прокси для админ-дашборда.
//
// Зачем: дашборд ходил в базу напрямую публичным ключом, а «вход по паролю»
// был флажком в localStorage — сервер его не проверял. То есть данные лежали
// открыто для любого, кто знает адрес Supabase, а вход ничего не защищал.
//
// Теперь так: дашборд стучится сюда, здесь проверяется токен, и только после
// этого запрос уходит в Supabase под сервисным ключом. Ключ остаётся на
// сервере. Токен выдаётся в обмен на логин и пароль — те же, что и раньше.
//
// Пропускаем только чтение и запись таблиц jm_* и вызов функции рассылки
// push-notify. Ни служебные схемы, ни auth, ни storage через эту дверь
// не достать.

define('SB_URL', 'https://bbiqmkeysalwdonlnylb.supabase.co');

// Ключ — та же схема, что в db.php: сервисный с хостинга, анонимный как
// запасной вариант. Подробности там же.
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

// ── Учётные данные админа ────────────────────────────────────────────────
// Из переменных окружения либо из файла admin_credentials.php рядом
// (см. admin_credentials.example.php).
function admin_credentials(): array {
    $login = getenv('DASHBOARD_LOGIN');
    $pwd   = getenv('DASHBOARD_PASSWORD');
    if (is_string($login) && $login !== '' && is_string($pwd) && $pwd !== '') {
        return ['login' => $login, 'password' => $pwd];
    }

    $file = __DIR__ . '/admin_credentials.php';
    if (is_readable($file)) {
        $v = @include $file;
        if (is_array($v) && !empty($v['login']) && !empty($v['password'])) {
            return ['login' => (string)$v['login'], 'password' => (string)$v['password']];
        }
    }

    return [];
}

// ── CORS ─────────────────────────────────────────────────────────────────
// Дашборд живёт на другом домене, поэтому браузер сначала шлёт preflight.
// Токен передаём заголовком, а не куками, поэтому Allow-Credentials не нужен
// и звёздочки достаточно.
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Admin-Token, Prefer, Range, Range-Unit, Accept, apikey, Authorization, X-Client-Info, Accept-Profile, Content-Profile');
// Content-Range нужен для .select(count) — без него дашборд не увидит счётчики.
header('Access-Control-Expose-Headers: Content-Range');
header('Access-Control-Max-Age: 86400');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }

function fail(int $code, string $msg): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

// ── Токен ────────────────────────────────────────────────────────────────
// Подписываем срок годности ключом, который выводится из сервисного ключа и
// пароля. Меняется пароль — все выданные токены разом становятся негодными.
define('TOKEN_TTL', 12 * 3600);

function token_secret(string $password): string {
    return hash('sha256', SB_KEY . '|' . $password);
}

function token_issue(string $password): string {
    $payload = 'v1.' . (time() + TOKEN_TTL);
    return $payload . '.' . hash_hmac('sha256', $payload, token_secret($password));
}

function token_valid(string $token, string $password): bool {
    $parts = explode('.', $token);
    if (count($parts) !== 3 || $parts[0] !== 'v1') return false;
    $payload = $parts[0] . '.' . $parts[1];
    if (!hash_equals(hash_hmac('sha256', $payload, token_secret($password)), $parts[2])) return false;
    return (int)$parts[1] > time();
}

// ── Ограничение попыток входа ────────────────────────────────────────────
// Пароль — единственная преграда, поэтому перебор надо гасить. Считаем
// неудачи по IP: десять за четверть часа — и дверь закрывается на это время.
define('LOGIN_MAX_FAILS', 10);
define('LOGIN_WINDOW', 900);

function throttle_file(): string {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    return sys_get_temp_dir() . '/jm_admin_login_' . hash('sha256', $ip) . '.json';
}

function throttle_blocked(): bool {
    $f = throttle_file();
    if (!is_readable($f)) return false;
    $st = json_decode((string)@file_get_contents($f), true);
    if (!is_array($st)) return false;
    if (($st['since'] ?? 0) + LOGIN_WINDOW < time()) return false;
    return ($st['fails'] ?? 0) >= LOGIN_MAX_FAILS;
}

function throttle_note_failure(): void {
    $f = throttle_file();
    $st = is_readable($f) ? json_decode((string)@file_get_contents($f), true) : null;
    if (!is_array($st) || ($st['since'] ?? 0) + LOGIN_WINDOW < time()) {
        $st = ['since' => time(), 'fails' => 0];
    }
    $st['fails'] = ($st['fails'] ?? 0) + 1;
    @file_put_contents($f, json_encode($st), LOCK_EX);
}

function throttle_reset(): void { @unlink(throttle_file()); }

$creds = admin_credentials();
if (!$creds) fail(500, 'Admin credentials are not configured on the server');

// ── Вход ─────────────────────────────────────────────────────────────────
if (($_GET['action'] ?? '') === 'login') {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail(405, 'Method not allowed');
    if (throttle_blocked()) fail(429, 'Слишком много попыток. Попробуйте через 15 минут.');

    $body = json_decode((string)file_get_contents('php://input'), true);
    $login = (string)($body['login'] ?? '');
    $pwd   = (string)($body['password'] ?? '');

    // hash_equals, а не ==, чтобы по времени ответа нельзя было подбирать
    // пароль посимвольно.
    $ok = hash_equals($creds['login'], $login) && hash_equals($creds['password'], $pwd);
    if (!$ok) {
        throttle_note_failure();
        fail(401, 'Неверный логин или пароль');
    }

    throttle_reset();
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['token' => token_issue($creds['password']), 'expiresIn' => TOKEN_TTL]);
    exit;
}

// ── Всё остальное — сквозной запрос к базе ───────────────────────────────
$token = $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '';
if (!is_string($token) || $token === '' || !token_valid($token, $creds['password'])) {
    fail(401, 'Not authorized');
}

$path = (string)($_GET['path'] ?? '');
// Только таблицы приложения и одна функция рассылки. Ни auth, ни storage,
// ни служебные схемы.
//
// push-notify здесь потому, что рассылки в дашборде перестали работать, когда
// мы убрали из браузера сервисный ключ: страница зовёт эту функцию, а под
// правило «/rest/v1/jm_*» её адрес не подходит и не подойдёт никогда. Пускаем
// именно её по имени, а не весь /functions/v1 — чтобы через дашборд нельзя
// было запустить что угодно.
$allowed = preg_match('#^/rest/v1/jm_[a-z0-9_]+(\?|$)#', $path)
        || preg_match('#^/functions/v1/push-notify(\?|$)#', $path);
if (!$allowed) {
    fail(400, 'Path not allowed: ' . $path);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!in_array($method, ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'], true)) fail(405, 'Method not allowed');

$hdrs = [
    'apikey: ' . SB_KEY,
    'Authorization: Bearer ' . SB_KEY,
];
// Заголовки, на которых держится PostgREST: Prefer управляет upsert и
// возвратом строк, Range — постраничностью и подсчётом.
foreach ([
    'HTTP_PREFER'       => 'Prefer',
    'HTTP_RANGE'        => 'Range',
    'HTTP_RANGE_UNIT'   => 'Range-Unit',
    'HTTP_ACCEPT'       => 'Accept',
    'CONTENT_TYPE'      => 'Content-Type',
] as $srv => $name) {
    if (!empty($_SERVER[$srv])) $hdrs[] = $name . ': ' . $_SERVER[$srv];
}

$ch = curl_init(SB_URL . $path);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST  => $method,
    CURLOPT_HTTPHEADER     => $hdrs,
    CURLOPT_HEADER         => true,
    CURLOPT_TIMEOUT        => 30,
]);
if (in_array($method, ['POST', 'PATCH', 'PUT'], true)) {
    curl_setopt($ch, CURLOPT_POSTFIELDS, (string)file_get_contents('php://input'));
}

$raw = curl_exec($ch);
if ($raw === false) {
    $err = curl_error($ch);
    curl_close($ch);
    fail(502, 'Upstream error: ' . $err);
}
$status  = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
$hdrSize = (int)curl_getinfo($ch, CURLINFO_HEADER_SIZE);
curl_close($ch);

$rawHeaders = substr($raw, 0, $hdrSize);
$body       = substr($raw, $hdrSize);

http_response_code($status);
// Пробрасываем обратно только то, что нужно клиенту. Всё остальное (в том
// числе всё, что могло бы намекнуть на ключ) отбрасываем.
foreach (explode("\r\n", $rawHeaders) as $line) {
    $p = strpos($line, ':');
    if ($p === false) continue;
    $name = strtolower(trim(substr($line, 0, $p)));
    if ($name === 'content-range' || $name === 'content-type') {
        header(trim(substr($line, 0, $p)) . ':' . substr($line, $p + 1));
    }
}
echo $body;
