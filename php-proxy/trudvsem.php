<?php
// Адаптер официального API «Работа в России» (trudvsem.ru) под формат JobToo.
// Берём только Москву. Все записи приходят как kind=permanent: поэтому они
// показываются в разделе «Работа», а сменные/гибкие из них дополнительно
// попадают в «Подработка → Регулярная» по уже существующей классификации UI.

@ini_set('display_errors', '0');
@set_time_limit(120);
header('Content-Type: application/json; charset=utf-8');

function tv_cfg(string $name, string $default): string
{
    static $file = null;
    $env = getenv($name);
    if (is_string($env) && trim($env) !== '') return trim($env);
    if ($file === null) {
        $p = __DIR__ . '/app_secrets.php';
        $v = is_readable($p) ? @include $p : null;
        $file = is_array($v) ? $v : [];
    }
    $v = (string)($file[$name] ?? '');
    return $v !== '' ? $v : $default;
}

// Москва — код региона в API «Работа в России».
$REGION = tv_cfg('TRUDVSEM_REGION_CODE', '7700000000000');
$BASE = rtrim(tv_cfg('TRUDVSEM_API_BASE', 'http://opendata.trudvsem.ru/api/v1/vacancies/region'), '/');
$SELF = tv_cfg('TRUDVSEM_SELF_URL', 'https://jobtoo.ru/api/trudvsem.php');
$LIMIT = 100;
$offset = isset($_GET['offset']) ? max(0, (int)$_GET['offset']) : 0;

function tv_iso($value, string $fallback): string {
    $value = trim((string)$value);
    if (!preg_match('~^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$~', $value)) return $fallback;
    return strtotime($value) === false ? $fallback : $value;
}

function tv_queue($value): array {
    $raw = is_string($value) && strlen($value) <= 4096 ? json_decode($value, true) : null;
    if (!is_array($raw)) return [];
    $out = [];
    foreach (array_slice($raw, 0, 32) as $range) {
        if (!is_array($range) || count($range) !== 2) continue;
        $from = tv_iso($range[0] ?? '', '');
        $to = tv_iso($range[1] ?? '', '');
        if ($from !== '' && $to !== '' && strtotime($from) <= strtotime($to)) $out[] = [$from, $to];
    }
    return $out;
}

function tv_fetch(string $base, string $region, int $offset, int $limit,
    string $from, string $to): array {
    $url = $base . '/' . rawurlencode($region) . '?' . http_build_query([
        'offset' => $offset,
        'limit' => $limit,
        'modifiedFrom' => $from,
        'modifiedTo' => $to,
    ], '', '&', PHP_QUERY_RFC3986);
    $body = '';
    $tooLarge = false;
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => false,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 45,
        CURLOPT_FOLLOWLOCATION => false,
        // Официальный мануал API публикует opendata.trudvsem.ru по HTTP.
        CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_WRITEFUNCTION => function ($ch, string $chunk) use (&$body, &$tooLarge): int {
            if (strlen($body) + strlen($chunk) > 8 * 1024 * 1024) {
                $tooLarge = true;
                return 0;
            }
            $body .= $chunk;
            return strlen($chunk);
        },
    ]);
    $ok = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($tooLarge) return ['error' => 'trudvsem response too large'];
    if ($ok === false || $code < 200 || $code >= 300) {
        return ['error' => "trudvsem unavailable ($code $err)"];
    }
    $dec = json_decode($body, true);
    return is_array($dec) ? ['data' => $dec] : ['error' => 'trudvsem invalid JSON'];
}

// API «Работы России» не отдаёт больше 10 000 записей из одной выборки:
// offset=100 при limit=100 уже отвечает 500. Разбиваем строго московскую
// выборку по времени изменения. Очередь диапазонов находится в next_url,
// поэтому основной ingest сохраняет её в своём обычном checkpoint.
// Портал запущен значительно позже; начало 2000 года покрывает весь набор и
// не провоцирует нестабильный 500, который API иногда даёт на диапазон от 1970.
$defaultFrom = '2000-01-01T00:00:00Z';
$defaultTo = gmdate('Y-m-d\\TH:i:s\\Z', time() + 86400);
$from = tv_iso($_GET['from'] ?? '', $defaultFrom);
$to = tv_iso($_GET['to'] ?? '', $defaultTo);
$queue = tv_queue($_GET['queue'] ?? '');
$dec = null;
$shardTotal = 0;

for ($split = 0; $split < 32; $split++) {
    $fetched = tv_fetch($BASE, $REGION, $offset, $LIMIT, $from, $to);
    if (isset($fetched['error'])) {
        http_response_code(502);
        echo json_encode(['error' => $fetched['error']]);
        exit;
    }
    $dec = $fetched['data'];
    $shardTotal = (int)($dec['meta']['total'] ?? $dec['results']['total'] ?? $dec['total'] ?? 0);
    if ($shardTotal <= 10000) break;

    $fromTs = strtotime($from);
    $toTs = strtotime($to);
    if ($fromTs === false || $toTs === false || $toTs - $fromTs < 2) {
        http_response_code(502);
        echo json_encode(['error' => 'trudvsem range cannot be split below 10000 records']);
        exit;
    }
    $mid = intdiv($fromTs + $toTs, 2);
    // Граница намеренно входит в оба диапазона: upsert уберёт возможный
    // дубль, а вакансия с дробными секундами между mid и mid+1 не потеряется.
    array_unshift($queue, [gmdate('Y-m-d\\TH:i:s\\Z', $mid), $to]);
    $to = gmdate('Y-m-d\\TH:i:s\\Z', $mid);
    $offset = 0;
}

if (!is_array($dec) || $shardTotal > 10000) {
    http_response_code(502);
    echo json_encode(['error' => 'trudvsem range split limit exceeded']);
    exit;
}

// API обычно отдаёт results.vacancies = [{vacancy:{...}}, ...].
$rows = $dec['results']['vacancies'] ?? $dec['vacancies'] ?? $dec['items'] ?? [];
if (!is_array($rows)) $rows = [];

function tv_text($v): string {
    $s = html_entity_decode(strip_tags((string)$v), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $s = preg_replace('~[ \t]+~u', ' ', $s);
    $s = preg_replace('~\s*\n\s*~u', "\n", $s);
    return trim($s);
}

function tv_first(array $v, array $paths) {
    foreach ($paths as $path) {
        $cur = $v;
        foreach (explode('.', $path) as $k) {
            if (!is_array($cur) || !array_key_exists($k, $cur)) { $cur = null; break; }
            $cur = $cur[$k];
        }
        if ($cur !== null && $cur !== '') return $cur;
    }
    return null;
}

$items = [];
foreach ($rows as $row) {
    if (!is_array($row)) continue;
    $v = is_array($row['vacancy'] ?? null) ? $row['vacancy'] : $row;

    $id = (string)tv_first($v, ['id','vacancy_id']);
    $title = trim((string)tv_first($v, ['job-name','job_name','title','name']));
    $vacUrl = trim((string)tv_first($v, ['vac_url','vacancy_url','url']));
    if ($id === '' || $title === '' || !preg_match('~^https?://~i', $vacUrl)) continue;
    if (str_starts_with($vacUrl, 'http://')) $vacUrl = 'https://' . substr($vacUrl, 7);

    $company = tv_first($v, ['company.name','company_name','employer.name']);
    $schedule = tv_first($v, ['schedule','work_schedule']);
    $employment = tv_first($v, ['employment','employment_type']);
    $address = tv_first($v, ['addresses.address.0.address','address','location.address']);
    if ($address === null && is_array($v['addresses']['address'] ?? null)) {
        $a0 = $v['addresses']['address'][0] ?? null;
        if (is_array($a0)) $address = $a0['address'] ?? null;
    }

    $salaryMin = tv_first($v, ['salary_min','salary.min','salary.from']);
    $salaryMax = tv_first($v, ['salary_max','salary.max','salary.to']);
    $salary = null;
    if (is_numeric($salaryMin)) $salary = (float)$salaryMin;
    elseif (is_numeric($salaryMax)) $salary = (float)$salaryMax;

    $descParts = [];
    foreach (['duty','requirement.qualification','requirement.education','requirement.experience','description'] as $p) {
        $x = tv_first($v, [$p]);
        if ($x !== null && $x !== '') $descParts[] = tv_text($x);
    }
    $description = trim(implode("\n\n", array_filter($descParts)));

    // Для «Регулярной» UI ищет маркеры сменности/частичной занятости именно
    // в schedule/description. Сохраняем оба официальных поля без выдумывания.
    $scheduleLabel = trim(implode(' · ', array_filter([(string)$schedule, (string)$employment])));

    $item = [
        'id' => $id,
        'title' => $title,
        'kind' => 'permanent',
        'url' => $vacUrl,
        'active' => true,
        'pay_period' => 'month',
    ];
    if ($company !== null) $item['company'] = (string)$company;
    if ($address !== null) $item['address'] = (string)$address;
    if ($salary !== null && $salary > 0) $item['pay'] = $salary;
    if ($scheduleLabel !== '') $item['schedule'] = $scheduleLabel;
    if ($description !== '') $item['description'] = $description;
    $items[] = $item;
}

// В разных версиях API total лежит в meta.total либо results.total.
$total = $dec['meta']['total'] ?? $dec['results']['total'] ?? $dec['total'] ?? null;
// offset в API — номер страницы, а не число пропущенных вакансий.
$hasMore = count($rows) > 0 && (is_numeric($total)
    ? (($offset + 1) * $LIMIT < (int)$total)
    : (count($rows) >= $LIMIT));
$out = ['items' => $items, 'has_more' => $hasMore,
    'page' => $offset, 'page_size' => $LIMIT,
    'total' => is_numeric($total) ? (int)$total : null,
    'range' => ['from' => $from, 'to' => $to]];

$nextOffset = $offset + 1;
if (!$hasMore && $queue) {
    [$from, $to] = array_shift($queue);
    $nextOffset = 0;
    $hasMore = true;
    $out['has_more'] = true;
}
if ($hasMore) {
    $out['next_url'] = $SELF . '?' . http_build_query([
        'offset' => $nextOffset,
        'from' => $from,
        'to' => $to,
        'queue' => $queue ? json_encode($queue, JSON_UNESCAPED_SLASHES) : null,
    ], '', '&', PHP_QUERY_RFC3986);
}

echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
