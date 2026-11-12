#!/bin/sh
# Start the Pramanyx coworker: the agent shell, on this folder's profile, talking to a running Pramanyx API.
#
#   ./start.sh                 serve on http://127.0.0.1:3090 and print the address to open
#
# Needs: Node 24.9+, pnpm (the shell installs plugins with it), and the Pramanyx API already running.
# No model key is asked for: the coworker asks its model through Pramanyx, once an admin has allowed that in
# Settings ▸ Organization ▸ What Pramanyx may do.
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
# The shell's provider plugin will not send a request without a key. The model door takes none, so this is a
# placeholder and not a secret.
export PRAMANYX_DOOR_KEY="${PRAMANYX_DOOR_KEY:-no-key-the-door-takes-none}"
if [ -z "${PRAMANYX_PYTHON:-}" ] && [ -x "$repo/.venv/bin/python" ]; then PRAMANYX_PYTHON="$repo/.venv/bin/python"; fi
export PRAMANYX_PYTHON="${PRAMANYX_PYTHON:-python}"

command -v pnpm >/dev/null 2>&1 || { echo "start: pnpm is not on PATH — the shell needs it to install the answer card" >&2; exit 1; }
curl -fsS -o /dev/null --max-time 5 "$PRAMANYX_API_URL/health" \
  || { echo "start: no Pramanyx API at $PRAMANYX_API_URL — start it first" >&2; exit 1; }

for plugin in "$here"/plugins/*/; do
  [ -f "${plugin}lib/client.js" ] || { "$here/build.sh"; break; }
done

mkdir -p "$DSH_HOME" "$DSH_HOME/work"
cd "$DSH_HOME/work"
profile="$DSH_HOME/profiles/web"
[ -f "$profile/package.json" ] || $DSH --profile web --dump-config >/dev/null
# Each plugin is installed into the profile once, as a link to this folder: the shell ships a plugin's browser half
# only for a package the profile has installed.
for plugin in "$here"/plugins/*/; do
  plugin=${plugin%/}
  name=$(node -p "require('$plugin/package.json').name")
  grep -q "\"$name\"" "$profile/package.json" || $DSH plugin --profile web add "link:$plugin"
done

exec $DSH --profile web --patch "$here/profile.patch.yml" --no-open --port "${PORT:-3090}"
