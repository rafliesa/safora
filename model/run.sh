#!/usr/bin/env bash
set -euo pipefail
model_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$model_root/local-env.sh" ]]; then source "$model_root/local-env.sh"; fi
exec "$model_root/.venv/bin/python" "$model_root/infer.py" "$@"
