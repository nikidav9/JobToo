from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
adapter = (ROOT / 'php-proxy/headhunter.php').read_text()
migration = (ROOT / 'supabase/migrations/058_headhunter_source.sql').read_text()
workflow = (ROOT / '.github/workflows/deploy-regru.yml').read_text()
deploy = (ROOT / 'php-proxy/deploy.php').read_text()

assert "HH-User-Agent: ' . $userAgent" in adapter
assert "CURLOPT_PROTOCOLS => CURLPROTO_HTTPS" in adapter
assert "'area' => $area" in adapter
assert "'per_page' => $limit" in adapter
assert "'page' => $page" in adapter
assert "$page + 1 < $pages" in adapter
assert "hh\\.ru/vacancy" in adapter
assert "integration_mode" in migration and "'redirect'" in migration
assert "false" in migration, 'source must stay disabled until a manual feed check'
assert "secrets.HH_CLIENT_ID" in workflow and "secrets.HH_CLIENT_SECRET" in workflow
assert "'HH_CLIENT_ID'" in deploy and "'HH_CLIENT_SECRET'" in deploy

print('headhunter adapter invariants: ok')
