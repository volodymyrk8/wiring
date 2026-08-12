#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_HOST="${REMOTE_HOST:-root@161.35.244.18}"
REMOTE_PORT="${REMOTE_PORT:-22}"
REMOTE_DIR="${REMOTE_DIR:-/root/repos/dating}"
SERVICE_NAME="wiring.service"
SSH_OPTIONS=(-p "$REMOTE_PORT" -o BatchMode=yes -o StrictHostKeyChecking=yes)
RSYNC_SSH="ssh -p $REMOTE_PORT -o BatchMode=yes -o StrictHostKeyChecking=yes"

echo "== Sync files to $REMOTE_HOST:$REMOTE_DIR =="
ssh "${SSH_OPTIONS[@]}" "$REMOTE_HOST" "mkdir -p '$REMOTE_DIR'"
rsync -az --delete \
  -e "$RSYNC_SSH" \
  --exclude '.git/' \
  --exclude '__pycache__/' \
  --exclude '*.pyc' \
  --exclude '.venv/' \
  --exclude 'venv/' \
  --exclude 'data/' \
  --exclude '.DS_Store' \
  "$SCRIPT_DIR/" "$REMOTE_HOST:$REMOTE_DIR/"

echo "== Install service and nginx =="
ssh "${SSH_OPTIONS[@]}" "$REMOTE_HOST" bash -s <<EOF
set -euo pipefail
REMOTE_DIR='$REMOTE_DIR'
SERVICE_NAME='$SERVICE_NAME'

. /root/bots/bin/activate
pip install -q -r "\$REMOTE_DIR/requirements.txt"

ENV_FILE=/etc/wiring.env
umask 077
touch "\$ENV_FILE"
chmod 600 "\$ENV_FILE"
if ! grep -q '^APP_SECRET_KEY=' "\$ENV_FILE"; then
  printf 'APP_SECRET_KEY=%s\n' "\$(python3 -c 'import secrets; print(secrets.token_hex(32))')" >> "\$ENV_FILE"
fi

install -m 644 "\$REMOTE_DIR/deploy/wiring.service" /etc/systemd/system/\$SERVICE_NAME
install -m 644 "\$REMOTE_DIR/deploy/nginx-dating.conf" /etc/nginx/snippets/dating.conf
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

for i in \$(seq 1 15); do
  if curl -sf http://127.0.0.1:5070/dating/health >/dev/null; then
    break
  fi
  sleep 1
done

curl -sf http://127.0.0.1:5070/dating/health
echo
systemctl --no-pager --full status "\$SERVICE_NAME" | head -20
EOF

echo "== Public check =="
curl -sI "https://lizaisyourfriend.lol/dating/" | head -15
echo
echo "Deploy complete: https://lizaisyourfriend.lol/dating/"
