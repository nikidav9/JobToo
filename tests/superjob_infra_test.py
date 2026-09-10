from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
adapter = (ROOT / 'php-proxy/superjob.php').read_text()
migration = (ROOT / 'supabase/migrations/057_superjob_source.sql').read_text()
enable_migration = (ROOT / 'supabase/migrations/059_enable_superjob_source.sql').read_text()
workflow = (ROOT / '.github/workflows/deploy-regru.yml').read_text()
deploy = (ROOT / 'php-proxy/deploy.php').read_text()

assert "X-Api-App-Id: ' . $secret" in adapter
assert "CURLOPT_PROTOCOLS => CURLPROTO_HTTPS" in adapter
assert "SUPERJOB_SECRET_KEY is not configured" in adapter
assert "'town' => $town" in adapter
assert "'count' => $limit" in adapter
assert "'page' => $page" in adapter
assert "!empty($decoded['more'])" in adapter
assert "superjob\\.ru" in adapter
assert "integration_mode" in migration and "'redirect'" in migration
assert "false" in migration, 'source must stay disabled until the API key is configured'
assert "set enabled = true" in enable_migration
assert "integration_mode = 'redirect'" in enable_migration
assert "where id = 'superjob'" in enable_migration
assert "secrets.SUPERJOB_SECRET_KEY" in workflow
assert "'SUPERJOB_SECRET_KEY'" in deploy

print('superjob adapter invariants: ok')
