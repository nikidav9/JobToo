<?php
// Telegram bot webhook — replies to /start (and any message) with the app button.
define('TG_BOT_TOKEN', getenv('TG_BOT_TOKEN') ?: '8718898225:AAEOUiK23gH_MKRnorhSFx5SDn8otcl2_ug');

header('Content-Type: application/json; charset=utf-8');

$update = json_decode(file_get_contents('php://input'), true);
if (!is_array($update)) { echo json_encode(['ok' => true]); exit; }

$msg = $update['message'] ?? null;
if (!$msg || empty($msg['chat']['id'])) { echo json_encode(['ok' => true]); exit; }

$chatId = (int)$msg['chat']['id'];
if (($msg['chat']['type'] ?? '') !== 'private') { echo json_encode(['ok' => true]); exit; }

$text = trim($msg['text'] ?? '');
$firstName = $msg['from']['first_name'] ?? '';

if (str_starts_with($text, '/start')) {
    $reply = "Привет" . ($firstName !== '' ? ", $firstName" : '') . "! 👋\n\n"
        . "<b>JobToo</b> — подработки и постоянные вакансии на складах Москвы.\n\n"
        . "⚡ Смены рядом с твоим метро\n"
        . "💼 Постоянная работа от проверенных директоров\n"
        . "💬 Отклик и чат с работодателем в два тапа\n\n"
        . "Открой приложение — без установки, прямо здесь 👇";
} else {
    $reply = "Все смены и вакансии — в приложении 👇";
}

$payload = [
    'chat_id' => $chatId,
    'text' => $reply,
    'parse_mode' => 'HTML',
    'reply_markup' => ['inline_keyboard' => [[
        ['text' => '🚀 Открыть JobToo', 'url' => 'https://t.me/JobToo_bot/app'],
    ]]],
];

$ch = curl_init('https://api.telegram.org/bot' . TG_BOT_TOKEN . '/sendMessage');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_TIMEOUT => 10,
    CURLOPT_POSTFIELDS => json_encode($payload),
]);
curl_exec($ch);
curl_close($ch);

echo json_encode(['ok' => true]);
