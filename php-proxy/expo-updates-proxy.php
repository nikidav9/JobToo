<?php
// Proxy expo-updates manifest requests through jobtoo.ru
// because u.expo.dev is blocked in Russia.
// Deploy to: /var/www/html/api/expo-updates-proxy.php (accessible as https://jobtoo.ru/api/expo-updates-proxy.php)

$expoUrl = 'https://u.expo.dev/5b26bb1e-9e73-4d94-8907-b27e3f66096f';

// Forward all request headers except Host
$forwardHeaders = [];
foreach (getallheaders() as $key => $value) {
    $lower = strtolower($key);
    if ($lower === 'host') continue;
    $forwardHeaders[] = "$key: $value";
}

$method = $_SERVER['REQUEST_METHOD'];
$queryString = $_SERVER['QUERY_STRING'] ?? '';
$targetUrl = $queryString ? "$expoUrl?$queryString" : $expoUrl;

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
    $body = file_get_contents('php://input');
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
}

$response   = curl_exec($ch);
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$httpCode   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError  = curl_error($ch);
curl_close($ch);

if ($response === false) {
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'proxy_error', 'message' => $curlError]);
    exit;
}

$responseHeaders = substr($response, 0, $headerSize);
$body            = substr($response, $headerSize);

http_response_code($httpCode);

// Forward response headers (skip transfer-encoding and connection — those are hop-by-hop)
$skip = ['transfer-encoding', 'connection', 'keep-alive'];
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
