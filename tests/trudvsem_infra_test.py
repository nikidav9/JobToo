from pathlib import Path


root = Path(__file__).resolve().parents[1]
deploy = (root / "infra/local-web-deploy.sh").read_text(encoding="utf-8")
worker = (root / "infra/trudvsem-import-loop.sh").read_text(encoding="utf-8")
adapter = (root / "php-proxy/trudvsem.php").read_text(encoding="utf-8")
workflow = (root / ".github/workflows/deploy-regru.yml").read_text(encoding="utf-8")
bootstrap = (root / "infra/bootstrap.sh").read_text(encoding="utf-8")

# Regression checks for the production-only pieces that cannot be exercised by
# the Expo unit tests. A missing timeout previously allowed a long Moscow feed
# walk to stop after only part of the source had been imported.
assert "TimeoutStartSec=8h" in deploy
assert "Restart=on-failure" in deploy
assert "RestartSec=1min" in deploy
assert "systemctl reset-failed jt-trudvsem-import.service" in deploy
assert "ingest.php?source=trudvsem&force=1" not in deploy
assert "ExecStart=/usr/local/bin/jt-site-watchdog\n" in bootstrap
assert "TimeoutStartSec=1800" in bootstrap

# The worker must validate the response envelope and the sole source status;
# substring grep could accept malformed JSON or an unrelated field.
assert "json.load(response)" in worker
assert 'status.startswith("продолжение:")' in worker
assert 'status.startswith("ок:")' in worker
assert "grep -q" not in worker

# Keep the adapter strictly Moscow-only and keep the time-window pagination
# needed to get past the official API's 10,000-result ceiling.
assert "7700000000000" in adapter
assert "'modifiedFrom' => $from" in adapter
assert "'modifiedTo' => $to" in adapter
assert "$shardTotal <= 10000" in adapter
assert "array_unshift($queue" in adapter

# The release deployment used to replace the locally generated build marker,
# making it impossible to tell which commit production was serving.
assert '"$GITHUB_SHA"' in workflow
assert "pack/jobtoo-build.json" in workflow

print("trudvsem production import invariants: ok")
