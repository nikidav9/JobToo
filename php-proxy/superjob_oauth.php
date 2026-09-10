<?php

// Redirect URI зарегистрированного приложения SuperJob.
// Код авторизации обменивается на токены здесь, а в приложение возвращается
// только итоговый статус. Сами токены браузеру не показываем.

@ini_set('display_errors', '0');
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');

define('SB_STRICT', true);
require_once __DIR__ . '/sb_lite.php';
require_once __DIR__ . '/superjob_oauth_lib.php';

function sjo_finish(string $result, string $returnUrl = 'https://jobtoo.ru/'): void
{
    if (!preg_match('~^(?:https://jobtoo\.ru/|onspaceapp://)~i', $returnUrl)) {
        $returnUrl = 'https://jobtoo.ru/';
    }
    $separator = str_contains($returnUrl, '?') ? '&' : '?';
    header('Location: ' . $returnUrl . $separator . 'superjob=' . rawurlencode($result), true, 302);
    exit;
}

try {
    $state = trim((string)($_GET['state'] ?? ''));
    $code = trim((string)($_GET['code'] ?? ''));
    if ($state === '' || $code === '') sjo_finish('cancelled');

    $stateHash = hash('sha256', $state);
    $record = sb_single('jm_superjob_oauth_states', [
        'state_hash' => 'eq.' . $stateHash,
        'used_at' => 'is.null',
        'expires_at' => 'gt.' . now_iso(),
    ]);
    if (!$record) sjo_finish('invalid_state');
    $returnUrl = (string)($record['return_url'] ?? 'https://jobtoo.ru/');

    // Одноразовый state гасим до внешнего запроса: повтор callback не должен
    // второй раз привязать или перезаписать учётную запись.
    sb_update('jm_superjob_oauth_states', ['state_hash' => 'eq.' . $stateHash], ['used_at' => now_iso()]);

    $clientId = sjo_cfg('SUPERJOB_CLIENT_ID');
    $clientSecret = sjo_client_secret();
    if ($clientId === '' || $clientSecret === '') throw new RuntimeException('SuperJob OAuth is not configured');

    $redirectUri = 'https://jobtoo.ru/api/superjob_oauth.php';
    $token = sjo_request('POST', 'https://api.superjob.ru/2.0/oauth2/access_token/', [
        'code' => $code,
        'client_id' => $clientId,
        'client_secret' => $clientSecret,
        'redirect_uri' => $redirectUri,
    ]);
    $access = (string)($token['access_token'] ?? '');
    $refresh = (string)($token['refresh_token'] ?? '');
    if ($access === '' || $refresh === '') throw new RuntimeException('SuperJob returned no tokens');

    $profile = sjo_request('GET', 'https://api.superjob.ru/2.0/user/current/', [], $access);
    if (!empty($profile['hr'])) throw new RuntimeException('A job-seeker SuperJob account is required');

    $ttl = (int)($token['ttl'] ?? 0);
    $expires = $ttl > time() ? $ttl : time() + max(300, (int)($token['expires_in'] ?? 3600));
    $serverSecret = sb_lite_key();
    if ($serverSecret === '') throw new RuntimeException('Server encryption key is unavailable');
    sb_upsert_rows('jm_superjob_connections', [[
        'worker_id' => (string)$record['worker_id'],
        'superjob_user_id' => isset($profile['id']) ? (string)$profile['id'] : null,
        'resume_id' => isset($profile['id_cv']) ? (string)$profile['id_cv'] : null,
        'access_token_enc' => sjo_encrypt($access, $serverSecret),
        'refresh_token_enc' => sjo_encrypt($refresh, $serverSecret),
        'expires_at' => gmdate('Y-m-d\TH:i:s', $expires) . '.000Z',
        'connected_at' => now_iso(),
        'updated_at' => now_iso(),
        'last_error' => null,
    ]], 'worker_id');
    sjo_finish(empty($profile['id_cv']) ? 'connected_no_resume' : 'connected', $returnUrl);
} catch (Throwable $e) {
    error_log('superjob oauth: ' . $e->getMessage());
    sjo_finish('error', $returnUrl ?? 'https://jobtoo.ru/');
}
