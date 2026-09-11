<?php

// Общие примитивы OAuth SuperJob. Токены никогда не возвращаются клиенту:
// шифрование и запросы к SuperJob выполняются только на сервере.

function sjo_cfg(string $name, string $default = ''): string
{
    $env = getenv($name);
    if (is_string($env) && trim($env) !== '') return trim($env);
    $file = is_readable(__DIR__ . '/app_secrets.php') ? @include __DIR__ . '/app_secrets.php' : null;
    $value = is_array($file) ? (string)($file[$name] ?? '') : '';
    return $value !== '' ? $value : $default;
}

function sjo_client_secret(): string
{
    // В документации SuperJob параметр client_secret — это Secret key приложения.
    return sjo_cfg('SUPERJOB_CLIENT_SECRET', sjo_cfg('SUPERJOB_SECRET_KEY'));
}

function sjo_crypt_key(string $serverSecret): string
{
    return hash('sha256', "jobtoo-superjob-oauth-v1\0" . $serverSecret, true);
}

function sjo_encrypt(string $plain, string $serverSecret): string
{
    $iv = random_bytes(12);
    $tag = '';
    $cipher = openssl_encrypt($plain, 'aes-256-gcm', sjo_crypt_key($serverSecret),
        OPENSSL_RAW_DATA, $iv, $tag);
    if ($cipher === false) throw new RuntimeException('Cannot encrypt SuperJob token');
    return base64_encode($iv . $tag . $cipher);
}

function sjo_decrypt(string $encoded, string $serverSecret): string
{
    $raw = base64_decode($encoded, true);
    if ($raw === false || strlen($raw) < 29) throw new RuntimeException('Invalid encrypted token');
    $plain = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', sjo_crypt_key($serverSecret),
        OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
    if ($plain === false) throw new RuntimeException('Cannot decrypt SuperJob token');
    return $plain;
}

function sjo_request(string $method, string $url, array $form = [], ?string $accessToken = null): array
{
    if (!preg_match('~^https://(?:api\.)?superjob\.ru/~i', $url)) {
        throw new RuntimeException('Unexpected SuperJob endpoint');
    }
    $headers = ['Accept: application/json', 'X-Api-App-Id: ' . sjo_cfg('SUPERJOB_SECRET_KEY')];
    if ($accessToken !== null) $headers[] = 'Authorization: Bearer ' . $accessToken;
    if ($form) $headers[] = 'Content-Type: application/x-www-form-urlencoded';
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 45,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);
    if ($form) curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($form, '', '&', PHP_QUERY_RFC3986));
    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    $decoded = is_string($body) ? json_decode($body, true) : null;
    if ($body === false || $status < 200 || $status >= 300 || !is_array($decoded)) {
        $message = is_array($decoded) ? (string)($decoded['error']['message'] ?? '') : '';
        throw new RuntimeException($message !== '' ? $message : "SuperJob HTTP $status $error");
    }
    return $decoded;
}
