<?php
// Proxy expo-updates manifest and asset requests through jobtoo.ru
// because u.expo.dev and assets.eascdn.net may be blocked in Russia.
// Deploy to: /var/www/html/api/expo-updates-proxy.php

// ── Asset proxy mode ─────────────────────────────────────────────────────────
// Called when expo-updates fetches a bundle/asset via the rewritten URL.
if (isset($_GET['asset'])) {
    $assetUrl = urldecode($_GET['asset']);
    if (!str_starts_with($assetUrl, 'https://assets.eascdn.net/')) {
        http_response_code(400);
        echo json_encode(['error' => 'invalid_asset_url']);
        exit;
    }
    $fwdHeaders = [];
    $hasAuth = false;
    foreach (getallheaders() as $k => $v) {
        if (strtolower($k) === 'host') continue;
        if (strtolower($k) === 'authorization') $hasAuth = true;
        $fwdHeaders[] = "$k: $v";
    }
    // Nginx/PHP-FPM sometimes strips Authorization from getallheaders() — use $_SERVER fallback
    if (!$hasAuth && isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $fwdHeaders[] = "Authorization: " . $_SERVER['HTTP_AUTHORIZATION'];
    }
    $ch = curl_init($assetUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => $fwdHeaders,
        CURLOPT_HEADER         => true,
        CURLOPT_TIMEOUT        => 60,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 3,
    ]);
    $resp       = curl_exec($ch);
    $hSize      = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $httpCode   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    http_response_code($httpCode);
    $respHeaders = substr($resp, 0, $hSize);
    $body        = substr($resp, $hSize);
    $skip = ['transfer-encoding', 'connection', 'keep-alive', 'content-length'];
    foreach (explode("\r\n", $respHeaders) as $h) {
        if (empty($h) || preg_match('/^HTTP\//i', $h)) continue;
        $p = strpos($h, ':');
        if ($p === false) continue;
        if (in_array(strtolower(trim(substr($h, 0, $p))), $skip)) continue;
        header($h, false);
    }
    echo $body;
    exit;
}

// ── Manifest proxy mode ───────────────────────────────────────────────────────
$expoUrl = 'https://u.expo.dev/5b26bb1e-9e73-4d94-8907-b27e3f66096f';
$logFile = __DIR__ . '/expo-proxy.log';
file_put_contents($logFile, date('Y-m-d H:i:s') . ' REQUEST from ' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . "\n", FILE_APPEND | LOCK_EX);

$forwardHeaders = [];
foreach (getallheaders() as $key => $value) {
    if (strtolower($key) === 'host') continue;
    $forwardHeaders[] = "$key: $value";
}

$method      = $_SERVER['REQUEST_METHOD'];
$queryString = $_SERVER['QUERY_STRING'] ?? '';
$targetUrl   = $queryString ? "$expoUrl?$queryString" : $expoUrl;

$ch = curl_init($targetUrl);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER     => $forwardHeaders,
    CURLOPT_HEADER         => true,
    CURLOPT_TIMEOUT        => 20,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS      => 3,
    CURLOPT_CUSTOMREQUEST  => $method,
]);

if ($method === 'POST' || $method === 'PATCH') {
    curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents('php://input'));
}

$response   = curl_exec($ch);
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$httpCode   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError  = curl_error($ch);
curl_close($ch);

if ($response === false) {
    file_put_contents($logFile, date('Y-m-d H:i:s') . ' CURL ERROR: ' . $curlError . "\n", FILE_APPEND | LOCK_EX);
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'proxy_error', 'message' => $curlError]);
    exit;
}

file_put_contents($logFile, date('Y-m-d H:i:s') . ' RESPONSE http=' . $httpCode . "\n", FILE_APPEND | LOCK_EX);

$responseHeaders = substr($response, 0, $headerSize);
$body            = substr($response, $headerSize);

http_response_code($httpCode);

// Forward response headers — skip hop-by-hop and content-length (body size changed after URL rewriting)
$skip = ['transfer-encoding', 'connection', 'keep-alive', 'content-length'];
foreach (explode("\r\n", $responseHeaders) as $header) {
    if (empty($header)) continue;
    if (preg_match('/^HTTP\//i', $header)) continue;
    $colonPos = strpos($header, ':');
    if ($colonPos === false) continue;
    $headerName = strtolower(trim(substr($header, 0, $colonPos)));
    if (in_array($headerName, $skip)) continue;
    header($header, false);
}

echo $body;
