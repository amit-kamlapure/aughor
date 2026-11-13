#!/bin/sh
# Start everything Pramanyx runs on this machine, after a reboot or when something is down:
#
#   scripts/start_all.sh            the API (:8000), the web app (:3000) and the coworker (:3090)
#
# Each is started only if nothing is listening on its port, so it is safe to run when some are up. Nothing
# starts by itself after a reboot; this is the one command that brings all three back. Logs go to /tmp, which a
# reboot empties.
#
# The coworker needs its shell installed once (it is large, so it is not installed by this script):
#   mkdir -p ~/.pramanyx/coworker-shell && cd ~/.pramanyx/coworker-shell && npm init -y \
#     && npm install @deepseek-ai/dsh@0.2.2-rc.1 pnpm
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
listening() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
wait_for() {  # port, seconds
  n=0
  while ! listening "$1"; do n=$((n + 1)); [ "$n" -gt "$2" ] && return 1; sleep 1; done
}

if listening 8000; then echo "api      already up on :8000"
else
  (cd "$repo" && ulimit -n 10240 && .venv/bin/python scripts/restart_api.py >/dev/null)
  wait_for 8000 90 && echo "api      started on :8000  (log /tmp/pramanyx-api.log)" || echo "api      did NOT start — see /tmp/pramanyx-api.log" >&2
fi

if listening 3000; then echo "web      already up on :3000"
else
  (cd "$repo/web" && nohup npm run dev >> /tmp/pramanyx-web.log 2>&1 < /dev/null &)
  wait_for 3000 90 && echo "web      started on :3000  (log /tmp/pramanyx-web.log)" || echo "web      did NOT start — see /tmp/pramanyx-web.log" >&2
fi

shell="${PRAMANYX_COWORKER_SHELL:-$HOME/.pramanyx/coworker-shell}/node_modules/.bin"
if listening 3090; then echo "coworker already up on :3090"
elif [ ! -x "$shell/dsh" ]; then echo "coworker not started: its shell is not installed at $shell (see the top of this script)"
elif [ ! -x "$repo/coworker/start.sh" ]; then echo "coworker not started: this checkout has no coworker/"
else
  (PATH="$shell:$PATH" PRAMANYX_DSH="$shell/dsh" nohup "$repo/coworker/start.sh" > /tmp/pramanyx-coworker.log 2> /tmp/pramanyx-coworker.err < /dev/null &)
  wait_for 3090 120 && echo "coworker started on :3090 — open it from the nine dots in the app" || echo "coworker did NOT start — see /tmp/pramanyx-coworker.err" >&2
fi
