from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
adapter = (ROOT / 'php-proxy/superjob.php').read_text()
migration = (ROOT / 'supabase/migrations/057_superjob_source.sql').read_text()
enable_migration = (ROOT / 'supabase/migrations/059_enable_superjob_source.sql').read_text()
workflow = (ROOT / '.github/workflows/deploy-regru.yml').read_text()
server_deploy = (ROOT / 'php-proxy/deploy.php').read_text()
oauth_lib = (ROOT / 'php-proxy/superjob_oauth_lib.php').read_text()
oauth_callback = (ROOT / 'php-proxy/superjob_oauth.php').read_text()
db = (ROOT / 'php-proxy/db.php').read_text()
oauth_migration = (ROOT / 'supabase/migrations/060_superjob_oauth.sql').read_text()
import_loop = (ROOT / 'infra/superjob-import-loop.sh').read_text()
local_deploy = (ROOT / 'infra/local-web-deploy.sh').read_text()

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
assert "'SUPERJOB_SECRET_KEY'" in server_deploy
assert 'aes-256-gcm' in oauth_lib
assert 'CURLOPT_FOLLOWLOCATION => false' in oauth_lib
assert "hash('sha256', $state)" in oauth_callback
assert "used_at' => now_iso()" in oauth_callback
assert 'access_token_enc' in oauth_callback and 'refresh_token_enc' in oauth_callback
assert "case 'superjobOauthStart'" in db
assert "case 'superjobApply'" in db
assert "send_cv_on_vacancy/" in db
assert "'id_vacancy' => (string)$vacancy['external_id']" in db
assert 'enable row level security' in oauth_migration
assert 'revoke all' in oauth_migration
assert 'source=superjob&force=1' in import_loop
assert 'jt-superjob-import.timer' in local_deploy

print('superjob adapter invariants: ok')
