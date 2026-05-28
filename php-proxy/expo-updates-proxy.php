<?php
// Proxy expo-updates manifest and asset requests through jobtoo.ru
// because u.expo.dev and assets.eascdn.net may be blocked in Russia.
// Deploy to: /var/www/html/api/expo-updates-proxy.php

$logFile = __DIR__ . '/expo-proxy.log';

// ── Asset proxy mode ─────────────────────────────────────────────────────────
if (isset($_GET['asset'])) {
    $assetUrl = urldecode($_GET['asset']);
    $hasAuth  = isset($_GET['auth']) && $_GET['auth'] !== '';

    file_put_contents($logFile,
        date('Y-m-d H:i:s') . ' ASSET_REQ has_auth=' . ($hasAuth ? 'yes' : 'NO') . ' url=' . $assetUrl . "\n",
        FILE_APPEND | LOCK_EX
    );

    if (!str_starts_with($assetUrl, 'https://assets.eascdn.net/')) {
        http_response_code(400);
        echo json_encode(['error' => 'invalid_asset_url']);
        exit;
    }

    $fwdHeaders = [];
    if ($hasAuth) {
        $fwdHeaders[] = "Authorization: " . $_GET['auth'];
    }
    foreach (getallheaders() as $k => $v) {
        $kl = strtolower($k);
        if ($kl === 'host' || $kl === 'authorization') continue;
        $fwdHeaders[] = "$k: $v";
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
    $resp     = curl_exec($ch);
    $hSize    = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr  = curl_error($ch);
    curl_close($ch);

    $bodyPreview = $resp !== false ? substr($resp, $hSize, 300) : '(curl failed)';
    file_put_contents($logFile,
        date('Y-m-d H:i:s') . ' ASSET_RESP code=' . $httpCode
            . ($curlErr ? ' curl_err=' . $curlErr : '')
            . ' body=' . $bodyPreview . "\n",
        FILE_APPEND | LOCK_EX
    );

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
file_put_contents($logFile,
    date('Y-m-d H:i:s') . ' MANIFEST_REQ from=' . ($_SERVER['REMOTE_ADDR'] ?? '?') . "\n",
    FILE_APPEND | LOCK_EX
);

$forwardHeaders = [];
foreach (getallheaders() as $key => $value) {
    $kl = strtolower($key);
    if ($kl === 'host') continue;
    if ($kl === 'accept-encoding') continue; // prevent gzip so we can rewrite URLs in body
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

file_put_contents($logFile, date('Y-m-d H:i:s') . ' MANIFEST_RESP http=' . $httpCode . "\n", FILE_APPEND | LOCK_EX);

$responseHeaders = substr($response, 0, $headerSize);
$body            = substr($response, $headerSize);

// ── Build URL → auth-token map from the manifest ──────────────────────────────
$assetAuthMap = [];
$boundaryFound = false;

foreach (explode("\r\n", $responseHeaders) as $rh) {
    if (stripos($rh, 'content-type:') !== 0) continue;
    if (!preg_match('/boundary="?([^";,\s]+)"?/i', $rh, $bm)) continue;
    $boundaryFound = true;
    $parts = explode('--' . $bm[1], $body);
    file_put_contents($logFile,
        date('Y-m-d H:i:s') . ' MULTIPART boundary=' . $bm[1] . ' parts=' . count($parts) . "\n",
        FILE_APPEND | LOCK_EX
    );
    foreach ($parts as $part) {
        if (!preg_match('/content-type:[^\r\n]*(?:application\/json|application\/expo\+json)/i', $part)) continue;
        $sep = strpos($part, "\r\n\r\n");
        if ($sep === false) continue;
        $manifest = json_decode(trim(substr($part, $sep + 4)), true);
        if (!$manifest) {
            file_put_contents($logFile, date('Y-m-d H:i:s') . ' JSON_DECODE_FAIL\n', FILE_APPEND | LOCK_EX);
            continue;
        }
        $assetRequestHeaders = $manifest['extensions']['assetRequestHeaders'] ?? [];
        $allAssets = array_merge(
            $manifest['assets'] ?? [],
            isset($manifest['launchAsset']) ? [$manifest['launchAsset']] : []
        );
        foreach ($allAssets as $asset) {
            $key = $asset['key'] ?? '';
            $url = $asset['url'] ?? '';
            if ($key && $url && isset($assetRequestHeaders[$key]['authorization'])) {
                $assetAuthMap[$url] = $assetRequestHeaders[$key]['authorization'];
            }
        }
        break;
    }
    break;
}

// Fallback: plain JSON (non-multipart)
if (empty($assetAuthMap)) {
    $manifest = json_decode(trim($body), true);
    if ($manifest && isset($manifest['extensions']['assetRequestHeaders'])) {
        $assetRequestHeaders = $manifest['extensions']['assetRequestHeaders'];
        $allAssets = array_merge(
            $manifest['assets'] ?? [],
            isset($manifest['launchAsset']) ? [$manifest['launchAsset']] : []
        );
        foreach ($allAssets as $asset) {
            $key = $asset['key'] ?? '';
            $url = $asset['url'] ?? '';
            if ($key && $url && isset($assetRequestHeaders[$key]['authorization'])) {
                $assetAuthMap[$url] = $assetRequestHeaders[$key]['authorization'];
            }
        }
    }
}

file_put_contents($logFile,
    date('Y-m-d H:i:s') . ' AUTH_MAP_COUNT=' . count($assetAuthMap)
        . ' boundary_found=' . ($boundaryFound ? 'yes' : 'no') . "\n",
    FILE_APPEND | LOCK_EX
);

// ── Rewrite assets.eascdn.net URLs, embedding auth token in query string ──────
$proxyBase  = 'https://jobtoo.ru/api/expo-updates-proxy.php';
$rewriteCount = 0;
$body = preg_replace_callback(
    '/"(https:\/\/assets\.eascdn\.net\/[^"]+)"/',
    function ($m) use ($proxyBase, $assetAuthMap, &$rewriteCount) {
        $rewriteCount++;
        $url = $m[1];
        $qs  = 'asset=' . urlencode($url);
        if (isset($assetAuthMap[$url])) {
            $qs .= '&auth=' . urlencode($assetAuthMap[$url]);
        }
        return '"' . $proxyBase . '?' . $qs . '"';
    },
    $body
);

file_put_contents($logFile,
    date('Y-m-d H:i:s') . ' REWRITE_COUNT=' . $rewriteCount . "\n",
    FILE_APPEND | LOCK_EX
);

http_response_code($httpCode);

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
