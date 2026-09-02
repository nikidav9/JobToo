<?php
// Чистые функции партнёрского биллинга. Побочных эффектов и отправки
// уведомлений здесь нет, поэтому тот же код безопасно гоняется в sandbox.

function pb_dedupe_key(array $event): string
{
    $source = (string)($event['source_id'] ?? '');
    $worker = (string)($event['worker_id'] ?? '');
    $kind = (string)($event['event_kind'] ?? '');
    if ($source === '' || $worker === '' || $kind === '') {
        throw new InvalidArgumentException('source_id, worker_id и event_kind обязательны');
    }

    // Первая завершённая смена оплачивается один раз на человека и источник,
    // независимо от вакансии/application id.
    if ($kind === 'first_completed_shift') {
        return hash('sha256', implode('|', [$source, $worker, $kind]));
    }

    $identity = (string)($event['partner_event_id'] ?? $event['application_id'] ?? $event['occurred_at'] ?? '');
    if ($identity === '') throw new InvalidArgumentException('Нет идентификатора оплачиваемого события');
    return hash('sha256', implode('|', [$source, $worker, $kind, $identity]));
}

function pb_active_tariff(array $tariffs, string $sourceId, string $eventKind, string $occurredAt): ?array
{
    $date = substr($occurredAt, 0, 10);
    $matches = array_values(array_filter($tariffs, static function (array $t) use ($sourceId, $eventKind, $date): bool {
        if (($t['source_id'] ?? '') !== $sourceId || !($t['active'] ?? false)) return false;
        $model = (string)($t['billing_model'] ?? '');
        if ($model !== $eventKind && !($model === 'hybrid' && $eventKind === 'first_completed_shift')) return false;
        if ((string)($t['effective_from'] ?? '') > $date) return false;
        return empty($t['effective_to']) || (string)$t['effective_to'] >= $date;
    }));
    usort($matches, static fn(array $a, array $b): int =>
        strcmp((string)$b['effective_from'], (string)$a['effective_from']));
    return $matches[0] ?? null;
}

function pb_build_billable_event(array $event, array $tariffs, array $existingDedupeKeys = []): array
{
    $key = pb_dedupe_key($event);
    if (in_array($key, $existingDedupeKeys, true)) {
        return ['created' => false, 'reason' => 'duplicate', 'dedupe_key' => $key];
    }

    $tariff = pb_active_tariff(
        $tariffs,
        (string)$event['source_id'],
        (string)$event['event_kind'],
        (string)$event['occurred_at']
    );
    if ($tariff === null) {
        return ['created' => false, 'reason' => 'tariff_not_found', 'dedupe_key' => $key];
    }

    return ['created' => true, 'billable_event' => [
        'id' => (string)($event['id'] ?? bin2hex(random_bytes(16))),
        'source_id' => (string)$event['source_id'],
        'application_id' => $event['application_id'] ?? null,
        'worker_id' => (string)$event['worker_id'],
        'ext_vacancy_id' => $event['ext_vacancy_id'] ?? null,
        'partner_event_id' => $event['partner_event_id'] ?? null,
        'event_kind' => (string)$event['event_kind'],
        'occurred_at' => (string)$event['occurred_at'],
        'tariff_id' => (string)$tariff['id'],
        'amount_rub' => (float)$tariff['amount_rub'],
        'currency' => 'RUB',
        'status' => 'pending',
        'dedupe_key' => $key,
    ]];
}

function pb_reconciliation_issue(array $local, array $partner): ?array
{
    $localStatus = (string)($local['status'] ?? '');
    $partnerStatus = (string)($partner['status'] ?? '');
    if ($localStatus === $partnerStatus) return null;

    $reason = (string)($partner['reason_code'] ?? 'status_mismatch');
    return [
        'source_id' => (string)$local['source_id'],
        'billable_event_id' => $local['id'] ?? null,
        'application_id' => $local['application_id'] ?? null,
        'local_status' => $localStatus,
        'partner_status' => $partnerStatus,
        'reason_code' => $reason,
        'reason_text' => $partner['reason_text'] ?? null,
        'resolution_status' => 'open',
    ];
}

function pb_monthly_rows(array $events): array
{
    return array_map(static fn(array $e): array => [
        'event_id' => $e['id'] ?? '',
        'source_id' => $e['source_id'] ?? '',
        'candidate_id' => $e['worker_id'] ?? '',
        'application_id' => $e['application_id'] ?? '',
        'event' => $e['event_kind'] ?? '',
        'occurred_at' => $e['occurred_at'] ?? '',
        'amount_rub' => $e['amount_rub'] ?? 0,
        'jobtoo_status' => $e['status'] ?? '',
        'partner_status' => $e['partner_status'] ?? '',
        'rejection_reason' => $e['rejection_reason'] ?? '',
    ], $events);
}

function pb_csv(array $rows): string
{
    $columns = ['event_id','source_id','candidate_id','application_id','event','occurred_at','amount_rub','jobtoo_status','partner_status','rejection_reason'];
    $stream = fopen('php://temp', 'r+');
    fwrite($stream, "\xEF\xBB\xBF"); // Excel корректно распознаёт UTF-8.
    fputcsv($stream, $columns, ';');
    foreach ($rows as $row) {
        fputcsv($stream, array_map(static fn(string $c) => $row[$c] ?? '', $columns), ';');
    }
    rewind($stream);
    $csv = stream_get_contents($stream);
    fclose($stream);
    return (string)$csv;
}
