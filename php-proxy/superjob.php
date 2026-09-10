<?php
// Каталог вакансий SuperJob → общий формат фида JobToo.
// Публичный поиск требует ключ зарегистрированного приложения, но не требует
// OAuth пользователя, пока не запрашиваются контакты и не отправляется отклик.

@ini_set('display_errors', '0');
@set_time_limit(120);
header('Content-Type: application/json; charset=utf-8');

function sj_cfg(string $name, string $default = ''): string {
    static $file = null;
    $env = getenv($name);
    if (is_string($env) && trim($env) !== '') return trim($env);
    if ($file === null) {
        $values = is_readable(__DIR__ . '/app_secrets.php') ? @include __DIR__ . '/app_secrets.php' : null;
        $file = is_array($values) ? $values : [];
    }
    $value = (string)($file[$name] ?? '');
    return $value !== '' ? $value : $default;
}

$secret = sj_cfg('SUPERJOB_SECRET_KEY');
if ($secret === '') {
    http_response_code(503);
    echo json_encode(['error' => 'SUPERJOB_SECRET_KEY is not configured']);
    exit;
}

$apiBase = rtrim(sj_cfg('SUPERJOB_API_BASE', 'https://api.superjob.ru/2.0'), '/');
$selfUrl = sj_cfg('SUPERJOB_SELF_URL', 'https://jobtoo.ru/api/superjob.php');
$town = max(1, (int)sj_cfg('SUPERJOB_TOWN_ID', '4')); // 4 — Москва
$page = max(0, (int)($_GET['page'] ?? 0));
$limit = 100;
$url = $apiBase . '/vacancies/?' . http_build_query([
    'town' => $town, 'page' => $page, 'count' => $limit,
], '', '&', PHP_QUERY_RFC3986);

$body = '';
$tooLarge = false;
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => false,
    CURLOPT_HTTPHEADER => ['Accept: application/json', 'X-Api-App-Id: ' . $secret],
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 45,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
    CURLOPT_WRITEFUNCTION => function ($ch, string $chunk) use (&$body, &$tooLarge): int {
        if (strlen($body) + strlen($chunk) > 8 * 1024 * 1024) {
            $tooLarge = true; return 0;
        }
        $body .= $chunk;
        return strlen($chunk);
    },
]);
$ok = curl_exec($ch);
$code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);
if ($tooLarge || $ok === false || $code < 200 || $code >= 300) {
    http_response_code(502);
    echo json_encode(['error' => $tooLarge ? 'superjob response too large' : "superjob unavailable ($code $error)"]);
    exit;
}
$decoded = json_decode($body, true);
if (!is_array($decoded) || !is_array($decoded['objects'] ?? null)) {
    http_response_code(502); echo json_encode(['error' => 'superjob invalid JSON']); exit;
}

function sj_text($value): string {
    $text = html_entity_decode(strip_tags((string)$value), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = preg_replace('~[ \t]+~u', ' ', $text);
    return trim(preg_replace('~\s*\n\s*~u', "\n", $text));
}

function sj_title($value): string {
    return is_array($value) ? trim((string)($value['title'] ?? '')) : trim((string)$value);
}

$items = [];
foreach ($decoded['objects'] as $vacancy) {
    if (!is_array($vacancy)) continue;
    $id = trim((string)($vacancy['id'] ?? ''));
    $title = trim((string)($vacancy['profession'] ?? ''));
    $link = trim((string)($vacancy['link'] ?? ''));
    if ($id === '' || $title === '' || !preg_match('~^https://(?:www\.)?superjob\.ru/~i', $link)) continue;

    $description = implode("\n\n", array_filter(array_map('sj_text', [
        $vacancy['work'] ?? '', $vacancy['candidat'] ?? '', $vacancy['compensation'] ?? '',
    ])));
    $schedule = implode(' · ', array_filter([
        sj_title($vacancy['type_of_work'] ?? null),
        sj_title($vacancy['place_of_work'] ?? null),
    ]));
    $metro = '';
    if (is_array($vacancy['metro'] ?? null)) {
        $first = $vacancy['metro'][0] ?? null;
        $metro = sj_title($first);
    }
    $salaryFrom = is_numeric($vacancy['payment_from'] ?? null) ? (float)$vacancy['payment_from'] : 0;
    $salaryTo = is_numeric($vacancy['payment_to'] ?? null) ? (float)$vacancy['payment_to'] : 0;
    $salary = $salaryFrom > 0 ? $salaryFrom : $salaryTo;

    $item = [
        'id' => $id, 'title' => $title, 'kind' => 'permanent',
        'url' => $link, 'active' => true, 'pay_period' => 'month',
    ];
    $company = trim((string)($vacancy['firm_name'] ?? ''));
    $address = trim((string)($vacancy['address'] ?? ''));
    if ($company !== '') $item['company'] = $company;
    if ($address !== '') $item['address'] = $address;
    if ($metro !== '') $item['metro_station'] = $metro;
    if ($salary > 0) $item['pay'] = $salary;
    if ($schedule !== '') $item['schedule'] = $schedule;
    if ($description !== '') $item['description'] = $description;
    $items[] = $item;
}

$hasMore = !empty($decoded['more']);
$out = ['items' => $items, 'has_more' => $hasMore, 'page' => $page,
    'total' => isset($decoded['total']) ? (int)$decoded['total'] : null];
if ($hasMore) {
    $out['next_url'] = $selfUrl . (str_contains($selfUrl, '?') ? '&' : '?') . 'page=' . ($page + 1);
}
echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
