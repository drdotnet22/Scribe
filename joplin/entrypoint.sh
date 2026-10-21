#!/bin/sh
# Sets up Joplin from the environment, starts its API (which only listens inside this container), then the agent.
PROFILE=""
[ -n "$JOPLIN_PROFILE" ] && PROFILE="--profile $JOPLIN_PROFILE"

if [ -z "$JOPLIN_SERVER_URL" ] || [ -z "$JOPLIN_USERNAME" ] || [ -z "$JOPLIN_PASSWORD" ]; then
  echo "Set JOPLIN_SERVER_URL, JOPLIN_USERNAME and JOPLIN_PASSWORD in the .env file. Waiting..."
  sleep 3600; exit 1
fi

export JOPLIN_API_TOKEN="$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))')"
joplin $PROFILE config sync.target 9 >/dev/null
joplin $PROFILE config sync.9.path "$JOPLIN_SERVER_URL" >/dev/null
joplin $PROFILE config sync.9.username "$JOPLIN_USERNAME" >/dev/null
joplin $PROFILE config sync.9.password "$JOPLIN_PASSWORD" >/dev/null
joplin $PROFILE config sync.interval 0 >/dev/null   # never on its own: Scribe asks for each sync
joplin $PROFILE config api.token "$JOPLIN_API_TOKEN" >/dev/null

joplin $PROFILE server start &
exec node /opt/scribe-joplin/agent.mjs
