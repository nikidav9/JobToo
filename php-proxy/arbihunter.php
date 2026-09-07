<?php
// Адаптер каталога arbihunter под наш формат фида (docs/feed-format.md).
//
// Зачем отдельный файл, а не «драйвер» внутри ingest.php. Сборщик у нас
// один и общий: он ждёт фид нашего вида — {items:[…], has_more, next_url}.
// arbihunter отдаёт свой — {data:[…], total, page, pages, limit} с другими
// именами полей и без ссылки на вакансию. Смешать это со сборщиком значило бы
// впаять чужой формат в общий код, которым ходят и другие партнёры. Поэтому
// вся «чужеродность» arbihunter заперта здесь: сборщик видит обычный фид.
//
// Что делает: ходит в API arbihunter постранично, переводит каждую вакансию
// в нашу запись, ВСЕМ ставит kind=permanent (это раздел «Работа», не
// подработки), и отдаёт нашим же форматом. Сборщик (ingest.php) забирает нас
// как любой другой источник — по адресу, записанному в jm_ext_sources.
//
// Секретов не отдаёт: проксирует публичный каталог arbihunter. Ключ к самому
// arbihunter (если понадобится) и токен защиты этого адаптера берутся из
// окружения/app_secrets.php и наружу не попадают.

@ini_set('display_errors', '0');
@set_time_limit(120);
header('Content-Type: application/json; charset=utf-8');

// ── Настройки. Меняются здесь, либо через окружение / app_secrets.php ──────
//
// ВАЖНО: ARBIHUNTER_VACANCY_URL — публичная страница вакансии, куда уводим
// человека. В API списка ссылки нет, поэтому собираем её из id по шаблону.
// Если реальный путь у arbihunter другой — поменять только эту строку.
function arbi_cfg(string $name, string $default): string
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

$API_BASE   = arbi_cfg('ARBIHUNTER_API_BASE',    'https://api.arbihunter.com/v2/api/vacancy/');
$VAC_URL    = arbi_cfg('ARBIHUNTER_VACANCY_URL', 'https://arbihunter.com/vacancy/{id}');
$SELF_URL   = arbi_cfg('ARBIHUNTER_SELF_URL',    'https://jobtoo.ru/api/arbihunter.php');
$TOKEN      = arbi_cfg('ARBIHUNTER_TOKEN',       '');   // Bearer к arbihunter, если фид закрыт
$FEED_TOKEN = arbi_cfg('ARBIHUNTER_FEED_TOKEN',  '');   // защита нашего адаптера, если нужна
$LANG       = arbi_cfg('ARBIHUNTER_LANG',        'ru');
$INTERNSHIPS = arbi_cfg('ARBIHUNTER_INTERNSHIPS', '0') === '1'; // стажировки — не постоянная работа
$LIMIT = 50;

// Необязательная защита адаптера: если задан токен — требуем его заголовком.
if ($FEED_TOKEN !== '') {
    $given = (string)($_SERVER['HTTP_X_FEED_TOKEN'] ?? '');
    if (!hash_equals($FEED_TOKEN, $given)) {
        http_response_code(403);
        echo json_encode(['error' => 'Forbidden']);
        exit;
    }
}

$page = isset($_GET['page']) ? max(0, (int)$_GET['page']) : 0;

// ── Одна страница каталога arbihunter ─────────────────────────────────────
$url  = $API_BASE . (str_contains($API_BASE, '?') ? '&' : '?') . 'page=' . $page . '&limit=' . $LIMIT;
$hdrs = ['Accept: application/json', 'Accept-Language: ' . $LANG];
if ($TOKEN !== '') $hdrs[] = 'Authorization: Bearer ' . $TOKEN;

$body = '';
$tooLarge = false;
$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => false,
    CURLOPT_HTTPHEADER     => $hdrs,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT        => 45,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_PROTOCOLS      => CURLPROTO_HTTPS,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
    CURLOPT_WRITEFUNCTION  => function ($ch, string $chunk) use (&$body, &$tooLarge): int {
        if (strlen($body) + strlen($chunk) > 6 * 1024 * 1024) { $tooLarge = true; return 0; }
        $body .= $chunk;
        return strlen($chunk);
    },
]);
$ok = curl_exec($ch);
$code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err = curl_error($ch);
curl_close($ch);

if ($tooLarge) { http_response_code(502); echo json_encode(['error' => 'ответ arbihunter больше 6 МБ']); exit; }
if ($ok === false || $code < 200 || $code >= 300) {
    http_response_code(502);
    echo json_encode(['error' => "arbihunter не ответил ($code $err)"]);
    exit;
}
$dec = json_decode($body, true);
if (!is_array($dec)) { http_response_code(502); echo json_encode(['error' => 'arbihunter: JSON не разобрать']); exit; }

// У arbihunter массив вакансий в поле data; на всякий случай примем и голый список.
$data = is_array($dec['data'] ?? null) ? $dec['data'] : (array_is_list($dec) ? $dec : []);

// ── Перевод графика в человеческую подпись ────────────────────────────────
function arbi_schedule(?string $s): ?string
{
    switch (strtoupper(trim((string)$s))) {
        case 'WEEKDAYS': return 'Будни';
        case 'FLEXIBLE': return 'Гибкий график';
        case 'SHIFT':    return 'Сменный';
        default:         return null;
    }
}

// ── Маппинг: вакансия arbihunter → запись нашего фида ──────────────────────
$items = [];
foreach ($data as $v) {
    if (!is_array($v)) continue;

    $id    = (string)($v['id'] ?? '');
    $title = trim((string)($v['title'] ?? ''));
    if ($id === '' || $title === '') continue;

    // Стажировка — не постоянная работа. По умолчанию не берём.
    if (!$INTERNSHIPS && !empty($v['isInternship'])) continue;

    // Снятые/черновики/удалённые не показываем — иначе поведём на мёртвую страницу.
    $status = strtoupper((string)($v['status'] ?? 'PUBLISHED'));
    $active = ($status === '' || $status === 'PUBLISHED') && empty($v['deletedAt']);

    $company = is_array($v['company'] ?? null) ? trim((string)($v['company']['title'] ?? '')) : '';
    $city    = is_array($v['city'] ?? null)    ? trim((string)($v['city']['name'] ?? ''))    : '';

    // Зарплату-число показываем только для помесячной: годовую цифру подписали
    // бы как «в месяц» и ввели человека в заблуждение. Непонятное — без числа.
    $pay = null; $payPeriod = null;
    if (is_array($v['salary'] ?? null)) {
        $type = strtoupper((string)($v['salary']['type'] ?? ''));
        $from = $v['salary']['from'] ?? null;
        if ($from !== null && $type === 'MONTHLY') { $pay = (float)$from; $payPeriod = 'month'; }
    }

    $item = [
        'id'     => $id,
        'title'  => $title,
        'kind'   => 'permanent',
        // Ссылка на вакансию из шаблона по id — без неё наш конвейер вакансию отбросит.
        'url'    => str_replace('{id}', rawurlencode($id), $VAC_URL),
        'active' => $active,
    ];
    if ($company !== '') $item['company'] = $company;
    if ($city !== '')    $item['address'] = $city;
    if (isset($v['description'])) $item['description'] = (string)$v['description'];
    $sch = arbi_schedule($v['schedule'] ?? null);
    if ($sch !== null) $item['schedule'] = $sch;
    if ($pay !== null) { $item['pay'] = $pay; $item['pay_period'] = $payPeriod; }

    $items[] = $item;
}

// ── Пагинация: пока страница полная — есть следующая ───────────────────────
// Считаем по числу пришедших записей, а не по page/pages из ответа: их
// нумерация в примере API противоречива (page с 0, но в примере page=1),
// а «короткая страница — значит последняя» надёжнее и не зависит от этого.
$hasMore = count($data) >= $LIMIT;
$out = ['items' => $items, 'has_more' => $hasMore];
if ($hasMore) {
    $out['next_url'] = $SELF_URL . (str_contains($SELF_URL, '?') ? '&' : '?') . 'page=' . ($page + 1);
}

echo json_encode($out, JSON_UNESCAPED_UNICODE);
