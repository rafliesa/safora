#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -f "$repo_root/model/local-env.sh" ]]; then source "$repo_root/model/local-env.sh"; fi
cd "$repo_root"
exec "$repo_root/model/.venv/bin/python" -m uvicorn backend.app:create_app --factory --host 127.0.0.1 --port 8000 "$@"
