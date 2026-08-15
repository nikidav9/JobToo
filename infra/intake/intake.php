<?php
// Разовая приёмная для секретов прокси.
//
// Нужна потому, что секрету неоткуда взяться на сервере: в репозиторий его
// класть нельзя — он публичный, а других каналов доставки у меня нет.
//
// Защищена тем же паролем, что и панель (basic-auth на 8443), и работает
// только по TLS. Удаляется сразу после использования — это времянка, а не
// часть системы. Если файл остался, значит про него забыли: удалить.
$dir = '/var/www/api';
$body = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($body)) { http_response_code(400); echo 'нужен json'; exit; }

$allowed = ['APP_SECRET','APP_SECRET_PREV','TG_BOT_TOKEN','DASHBOARD_LOGIN','DASHBOARD_PASSWORD'];
$got = [];
foreach ($allowed as $k) {
    if (isset($body[$k]) && $body[$k] !== '') $got[$k] = (string)$body[$k];
}
if (!$got) { http_response_code(400); echo 'пусто'; exit; }

// Раскладываем ровно так, как их ждёт прокси на Reg.ru: те же файлы, те же
// имена. Меньше отличий между площадками — меньше сюрпризов при переезде.
if (isset($got['APP_SECRET']) || isset($got['TG_BOT_TOKEN'])) {
    $a = var_export($got['APP_SECRET'] ?? '', true);
    $r = var_export($got['APP_SECRET_PREV'] ?? '', true);
    $t = var_export($got['TG_BOT_TOKEN'] ?? '', true);
    file_put_contents("$dir/app_secrets.php",
        "<?php return ['APP_SECRET' => $a, 'APP_SECRET_PREV' => $r, 'TG_BOT_TOKEN' => $t];\n");
}
if (isset($got['DASHBOARD_LOGIN'], $got['DASHBOARD_PASSWORD'])) {
    $l = var_export($got['DASHBOARD_LOGIN'], true);
    $p = var_export($got['DASHBOARD_PASSWORD'], true);
    file_put_contents("$dir/admin_credentials.php",
        "<?php return ['login' => $l, 'password' => $p];\n");
}
header('Content-Type: application/json');
echo json_encode(['принято' => array_keys($got)], JSON_UNESCAPED_UNICODE);
