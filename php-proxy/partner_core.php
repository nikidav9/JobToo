<?php
// Независимое ядро партнёрского шлюза. Здесь нет названий методов Яндекса:
// адаптер переводит их события в стабильные внутренние команды.

function pg_allowed_transitions(): array
{
    return [
        'local_created' => ['submitting', 'worker_cancelled', 'failed'],
        'submitting' => ['submitted', 'failed', 'worker_cancelled'],
        'submitted' => ['accepted', 'rejected', 'booked', 'worker_cancelled', 'employer_cancelled', 'failed'],
        'accepted' => ['booked', 'rejected', 'worker_cancelled', 'employer_cancelled', 'failed'],
        'booked' => ['check_in_pending', 'checked_in', 'worker_cancelled', 'employer_cancelled', 'no_show', 'disputed'],
        'check_in_pending' => ['checked_in', 'no_show', 'worker_cancelled', 'employer_cancelled', 'disputed'],
        'checked_in' => ['completed', 'disputed', 'employer_cancelled'],
        'completed' => ['disputed'],
        'rejected' => [],
        'worker_cancelled' => ['disputed'],
        'employer_cancelled' => ['disputed'],
        'no_show' => ['disputed'],
        'disputed' => ['completed', 'worker_cancelled', 'employer_cancelled', 'no_show'],
        'failed' => ['submitting', 'worker_cancelled'],
    ];
}

function pg_can_transition(string $from, string $to): bool
{
    if ($from === $to) return true; // повтор webhook идемпотентен
    $map = pg_allowed_transitions();
    return isset($map[$from]) && in_array($to, $map[$from], true);
}

function pg_transition(array $application, string $to, int $eventVersion, ?string $partnerUpdatedAt = null): array
{
    $from = (string)($application['status'] ?? '');
    $currentVersion = (int)($application['status_version'] ?? 0);

    // Запоздавший webhook не имеет права откатывать более новое состояние.
    if ($eventVersion <= $currentVersion) {
        return ['applied' => false, 'reason' => 'stale', 'application' => $application];
    }
    if (!pg_can_transition($from, $to)) {
        return ['applied' => false, 'reason' => 'invalid_transition', 'from' => $from, 'to' => $to];
    }

    $next = $application;
    $next['status'] = $to;
    $next['status_version'] = $eventVersion;
    $next['updated_at'] = gmdate('Y-m-d\TH:i:s\Z');
    if ($partnerUpdatedAt !== null) $next['partner_updated_at'] = $partnerUpdatedAt;
    $next['failure_code'] = null;
    $next['failure_message'] = null;
    return ['applied' => true, 'application' => $next];
}

function pg_retry_delay_seconds(int $attempt): int
{
    // 15с, 30с, 1м, 2м ... максимум час; небольшой jitter разводит очередь.
    $base = min(3600, 15 * (2 ** min(8, max(0, $attempt - 1))));
    return $base + random_int(0, max(1, (int)($base / 5)));
}

function pg_webhook_signature(string $secret, string $timestamp, string $body): string
{
    return hash_hmac('sha256', $timestamp . '.' . $body, $secret);
}

function pg_verify_webhook(string $secret, string $timestamp, string $body, string $given): bool
{
    if ($secret === '' || !ctype_digit($timestamp)) return false;
    // Защита от повторного проигрывания старого подписанного запроса.
    if (abs(time() - (int)$timestamp) > 300) return false;
    $expected = pg_webhook_signature($secret, $timestamp, $body);
    $normalized = str_starts_with($given, 'sha256=') ? substr($given, 7) : $given;
    return hash_equals($expected, strtolower($normalized));
}

function pg_rating_fact_for_status(string $status, array $event): ?array
{
    $map = [
        'completed' => 'shift_completed',
        'no_show' => 'no_show',
        'worker_cancelled' => 'worker_cancelled',
        'employer_cancelled' => 'employer_cancelled',
    ];
    if (isset($map[$status])) {
        return ['fact_kind' => $map[$status], 'numeric_value' => 1];
    }
    if ($status === 'checked_in' && array_key_exists('late_minutes', $event)) {
        $late = max(0, (int)$event['late_minutes']);
        return [
            'fact_kind' => $late === 0 ? 'on_time' : 'late_minutes',
            'numeric_value' => $late === 0 ? 1 : $late,
        ];
    }
    return null;
}
