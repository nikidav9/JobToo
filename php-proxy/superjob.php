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
$catalogueIndex = max(0, (int)($_GET['catalogue_index'] ?? 0));
$limit = 100;

function sj_get_json(string $url, string $secret, bool $expectObjects = false): array {
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
        throw new RuntimeException($tooLarge
            ? 'superjob response too large' : "superjob unavailable ($code $error)");
    }
    $decoded = json_decode($body, true);
    if (!is_array($decoded) || ($expectObjects && !is_array($decoded['objects'] ?? null))) {
        throw new RuntimeException('superjob invalid JSON');
    }
    return $decoded;
}

/**
 * API SuperJob отдаёт максимум 500 результатов одного поискового запроса.
 * Поэтому полный московский каталог обходим по конечным рубрикам каталога;
 * повторные вакансии затем безопасно склеиваются по external_id.
 */
function sj_catalogue_ids(string $apiBase, string $secret): array {
    $cache = sys_get_temp_dir() . '/jobtoo-superjob-catalogues.json';
    if (is_file($cache) && filemtime($cache) > time() - 86400) {
        $saved = json_decode((string)file_get_contents($cache), true);
        if (is_array($saved) && count($saved) > 0) return array_values($saved);
    }
    $catalogues = sj_get_json($apiBase . '/catalogues/', $secret);
    $ids = [];
    foreach ($catalogues as $parent) {
        if (!is_array($parent)) continue;
        foreach (($parent['positions'] ?? []) as $position) {
            $id = is_array($position) ? (int)($position['key'] ?? 0) : 0;
            if ($id > 0) $ids[$id] = true;
        }
    }
    $ids = array_keys($ids);
    sort($ids, SORT_NUMERIC);
    if (!$ids) throw new RuntimeException('superjob catalogues are empty');
    @file_put_contents($cache . '.tmp', json_encode($ids), LOCK_EX);
    @rename($cache . '.tmp', $cache);
    return $ids;
}

try {
    $catalogueIds = sj_catalogue_ids($apiBase, $secret);
    if ($catalogueIndex >= count($catalogueIds)) {
        echo json_encode(['items' => [], 'has_more' => false, 'page' => 0], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $catalogueId = (int)$catalogueIds[$catalogueIndex];
    // Не превышаем публичное ограничение 120 запросов в минуту.
    usleep(550000);
    $url = $apiBase . '/vacancies/?' . http_build_query([
        'town' => $town, 'catalogues' => $catalogueId,
        'page' => $page, 'count' => $limit,
    ], '', '&', PHP_QUERY_RFC3986);
    $decoded = sj_get_json($url, $secret, true);
} catch (Throwable $e) {
    http_response_code(502);
    echo json_encode(['error' => $e->getMessage()]);
    exit;
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
    if ($metro !== '') $item['metro'] = $metro;
    if ($salary > 0) $item['pay'] = $salary;
    if ($schedule !== '') $item['schedule'] = $schedule;
    if ($description !== '') $item['description'] = $description;
    $items[] = $item;
}

$hasMoreInCatalogue = !empty($decoded['more']);
$hasMore = $hasMoreInCatalogue || $catalogueIndex + 1 < count($catalogueIds);
$out = ['items' => $items, 'has_more' => $hasMore, 'page' => $page,
    'catalogue' => $catalogueId,
    'catalogue_total' => isset($decoded['total']) ? (int)$decoded['total'] : null];
if ($hasMore) {
    $nextPage = $hasMoreInCatalogue ? $page + 1 : 0;
    $nextCatalogue = $hasMoreInCatalogue ? $catalogueIndex : $catalogueIndex + 1;
    $out['next_url'] = $selfUrl . (str_contains($selfUrl, '?') ? '&' : '?')
        . http_build_query(['catalogue_index' => $nextCatalogue, 'page' => $nextPage], '', '&', PHP_QUERY_RFC3986);
}
echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
