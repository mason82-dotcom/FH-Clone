#!/bin/sh
set -eu

python3 - <<'PY'
from pathlib import Path

roots = [
    Path("services/mapping-compute-agent/agent/fh2_mapping_agent"),
    Path("services/mapping-compute-agent/tools"),
]
files = sorted(
    path
    for root in roots
    for path in root.rglob("*.py")
)
if not files:
    raise SystemExit("no mapping compute-agent Python sources found")

for path in files:
    source = path.read_text(encoding="utf-8")
    compile(source, str(path), "exec")

print(f"Mapping compute-agent Python syntax PASS: {len(files)} file(s)")
PY

FH2_URL=http://127.0.0.1:8080 \
MAPPING_AGENT_TOKEN=ci-mapping-agent-token \
NODEODM_TOKEN=ci-nodeodm-token \
docker compose \
  -f services/mapping-compute-agent/docker-compose.yml \
  config >/dev/null

echo "Mapping compute-agent Compose contract PASS"
