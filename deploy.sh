#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_HOST="${REMOTE_HOST:-root@188.166.105.108}"
REMOTE_PORT="${REMOTE_PORT:-22}"
REMOTE_DIR="${REMOTE_DIR:-/root/repos/dating}"
SERVICE_NAME="wiring.service"
SSH_OPTIONS=(-p "$REMOTE_PORT" -o BatchMode=yes -o StrictHostKeyChecking=yes)
RSYNC_SSH="ssh -p $REMOTE_PORT -o BatchMode=yes -o StrictHostKeyChecking=yes"

echo "== Sync files to $REMOTE_HOST:$REMOTE_DIR =="
ssh "${SSH_OPTIONS[@]}" "$REMOTE_HOST" "mkdir -p '$REMOTE_DIR'"
ssh "${SSH_OPTIONS[@]}" "$REMOTE_HOST" bash -s <<'PRE'
set -euo pipefail
ENV_FILE=/etc/wiring.env
umask 077
touch "$ENV_FILE"
chmod 600 "$ENV_FILE"
if ! grep -q '^DATABASE_URL=' "$ENV_FILE" && [ -f /root/repos/dating/.env ]; then
  grep '^DATABASE_URL=' /root/repos/dating/.env >> "$ENV_FILE" || true
fi
if ! grep -q '^OPENAI_API_KEY=' "$ENV_FILE" && [ -f /root/repos/dating/.env ]; then
  grep '^OPENAI_API_KEY=' /root/repos/dating/.env >> "$ENV_FILE" || true
fi
if ! grep -q '^ADMIN_TOKEN=' "$ENV_FILE"; then
  printf 'ADMIN_TOKEN=%s\n' "$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')" >> "$ENV_FILE"
fi
PRE
rsync -az --delete \
  -e "$RSYNC_SSH" \
  --exclude '.git/' \
  --exclude '__pycache__/' \
  --exclude '*.pyc' \
  --exclude '.venv/' \
  --exclude 'venv/' \
  --exclude 'node_modules/' \
  --exclude 'data/' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '.DS_Store' \
  "$SCRIPT_DIR/" "$REMOTE_HOST:$REMOTE_DIR/"

echo "== Install service and nginx =="
ssh "${SSH_OPTIONS[@]}" "$REMOTE_HOST" bash -s <<EOF
set -euo pipefail
REMOTE_DIR='$REMOTE_DIR'
SERVICE_NAME='$SERVICE_NAME'

mkdir -p /var/lib/wiring/uploads
chmod 750 /var/lib/wiring /var/lib/wiring/uploads

. /root/bots/bin/activate
pip install -q -r "\$REMOTE_DIR/requirements.txt"
if command -v npm >/dev/null && [ -f "\$REMOTE_DIR/package.json" ]; then
  (cd "\$REMOTE_DIR" && npm ci && npm run build)
fi

ENV_FILE=/etc/wiring.env
umask 077
touch "\$ENV_FILE"
chmod 600 "\$ENV_FILE"
if ! grep -q '^APP_SECRET_KEY=' "\$ENV_FILE"; then
  printf 'APP_SECRET_KEY=%s\n' "\$(python3 -c 'import secrets; print(secrets.token_hex(32))')" >> "\$ENV_FILE"
fi
if ! grep -q '^DATABASE_URL=' "\$ENV_FILE" && [ -f /root/repos/dating/.env ]; then
  grep '^DATABASE_URL=' /root/repos/dating/.env >> "\$ENV_FILE" || true
fi
if ! grep -q '^OPENAI_API_KEY=' "\$ENV_FILE" && [ -f /root/repos/dating/.env ]; then
  grep '^OPENAI_API_KEY=' /root/repos/dating/.env >> "\$ENV_FILE" || true
fi
if ! grep -q '^ADMIN_TOKEN=' "\$ENV_FILE"; then
  printf 'ADMIN_TOKEN=%s\n' "\$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')" >> "\$ENV_FILE"
fi

if ! grep -q '^DATABASE_URL=' "\$ENV_FILE"; then
  if id -u postgres >/dev/null 2>&1; then
    systemctl start postgresql || true
    PG_PASS="\$(python3 -c 'import secrets; print(secrets.token_urlsafe(18))')"
    su - postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='wiring_app'\"" | grep -q 1 || \
      su - postgres -c "psql -c \"CREATE USER wiring_app WITH PASSWORD '\$PG_PASS';\""
    su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='wiring'\"" | grep -q 1 || \
      su - postgres -c "psql -c \"CREATE DATABASE wiring OWNER wiring_app;\""
    printf 'DATABASE_URL=postgresql://wiring_app:%s@127.0.0.1:5432/wiring\n' "\$PG_PASS" >> "\$ENV_FILE"
  fi
fi

install -m 644 "\$REMOTE_DIR/deploy/wiring.service" /etc/systemd/system/\$SERVICE_NAME
install -m 644 "\$REMOTE_DIR/deploy/nginx-dating.conf" /etc/nginx/snippets/dating.conf
install -m 644 "\$REMOTE_DIR/deploy/nginx-wiring.date.conf" /etc/nginx/sites-available/wiring.date.conf
ln -sfn /etc/nginx/sites-available/wiring.date.conf /etc/nginx/sites-enabled/wiring.date.conf
systemctl daemon-reload
systemctl enable "\$SERVICE_NAME"
systemctl restart "\$SERVICE_NAME"

NGINX_CONF=/etc/nginx/sites-available/lizaisyourfriend.lol.conf
if ! grep -qF 'include /etc/nginx/snippets/dating.conf;' "\$NGINX_CONF"; then
  cp "\$NGINX_CONF" "\$NGINX_CONF.before-dating"
  python3 - <<'PY'
from pathlib import Path
path = Path("/etc/nginx/sites-available/lizaisyourfriend.lol.conf")
text = path.read_text()
needle = "    include /etc/nginx/snippets/hladom.conf;\n"
insert = needle + "    include /etc/nginx/snippets/dating.conf;\n"
if "include /etc/nginx/snippets/dating.conf;" in text:
    print("nginx dating snippet already present")
elif needle not in text:
    raise SystemExit("Could not find hladom include to insert after")
else:
    path.write_text(text.replace(needle, insert, 1))
    print("nginx dating snippet inserted")
PY
fi
nginx -t
systemctl reload nginx

HEALTHY=0
for i in \$(seq 1 25); do
  if curl -sf http://127.0.0.1:5070/health >/dev/null 2>&1; then
    HEALTHY=1
    break
  fi
  sleep 1
done

if [ "\$HEALTHY" -ne 1 ]; then
  echo "Health check failed after 25s! Service status and recent logs:"
  systemctl --no-pager --full status "\$SERVICE_NAME" || true
  journalctl -u "\$SERVICE_NAME" -n 60 --no-pager || true
  exit 1
fi

curl -sf http://127.0.0.1:5070/health
echo
systemctl --no-pager --full status "\$SERVICE_NAME" | head -20
EOF

echo "== Public check =="
curl -sI "https://wiring.date/" | head -15
echo
echo "Deploy complete: https://wiring.date/"
