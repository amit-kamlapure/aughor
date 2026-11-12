#!/bin/sh
# Bundle the answer card for the coworker's page: the card, and Pramanyx's own chart resolver from web/, in the
# module format the shell's browser loader reads. React comes from the shell, so it is left out.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
plugin="$here/plugins/answer-card"
# vega and vega-lite are the web app's own copies, so the chart here is drawn by the versions the app draws with.
modules="${PRAMANYX_WEB_MODULES:-$here/../web/node_modules}"
[ -d "$modules/vega" ] || { echo "build: no vega in $modules — run npm install in web/, or set PRAMANYX_WEB_MODULES" >&2; exit 1; }
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
NODE_PATH="$modules" npx -y esbuild@0.25.5 "$plugin/src/client.js" \
  --bundle --format=cjs --platform=browser --minify \
  --external:react --external:react-dom --external:react/jsx-runtime \
  "--alias:@=$here/../web" '--define:process.env.NODE_ENV="production"' \
  --log-level=warning --outfile="$tmp/card.cjs"
{
  printf 'window.__ModuleLoader__.load({id:"pramanyx-coworker-answer-card",factory:(require)=>{var module={exports:{}};var exports=module.exports;\n'
  cat "$tmp/card.cjs"
  printf '\nreturn module.exports;}});\n'
} > "$plugin/lib/client.js"
echo "build: wrote $plugin/lib/client.js ($(wc -c < "$plugin/lib/client.js" | tr -d ' ') bytes)"
