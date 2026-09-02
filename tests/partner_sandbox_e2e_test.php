<?php
require_once __DIR__ . '/../php-proxy/partner_core.php';
require_once __DIR__ . '/../php-proxy/partner_billing.php';

function sandbox_expect(bool $value, string $message): void {
    if (!$value) {
        fwrite(STDERR, "FAIL sandbox: $message\n");
        exit(1);
    }
}

$notifications = [];
$outbound = [];
$messages = [];
$tariffs = [[
    'id' => 'tariff-yandex-v1',
    'source_id' => 'yandex-smena-sandbox',
    'billing_model' => 'first_completed_shift',
    'amount_rub' => 700,
    'effective_from' => '2026-09-01',
    'effective_to' => null,
    'active' => true,
]];

$application = [
    'id' => 'sandbox:application:001',
    'source_id' => 'yandex-smena-sandbox',
    'ext_vacancy_id' => 'sandbox:yandex:shift:001',
    'worker_id' => 'sandbox:worker:001',
    'status' => 'local_created',
    'status_version' => 1,
    'consent_version' => 'partner-transfer:2026-09-02',
];

// вакансия → отдельное согласие → отклик
$consent = [
    'source_id' => $application['source_id'],
    'worker_id' => $application['worker_id'],
    'ext_vacancy_id' => $application['ext_vacancy_id'],
    'recipient_name' => 'Яндекс Смена — sandbox',
    'data_categories' => ['profile', 'application', 'messages', 'statuses'],
    'accepted_at' => '2026-09-02T10:00:00Z',
];
sandbox_expect(str_starts_with($application['worker_id'], 'sandbox:'), 'используется только синтетический кандидат');
sandbox_expect(in_array('messages', $consent['data_categories'], true), 'сообщения перечислены в согласии');

$submitted = pg_transition($application, 'submitting', 2);
sandbox_expect($submitted['applied'], 'отклик поставлен в отправку');
$application = $submitted['application'];
$submitted = pg_transition($application, 'submitted', 3);
sandbox_expect($submitted['applied'], 'партнёр принял отклик');
$application = $submitted['application'];

// чат: повторная доставка того же сообщения не создаёт дубль
function sandbox_deliver_message(array &$messages, string $idempotencyKey, string $body): void {
    if (isset($messages[$idempotencyKey])) return;
    $messages[$idempotencyKey] = $body;
}
sandbox_deliver_message($messages, 'msg:001', 'Здравствуйте, готов выйти');
sandbox_deliver_message($messages, 'msg:001', 'Здравствуйте, готов выйти');
sandbox_expect(count($messages) === 1, 'сообщение идемпотентно');

foreach ([['accepted',4], ['booked',5], ['checked_in',6], ['completed',7]] as [$status, $version]) {
    $transition = pg_transition($application, $status, $version);
    sandbox_expect($transition['applied'], "статус $status применён");
    $application = $transition['application'];
}

// первая завершённая смена → один оплачиваемый факт
$billingInput = [
    'id' => 'bill:sandbox:001',
    'source_id' => $application['source_id'],
    'application_id' => $application['id'],
    'worker_id' => $application['worker_id'],
    'ext_vacancy_id' => $application['ext_vacancy_id'],
    'partner_event_id' => 'partner:completed:001',
    'event_kind' => 'first_completed_shift',
    'occurred_at' => '2026-09-02T18:00:00Z',
];
$created = pb_build_billable_event($billingInput, $tariffs);
sandbox_expect($created['created'] === true, 'создан оплачиваемый факт');
$event = $created['billable_event'];
sandbox_expect($event['amount_rub'] === 700.0, 'применён тариф партнёра');

$duplicate = pb_build_billable_event(
    array_merge($billingInput, ['id' => 'bill:sandbox:002', 'partner_event_id' => 'partner:completed:duplicate']),
    $tariffs,
    [$event['dedupe_key']]
);
sandbox_expect($duplicate['created'] === false && $duplicate['reason'] === 'duplicate', 'двойная оплата кандидата заблокирована');

$issue = pb_reconciliation_issue(
    array_merge($event, ['status' => 'approved']),
    ['status' => 'rejected', 'reason_code' => 'partner_not_first_shift', 'reason_text' => 'Кандидат ранее работал']
);
sandbox_expect($issue !== null && $issue['resolution_status'] === 'open', 'расхождение записывается с причиной');

$csv = pb_csv(pb_monthly_rows([array_merge($event, ['status' => 'approved'])]));
sandbox_expect(str_contains($csv, 'candidate_id'), 'CSV содержит заголовок');
sandbox_expect(str_contains($csv, 'sandbox:worker:001'), 'CSV содержит синтетический факт');

sandbox_expect(count($notifications) === 0, 'push/Telegram/SMS/email не создавались');
sandbox_expect(count($outbound) === 0, 'реальный endpoint партнёра не вызывался');

fwrite(STDOUT, "OK: isolated partner sandbox flow completed without notifications\n");
