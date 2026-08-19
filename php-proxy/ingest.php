<?php
// Забор вакансий из чужих источников.
//
// Вторая половина агрегатора. Первая — /api/v1, которым нашу выдачу читают
// снаружи; эта — про то, как чужие предложения попадают к нам.
//
// Ходим сами, а не ждём, когда пришлют. Иначе партнёру пришлось бы завести у
// себя очередь, повторы при сбоях и наблюдение за доставкой — и первая
// интеграция растянулась бы на месяц вместо дня. Забирать самим дешевле для
// обеих сторон, а частоту мы подстраиваем: смены на сегодня протухают за
// часы, постоянные вакансии живут неделями.
//
// Формат фида — docs/feed-format.md. Обязательных полей три: id, title, url.
// Остальное необязательно ровно затем, чтобы партнёр отдал первую версию
// сегодня, а не после согласования всех полей.

@ini_set('display_errors', '0');
@set_time_limit(300);
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/sb_lite.php';

function ing_secret(string $name): string
{
    static $file = null;
    $env = getenv($name);
    if (is_string($env) && trim($env) !== '') return trim($env);
    if ($file === null) {
        $p = __DIR__ . '/app_secrets.php';
        $v = is_readable($p) ? @include $p : null;
        $file = is_array($v) ? $v : [];
    }
    return (string)($file[$name] ?? '');
}

// Пропуск тот же, что у остального прокси: этот адрес зовут только наши —
// таймер на сервере и кнопка в панели.
$given = $_SERVER['HTTP_X_APP_SECRET'] ?? '';
$ok = false;
foreach (['APP_SECRET', 'APP_SECRET_PREV'] as $k) {
    $v = ing_secret($k);
    if ($v !== '' && hash_equals($v, $given)) { $ok = true; break; }
}
if (!$ok) { http_response_code(403); echo json_encode(['error' => 'Forbidden']); exit; }

/** Отпечаток «та же самая работа». */
function ing_dedupe_key(array $v): string
{
    // Нарочно грубо: компания, должность, метро, дата, начало. Точнее — значит
    // считать разными вакансии, отличающиеся лишним пробелом в адресе, и
    // показывать человеку одно и то же дважды.
    $norm = fn($s) => preg_replace('/\s+/u', ' ', mb_strtolower(trim((string)$s)));
    // Станцию берём приведённую: у двух источников одна и та же смена
    // приходит как «м. Тёплый Стан» и «Теплый стан», и по исходным строкам
    // отпечатки не совпали бы — то есть дедуп не сработал бы именно там,
    // ради чего он и заведён.
    return substr(hash('sha256', implode('|', [
        $norm($v['company'] ?? ''), $norm($v['title'] ?? ''),
        $norm($v['metro_station_norm'] ?? $v['metro_station'] ?? ''),
        (string)($v['date'] ?? ''),
        (string)($v['time_start'] ?? ''),
    ])), 0, 32);
}

/**
 * Станция метро из нашего справочника — по тому, что прислал источник.
 *
 * В фидах она бывает какой угодно: «м. Тёплый Стан», «Теплый стан»,
 * «Тёплый Стан (Калужско-Рижская)», «Тёплый Стан, 7 минут пешком». А фильтр
 * в приложении сравнивает станцию точным равенством с нашим написанием, и
 * любое из этих написаний не совпадает ни с чем. Причём молча: человек
 * выбирает станцию и видит пустой список.
 *
 * Возвращает [станция, ветка] или [null, null], если не узнали. Не узнали —
 * значит не узнали: подставить похожую станцию хуже, чем оставить пусто,
 * потому что человек поедет не туда.
 */
function ing_metro(?string $raw): array
{
    static $карта = null;
    static $ключи = null;
    if ($карта === null) {
        $v = @include __DIR__ . '/metro.php';
        $карта = is_array($v) ? $v : [];
        // Длинные названия проверяем первыми: иначе «Площадь Ильича» нашлась
        // бы как «Площадь…» чего-нибудь другого, а «Парк Победы» — внутри
        // «Парк Победы (южный вход)» после более короткого «Парк».
        $ключи = array_keys($карта);
        usort($ключи, fn($a, $b) => mb_strlen($b) - mb_strlen($a));
    }
    if ($raw === null) return [null, null];

    $норм = function (string $s): string {
        $s = mb_strtolower(trim($s));
        $s = str_replace(['ё', '–', '—', '−'], ['е', '-', '-', '-'], $s);
        // Скобки с названием ветки, приставки «м.», «метро», «ст.».
        $s = preg_replace('~\(.*?\)~u', ' ', $s);
        $s = preg_replace('~^\s*(ст\.?\s*)?(м\.|метро|станция)\s*~u', '', $s);
        $s = preg_replace('~[^\p{L}\p{N}\- ]+~u', ' ', $s);
        return trim(preg_replace('~\s+~u', ' ', $s));
    };

    $s = $норм($raw);
    if ($s === '') return [null, null];

    foreach ($ключи as $ст) {
        $n = $норм($ст);
        // Точное совпадение либо станция целым словом внутри строки:
        // «тёплый стан, 7 минут пешком» — это «Тёплый Стан».
        if ($s === $n || preg_match('~(^|\s)' . preg_quote($n, '~') . '($|\s|,)~u', $s)) {
            return [$ст, $карта[$ст]];
        }
    }
    return [null, null];
}

/** За что платят: shift | hour | month. Всё непонятное — по виду вакансии. */
function ing_pay_period(?string $raw, string $kind): string
{
    $s = mb_strtolower(trim((string)$raw));
    if ($s === '') return $kind === 'permanent' ? 'month' : 'shift';
    if (preg_match('~час|hour~u', $s)) return 'hour';
    if (preg_match('~мес|month~u', $s)) return 'month';
    if (preg_match('~смен|shift|день|day~u', $s)) return 'shift';
    return $kind === 'permanent' ? 'month' : 'shift';
}

/**
 * Профессия по заголовку. Наш справочник из четырёх, всё прочее — null.
 *
 * Именно null, а не «кладовщик по умолчанию»: чужая вакансия курьера,
 * записанная кладовщиком, всплывёт у человека, который ищет склад, и это
 * хуже, чем не всплыть нигде.
 */
function ing_work_type(?string $raw, string $title): ?string
{
    $известные = ['stocker', 'cook', 'shift_supervisor', 'picker'];
    $wt = mb_strtolower(trim((string)$raw));
    if (in_array($wt, $известные, true)) return $wt;
    $t = mb_strtolower($title);
    if (mb_strpos($t, 'повар') !== false) return 'cook';
    if (mb_strpos($t, 'сборщик') !== false || mb_strpos($t, 'комплектов') !== false) return 'picker';
    if (mb_strpos($t, 'старш') !== false || mb_strpos($t, 'бригадир') !== false) return 'shift_supervisor';
    if (mb_strpos($t, 'кладовщик') !== false || mb_strpos($t, 'склад') !== false
        || mb_strpos($t, 'грузчик') !== false) return 'stocker';
    return null;
}

/** Дата в виде YYYY-MM-DD, иначе null. */
function ing_date(?string $raw): ?string
{
    $s = trim((string)$raw);
    if ($s === '') return null;
    if (preg_match('~^(\d{4})-(\d{2})-(\d{2})~', $s, $m)) {
        return checkdate((int)$m[2], (int)$m[3], (int)$m[1]) ? "$m[1]-$m[2]-$m[3]" : null;
    }
    // 31.12.2026 и 31/12/2026 — оба встречаются в выгрузках.
    if (preg_match('~^(\d{2})[./](\d{2})[./](\d{4})$~', $s, $m)) {
        return checkdate((int)$m[2], (int)$m[1], (int)$m[3]) ? "$m[3]-$m[2]-$m[1]" : null;
    }
    return null;
}

/** Время в виде HH:MM, иначе null. «9:00», «09.00» и «0900» тоже понимаем. */
function ing_time(?string $raw): ?string
{
    $s = trim((string)$raw);
    if ($s === '') return null;
    if (preg_match('~^(\d{1,2})[:.](\d{2})~', $s, $m)) {
        $h = (int)$m[1]; $i = (int)$m[2];
    } elseif (preg_match('~^(\d{2})(\d{2})$~', $s, $m)) {
        $h = (int)$m[1]; $i = (int)$m[2];
    } else {
        return null;
    }
    if ($h > 23 || $i > 59) return null;
    return sprintf('%02d:%02d', $h, $i);
}

/** Привести запись фида к нашему виду. Возвращает null, если она бесполезна. */
function ing_normalize(array $it, string $sourceId): ?array
{
    $ext = trim((string)($it['id'] ?? ''));
    $title = trim((string)($it['title'] ?? ''));
    $url = trim((string)($it['url'] ?? ''));
    // Три обязательных поля. Без ссылки показывать чужую вакансию нельзя —
    // это была бы перепечатка чужого содержимого без пути к источнику.
    if ($ext === '' || $title === '' || !preg_match('~^https?://~i', $url)) return null;

    $kind = ($it['kind'] ?? 'shift') === 'permanent' ? 'permanent' : 'shift';
    $loc = is_array($it['location'] ?? null) ? $it['location'] : [];

    // Исходное написание оставляем в metro_station, приведённое кладём
    // рядом. Разбор ошибётся — по исходному видно, что именно прислали, а не
    // только то, во что мы это превратили.
    [$станция, $ветка] = ing_metro(isset($it['metro']) ? (string)$it['metro'] : null);

    $row = [
        'id'            => substr(hash('sha256', $sourceId . '|' . $ext), 0, 24),
        'source_id'     => $sourceId,
        'external_id'   => $ext,
        'title'         => mb_substr($title, 0, 200),
        'company'       => isset($it['company']) ? mb_substr((string)$it['company'], 0, 200) : null,
        'metro_station' => isset($it['metro']) ? mb_substr((string)$it['metro'], 0, 100) : null,
        'address'       => isset($it['address']) ? mb_substr((string)$it['address'], 0, 300) : null,
        'lat'           => isset($loc['lat']) ? (float)$loc['lat'] : null,
        'lng'           => isset($loc['lon']) ? (float)$loc['lon'] : null,
        'metro_station_norm' => $станция,
        'metro_line_id'      => $ветка,
        'work_type'     => ing_work_type($it['work_type'] ?? null, $title),
        'kind'          => $kind,
        'date'          => ing_date($it['date'] ?? null),
        'time_start'    => ing_time($it['time_start'] ?? null),
        'time_end'      => ing_time($it['time_end'] ?? null),
        'salary'        => isset($it['pay']) && $it['pay'] !== null ? (float)$it['pay'] : null,
        'pay_period'    => ing_pay_period($it['pay_period'] ?? null, $kind),
        'schedule'      => isset($it['schedule']) ? mb_substr((string)$it['schedule'], 0, 100) : null,
        'description'   => isset($it['description']) ? mb_substr((string)$it['description'], 0, 2000) : null,
        'url'           => $url,
        'active'        => ($it['active'] ?? true) ? true : false,
        'last_seen_at'  => now_iso(),
    ];
    $row['dedupe_key'] = ing_dedupe_key($row);
    return $row;
}

/** Сходить в один источник. */
function ing_run_source(array $src): array
{
    $hdrs = ['Accept: application/json'];
    if (!empty($src['auth_header']) && !empty($src['auth_value'])) {
        $hdrs[] = $src['auth_header'] . ': ' . $src['auth_value'];
    }

    $ch = curl_init($src['url']);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $hdrs,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
    ]);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($body === false || $code >= 400) {
        return ['status' => "не ответил ($code $err)", 'count' => 0];
    }

    $dec = json_decode($body, true);
    $items = is_array($dec['items'] ?? null) ? $dec['items'] : (is_array($dec) ? $dec : null);
    if (!is_array($items)) return ['status' => 'ответ не разобрать', 'count' => 0];

    $rows = [];
    $skipped = 0;
    foreach ($items as $it) {
        if (!is_array($it)) { $skipped++; continue; }
        $r = ing_normalize($it, (string)$src['id']);
        if ($r === null) { $skipped++; continue; }
        $rows[] = $r;
    }

    // Пачкой, а не по одной: триста записей по одному запросу — это триста
    // обращений к базе на каждый заход, и сорванный таймаут при первом же
    // крупном фиде.
    foreach (array_chunk($rows, 200) as $chunk) {
        sb_upsert_rows('jm_ext_vacancies', $chunk, 'source_id,external_id');
    }

    // Пропавшие из фида гасим. Признак — last_seen_at старше начала захода:
    // всё, что пришло сейчас, только что обновилось.
    //
    // Только для полного фида. Если партнёр отдаёт постранично или по
    // updated_since, «не пришло» не значит «пропало», и гасить было бы
    // вредительством.
    $gone = 0;
    if (empty($dec['has_more']) && $rows) {
        $cutoff = gmdate('Y-m-d\TH:i:s', time() - 120) . 'Z';
        $stale = sb_select('jm_ext_vacancies', [
            'source_id' => 'eq.' . $src['id'],
            'active' => 'is.true',
            'last_seen_at' => 'lt.' . $cutoff,
            'limit' => '1000',
        ], 'id');
        foreach (array_chunk(array_column($stale, 'id'), 100) as $chunk) {
            sb_update('jm_ext_vacancies', ['id' => 'in.(' . implode(',', $chunk) . ')'], ['active' => false]);
        }
        $gone = count($stale);
    }

    return [
        'status' => "ок: получено " . count($rows) . ", пропущено $skipped, погашено $gone",
        'count'  => count($rows),
    ];
}

// ── Сам заход ─────────────────────────────────────────────────────────────

$only = trim((string)($_GET['source'] ?? ''));   // для кнопки «проверить сейчас»
$force = ($_GET['force'] ?? '') !== '';

$f = ['enabled' => 'is.true'];
if ($only !== '') $f['id'] = 'eq.' . $only;
$sources = sb_select('jm_ext_sources', $f);

$done = [];
foreach ($sources as $src) {
    // Расписание проверяем здесь, а не таймером: у каждого источника оно своё,
    // а таймер один.
    if (!$force && !empty($src['last_run_at'])) {
        $age = time() - strtotime((string)$src['last_run_at']);
        if ($age < (int)$src['period_min'] * 60) continue;
    }
    $res = ing_run_source($src);
    sb_update('jm_ext_sources', ['id' => 'eq.' . $src['id']], [
        'last_run_at' => now_iso(),
        'last_status' => $res['status'],
        'last_count'  => $res['count'],
    ]);
    $done[] = ['name' => $src['name'], 'status' => $res['status']];
}

echo json_encode(['ok' => true, 'sources' => count($sources), 'run' => $done], JSON_UNESCAPED_UNICODE);
