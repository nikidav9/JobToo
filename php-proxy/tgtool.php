<?php
/**
 * Служебные действия с телеграм-ботом: пост в общую группу и настройка
 * вебхука.
 *
 * Отдельным файлом, а не внутри db.php, по прозаичной причине: db.php весит
 * под сотню килобайт, и когда обычная выкладка недоступна, дописывать его
 * через API дорого. Здесь же всё нужное умещается в пару килобайт.
 *
 * Токен бота наружу не передаётся ни при каких вызовах — сервер берёт его
 * сам из app_secrets.php.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-App-Secret');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(200); exit; }
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405); echo json_encode(['error' => 'Method not allowed']); exit;
}

/** Секреты — из окружения либо из app_secrets.php рядом. Как в db.php. */
function jt_secret(string $name): string {
    static $file = null;
    $env = getenv($name);
    if (is_string($env) && trim($env) !== '') return trim($env);
    if ($file === null) {
        $p = __DIR__ . '/app_secrets.php';
        $v = is_readable($p) ? @include $p : null;
        $file = is_array($v) ? $v : [];
    }
    return !empty($file[$name]) ? (string)$file[$name] : '';
}

$provided = $_SERVER['HTTP_X_APP_SECRET'] ?? '';
$ok = false;
foreach ([jt_secret('APP_SECRET'), jt_secret('APP_SECRET_PREV')] as $s) {
    if ($s !== '' && hash_equals($s, $provided)) $ok = true;
}
if (!$ok) { http_response_code(403); echo json_encode(['error' => 'Forbidden']); exit; }

$TOKEN = jt_secret('TG_BOT_TOKEN');
if ($TOKEN === '') {
    http_response_code(500);
    echo json_encode(['error' => 'TG_BOT_TOKEN не задан на сервере'], JSON_UNESCAPED_UNICODE); exit;
}

// Куда писать и куда слать вебхук — только отсюда, не из запроса. Пропуск к
// этому файлу тот же, что у db.php, а он лежит в открытом коде: с адресом
// из параметра ботом можно было бы писать в любой чат и увести вебхук.
$GROUP = (int)(getenv('TG_GROUP_CHAT_ID') ?: -1001709270025);
$HOOK  = getenv('TG_HOOK_URL') ?: 'https://tg.jobtoo.ru/api/tg.php';

function tg(string $method, array $payload = [], string $verb = 'POST'): array {
    global $TOKEN;
    $ch = curl_init('https://api.telegram.org/bot' . $TOKEN . '/' . $method);
    $opts = [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_SSL_VERIFYPEER => true];
    if ($verb === 'POST') {
        $opts[CURLOPT_POST] = true;
        $opts[CURLOPT_HTTPHEADER] = ['Content-Type: application/json'];
        $opts[CURLOPT_POSTFIELDS] = json_encode($payload, JSON_UNESCAPED_UNICODE);
    }
    curl_setopt_array($ch, $opts);
    $resp = curl_exec($ch); curl_close($ch);
    $dec = json_decode($resp ?: 'null', true);
    return is_array($dec) ? $dec : ['ok' => false, 'raw' => $resp];
}

$body   = json_decode((string)file_get_contents('php://input'), true);
$action = is_array($body) ? (string)($body['action'] ?? '') : '';

switch ($action) {
    // Объявление для всех разом — одним постом в группу, а не письмами каждому.
    case 'postToGroup': {
        $text = trim((string)($body['text'] ?? ''));
        if ($text === '') { echo json_encode(['error' => 'Пустой текст'], JSON_UNESCAPED_UNICODE); exit; }
        $res = tg('sendMessage', [
            'chat_id' => $GROUP,
            'text' => $text,
            'parse_mode' => 'HTML',
            'disable_web_page_preview' => true,
        ]);
        echo json_encode(['chat' => $GROUP, 'telegram' => $res], JSON_UNESCAPED_UNICODE);
        break;
    }

    // Нужно после смены токена: вебхук привязан к боту, но переставить его
    // может только тот, у кого есть действующий токен.
    case 'setWebhook': {
        $res = tg('setWebhook', [
            'url' => $HOOK,
            'secret_token' => jt_secret('APP_SECRET'),
            'allowed_updates' => ['message', 'callback_query'],
        ]);
        echo json_encode(['target' => $HOOK, 'telegram' => $res], JSON_UNESCAPED_UNICODE);
        break;
    }

    case 'webhookInfo':
        echo json_encode(tg('getWebhookInfo', [], 'GET'), JSON_UNESCAPED_UNICODE);
        break;

    case 'me':
        echo json_encode(tg('getMe', [], 'GET'), JSON_UNESCAPED_UNICODE);
        break;

    default:
        http_response_code(400);
        echo json_encode(['error' => 'Неизвестное действие: ' . $action], JSON_UNESCAPED_UNICODE);
}
