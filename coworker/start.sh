#!/bin/sh
# Start the Pramanyx coworker: the agent shell, on this folder's profile, talking to a running Pramanyx API.
#
#   ./start.sh                 serve on http://127.0.0.1:3090 and print the address to open
#
# Needs: Node 24.9+, pnpm (the shell installs plugins with it), and the Pramanyx API already running.
# The first run asks nothing here; the model and its key are chosen in the page, under Settings → Models.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/.." && pwd)

# The shell, pinned: it is preview software and says its plugin APIs will change.
DSH="${PRAMANYX_DSH:-npx -y @deepseek-ai/dsh@0.2.2-rc.1}"
# Its own home, beside Pramanyx's state and apart from any shell the person uses for other work.
export DSH_HOME="${DSH_HOME:-$HOME/.pramanyx/coworker}"
# Nothing is reported to the shell's maker (profile.patch.yml turns the reporters off; this is the second lock).
export DSH_TELEMETRY_MODE=DISABLED
export PRAMANYX_API_URL="${PRAMANYX_API_URL:-http://127.0.0.1:8000}"
if [ -z "${PRAMANYX_PYTHON:-}" ] && [ -x "$repo/.venv/bin/python" ]; then PRAMANYX_PYTHON="$repo/.venv/bin/python"; fi
export PRAMANYX_PYTHON="${PRAMANYX_PYTHON:-python}"

command -v pnpm >/dev/null 2>&1 || { echo "start: pnpm is not on PATH — the shell needs it to install the answer card" >&2; exit 1; }
curl -fsS -o /dev/null --max-time 5 "$PRAMANYX_API_URL/health" \
  || { echo "start: no Pramanyx API at $PRAMANYX_API_URL — start it first" >&2; exit 1; }

[ -f "$here/plugins/answer-card/lib/client.js" ] || "$here/build.sh"

mkdir -p "$DSH_HOME" "$DSH_HOME/work"
cd "$DSH_HOME/work"
profile="$DSH_HOME/profiles/web"
[ -f "$profile/package.json" ] || $DSH --profile web --dump-config >/dev/null
grep -q '"pramanyx-coworker-answer-card"' "$profile/package.json" \
  || $DSH plugin --profile web add "link:$here/plugins/answer-card"

exec $DSH --profile web --patch "$here/profile.patch.yml" --no-open --port "${PORT:-3090}"
