<?php
require_once __DIR__ . '/../php-proxy/partner_core.php';

function expect_true(bool $value, string $message): void {
    if (!$value) {
        fwrite(STDERR, "FAIL: $message\n");
        exit(1);
    }
}

expect_true(pg_can_transition('local_created', 'submitting'), 'application can submit');
expect_true(pg_can_transition('submitted', 'accepted'), 'submitted can be accepted');
expect_true(pg_can_transition('accepted', 'booked'), 'accepted can be booked');
expect_true(pg_can_transition('booked', 'checked_in'), 'booked can check in');
expect_true(pg_can_transition('checked_in', 'completed'), 'checked in can complete');
expect_true(!pg_can_transition('completed', 'submitted'), 'terminal state cannot move backwards');
expect_true(pg_can_transition('completed', 'completed'), 'duplicate event is idempotent');

$app = ['status' => 'booked', 'status_version' => 4];
$stale = pg_transition($app, 'checked_in', 4);
expect_true($stale['applied'] === false && $stale['reason'] === 'stale', 'stale version ignored');

$next = pg_transition($app, 'checked_in', 5, '2026-09-02T12:00:00Z');
expect_true($next['applied'] === true, 'new transition applied');
expect_true($next['application']['status'] === 'checked_in', 'status changed');
expect_true($next['application']['status_version'] === 5, 'version changed');

$invalid = pg_transition($app, 'completed', 5);
expect_true($invalid['applied'] === false && $invalid['reason'] === 'invalid_transition', 'invalid jump rejected');

$timestamp = (string)time();
$body = '{"event_id":"e1"}';
$sig = pg_webhook_signature('secret', $timestamp, $body);
expect_true(pg_verify_webhook('secret', $timestamp, $body, 'sha256=' . $sig), 'valid webhook accepted');
expect_true(!pg_verify_webhook('secret', $timestamp, $body . 'x', $sig), 'changed body rejected');
expect_true(!pg_verify_webhook('secret', (string)(time() - 301), $body, pg_webhook_signature('secret', (string)(time() - 301), $body)), 'old webhook rejected');

$completed = pg_rating_fact_for_status('completed', []);
expect_true($completed['fact_kind'] === 'shift_completed', 'completion becomes evidence');
$late = pg_rating_fact_for_status('checked_in', ['late_minutes' => 12]);
expect_true($late['fact_kind'] === 'late_minutes' && $late['numeric_value'] === 12, 'lateness preserved');
$ontime = pg_rating_fact_for_status('checked_in', ['late_minutes' => 0]);
expect_true($ontime['fact_kind'] === 'on_time', 'zero lateness becomes on-time fact');

$sandboxMigration = file_get_contents(__DIR__ . '/../supabase/migrations/046_partner_sandbox_isolation.sql');
expect_true($sandboxMigration !== false, 'sandbox migration exists');
expect_true(str_contains($sandboxMigration, "environment <> 'sandbox' or notifications_enabled = false"), 'sandbox notifications are forbidden');
expect_true(str_contains($sandboxMigration, "environment = 'production' and active = true"), 'public policy exposes production only');

$dbProxy = file_get_contents(__DIR__ . '/../php-proxy/db.php');
expect_true($dbProxy !== false && str_contains($dbProxy, "'environment' => 'eq.production'"), 'API hides sandbox vacancies');

$metricsMigration = file_get_contents(__DIR__ . '/../supabase/migrations/047_partner_business_metrics.sql');
expect_true($metricsMigration !== false, 'partner business metrics migration exists');
expect_true(str_contains($metricsMigration, 'jm_partner_costs'), 'partner costs are factual ledger entries');
expect_true(str_contains($metricsMigration, 'new_candidate boolean'), 'partner confirms candidate novelty');

$conversionApi = file_get_contents(__DIR__ . '/../php-proxy/api.php');
expect_true($conversionApi !== false && str_contains($conversionApi, "'new_candidate' => " . '$newCandidate'), 'conversion callback stores partner novelty');
expect_true(str_contains($conversionApi, "'user_id' => " . '$clickId'), 'conversion keeps attributed worker');

expect_true(str_contains($dbProxy, "'партнёрский_отчёт_30дней'"), 'dashboard API exposes partner report');
expect_true(str_contains($dbProxy, "'стоимость_отклика_rub'"), 'cost per response is reported');
expect_true(str_contains($dbProxy, '$knownNew > 0'), 'unknown novelty is not shown as zero');

$sourcePage = file_get_contents(__DIR__ . '/../dashboard/app/sources/page.tsx');
expect_true($sourcePage !== false && str_contains($sourcePage, 'Отчёт для партнёра · 30 дней'), 'partner report is visible');
expect_true(str_contains($sourcePage, 'Неизвестные значения не заменяются нулями'), 'dashboard labels incomplete data honestly');

echo "partner core: ok\\n";
