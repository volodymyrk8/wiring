#!/usr/bin/env bash
# One-off move of wiring.club / wiring.date from 188.166.105.108 to 164.92.147.23.
# Run from a machine whose SSH key opens root@ on both servers.
#
#   ./scripts/migrate_server.sh sync      Refresh code, config, database and files on the new
#                                         server. The old server stays live; safe to repeat.
#   ./scripts/migrate_server.sh cutover   ~1 minute of downtime: stop the old app, final copy,
#                                         start the new app and its timers, then make the old
#                                         nginx forward wiring.club/wiring.date to the new server.
#                                         After this, DNS can move at any time without data loss.
#   ./scripts/migrate_server.sh verify    Check both servers answer for wiring.club over HTTPS.
#   ./scripts/migrate_server.sh rollback  Undo cutover. Writes made on the new server after the
#                                         cutover are NOT copied back.
#   ./scripts/migrate_server.sh cleanup   After DNS has moved and traffic on the old server has
#                                         stopped: remove the forwarder and the migration key.
set -euo pipefail

OLD="root@188.166.105.108"
NEW="root@164.92.147.23"
NEW_IP="164.92.147.23"
OLD_IPS="188.166.105.108"
OLD_PRIVATE="10.110.0.2"
NEW_PRIVATE="10.110.0.3"
TIMERS="wiring-purge.timer wiring-sendpulse.timer wiring-registrations.timer wiring-backup.timer"
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=20)
LINK_KEY=/root/.ssh/wiring_migrate
LINK_HOSTS=/root/.ssh/wiring_migrate_known_hosts
BACKUP_PULL="$HOME/.local/bin/wiring-backup-pull"

say() { printf '\n== %s\n' "$*"; }

# Old -> new over the private network with a key that only the old server's private IP may use.
ensure_link() {
  local pub
  pub="$("${SSH[@]}" "$OLD" "test -f $LINK_KEY || ssh-keygen -q -t ed25519 -N '' -C wiring-migrate -f $LINK_KEY; cat $LINK_KEY.pub")"
  "${SSH[@]}" "$NEW" "grep -qF '$pub' /root/.ssh/authorized_keys || echo 'from=\"$OLD_PRIVATE\" $pub' >> /root/.ssh/authorized_keys"
  "${SSH[@]}" "$OLD" "test -s $LINK_HOSTS || ssh-keyscan -t ed25519 $NEW_PRIVATE 2>/dev/null > $LINK_HOSTS"
}

sync_files() {
  ensure_link
  say "Sync code, config and files (old -> new, private network)"
  "${SSH[@]}" "$OLD" bash -s <<EOF
set -euo pipefail
R=(rsync -a --delete -e "ssh -i $LINK_KEY -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$LINK_HOSTS")
"\${R[@]}" /var/lib/wiring/ root@$NEW_PRIVATE:/var/lib/wiring/
"\${R[@]}" /var/www/wiring-downloads/ root@$NEW_PRIVATE:/var/www/wiring-downloads/
"\${R[@]}" --exclude node_modules/ --exclude __pycache__/ /root/repos/dating/ root@$NEW_PRIVATE:/root/repos/dating/
"\${R[@]}" /etc/wiring.env root@$NEW_PRIVATE:/etc/wiring.env
"\${R[@]}" /usr/local/sbin/wiring-backup /usr/local/sbin/wiring-backup-serve root@$NEW_PRIVATE:/usr/local/sbin/
echo "files: \$(find /var/lib/wiring/uploads -type f | wc -l) uploads"
EOF
  "${SSH[@]}" "$NEW" "/root/bots/bin/pip install -q -r /root/repos/dating/requirements.txt"
}

# The new server's own deploy copy of nginx-wiring.conf listens on any address; the old
# checkout still has the IP-specific listens, so reinstall the copy from this repository.
install_new_nginx() {
  local dir; dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  "${SSH[@]}" "$NEW" "cat > /etc/nginx/sites-available/wiring.conf" < "$dir/deploy/nginx-wiring.conf"
  "${SSH[@]}" "$NEW" "cat > /etc/nginx/sites-available/wiring.date.conf" < "$dir/deploy/nginx-wiring.date.conf"
  "${SSH[@]}" "$NEW" "cp /etc/nginx/sites-available/wiring.conf /root/repos/dating/deploy/nginx-wiring.conf; cp /etc/nginx/sites-available/wiring.date.conf /root/repos/dating/deploy/nginx-wiring.date.conf; nginx -t -q && systemctl reload nginx"
}

sync_db() {
  say "Copy database wiring (old -> new)"
  "${SSH[@]}" "$NEW" "systemctl stop wiring.service; cd /tmp; runuser -u postgres -- dropdb --if-exists --force wiring; runuser -u postgres -- createdb -O wiring_app wiring"
  "${SSH[@]}" "$OLD" "cd /tmp && runuser -u postgres -- pg_dump --format=custom --compress=6 wiring" \
    | "${SSH[@]}" "$NEW" "cd /tmp && runuser -u postgres -- pg_restore --no-owner --role=wiring_app --exit-on-error -d wiring"
}

counts() {
  "${SSH[@]}" "$1" "cd /tmp; runuser -u postgres -- psql -Atd wiring -c \"select (select count(*) from users)||' users, '||(select count(*) from messages)||' messages, max message id '||coalesce((select max(id) from messages),0)\""
}

start_new() {
  "${SSH[@]}" "$NEW" bash -s <<'EOF'
set -euo pipefail
systemctl restart wiring.service
for i in $(seq 1 30); do curl -sf http://127.0.0.1:5070/health >/dev/null && break; sleep 1; done
curl -sf http://127.0.0.1:5070/health; echo
EOF
}

verify() {
  say "HTTPS checks"
  local ip u code
  for ip in $NEW_IP $OLD_IPS; do
    for u in https://wiring.club/health https://wiring.club/m https://www.wiring.club/ https://wiring.date/; do
      code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
        --resolve "wiring.club:443:$ip" --resolve "www.wiring.club:443:$ip" --resolve "wiring.date:443:$ip" "$u" || true)"
      printf '%-16s %-32s %s\n' "$ip" "$u" "$code"
    done
  done
}

old_forwarder_conf() {
  cat <<'NGINX'
# Temporary: wiring.club and wiring.date are served by 164.92.147.23 (private 10.110.0.3).
# This server only forwards requests that still arrive here while DNS propagates.
# Original config: /root/wiring-nginx.before-cutover.conf
upstream wiring_new_https { server 10.110.0.3:443; keepalive 16; }

server {
    listen 80;
    listen [::]:80;
    server_name wiring.club www.wiring.club wiring.date www.wiring.date;

    location / {
        access_log /var/log/nginx/wiring-forward.log;
        proxy_pass http://10.110.0.3;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

server {
    listen 161.35.244.18:443 ssl http2;
    listen 188.166.105.108:443 ssl;
    server_name wiring.club www.wiring.club;

    ssl_certificate /etc/letsencrypt/live/wiring.club/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/wiring.club/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    include /etc/nginx/snippets/wiring-forward.conf;
}

server {
    listen 161.35.244.18:443 ssl http2;
    listen 188.166.105.108:443 ssl;
    server_name wiring.date www.wiring.date;

    ssl_certificate /etc/letsencrypt/live/wiring.date/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/wiring.date/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    include /etc/nginx/snippets/wiring-forward.conf;
}
NGINX
}

old_forwarder_snippet() {
  cat <<'NGINX'
client_max_body_size 12m;
access_log /var/log/nginx/wiring-forward.log;
location / {
    proxy_pass https://wiring_new_https;
    proxy_ssl_server_name on;
    proxy_ssl_name $host;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
}
NGINX
}

cmd="${1:-}"
case "$cmd" in
  sync)
    sync_files
    install_new_nginx
    sync_db
    start_new
    echo "old: $(counts "$OLD")"; echo "new: $(counts "$NEW")"
    ;;

  cutover)
    say "Preflight"
    "${SSH[@]}" "$NEW" "nginx -t -q && test -f /etc/letsencrypt/live/wiring.club/fullchain.pem && test -f /etc/letsencrypt/live/wiring.date/fullchain.pem && echo new server ready"
    "${SSH[@]}" "$OLD" "nginx -t -q && echo old nginx ok"

    say "Stop the old app and its timers"
    "${SSH[@]}" "$OLD" "systemctl disable --now $TIMERS; systemctl stop wiring-sendpulse.service wiring-registrations.service wiring-purge.service 2>/dev/null; systemctl disable --now wiring.service"

    sync_files
    install_new_nginx
    sync_db
    start_new
    old_counts="$(counts "$OLD")"; new_counts="$(counts "$NEW")"
    echo "old: $old_counts"; echo "new: $new_counts"
    if [ "$old_counts" != "$new_counts" ]; then
      echo "Row counts differ; the old app is stopped. Re-run 'cutover' or 'rollback'." >&2
      exit 1
    fi

    say "Enable timers on the new server"
    "${SSH[@]}" "$NEW" "systemctl enable --now $TIMERS && systemctl list-timers --no-pager | grep wiring"

    say "New nginx trusts X-Forwarded-For only from the old server's private IP"
    "${SSH[@]}" "$NEW" "printf 'set_real_ip_from $OLD_PRIVATE;\n' > /etc/nginx/conf.d/wiring-old-forwarder.conf && nginx -t -q && systemctl reload nginx"

    say "Old nginx forwards wiring.club / wiring.date to the new server"
    "${SSH[@]}" "$OLD" "test -f /root/wiring-nginx.before-cutover.conf || cp /etc/nginx/sites-available/wiring.conf /root/wiring-nginx.before-cutover.conf"
    old_forwarder_snippet | "${SSH[@]}" "$OLD" "cat > /etc/nginx/snippets/wiring-forward.conf"
    old_forwarder_conf | "${SSH[@]}" "$OLD" "cat > /etc/nginx/sites-available/wiring.conf && nginx -t -q && systemctl reload nginx"

    say "GitHub deploys go to the new server"
    if command -v gh >/dev/null; then
      gh variable set DEPLOY_HOST --body "$NEW_IP" && echo "DEPLOY_HOST=$NEW_IP"
    else
      echo "gh not found: set repository variable DEPLOY_HOST=$NEW_IP by hand" >&2
    fi
    if [ -f "$BACKUP_PULL" ]; then
      sed -i.bak "s/root@188\.166\.105\.108/root@$NEW_IP/" "$BACKUP_PULL" && echo "backup pull now uses $NEW_IP"
    fi

    verify
    echo
    echo "Cutover done. Point A records for wiring.club, www.wiring.club, wiring.date, www.wiring.date to $NEW_IP."
    ;;

  verify)
    verify
    ;;

  rollback)
    say "Rollback to the old server"
    "${SSH[@]}" "$OLD" "test -f /root/wiring-nginx.before-cutover.conf && cp /root/wiring-nginx.before-cutover.conf /etc/nginx/sites-available/wiring.conf; nginx -t -q && systemctl reload nginx; systemctl enable --now wiring.service $TIMERS"
    "${SSH[@]}" "$NEW" "systemctl disable --now $TIMERS; rm -f /etc/nginx/conf.d/wiring-old-forwarder.conf; nginx -t -q && systemctl reload nginx"
    command -v gh >/dev/null && gh variable delete DEPLOY_HOST || true
    [ -f "$BACKUP_PULL.bak" ] && mv "$BACKUP_PULL.bak" "$BACKUP_PULL"
    verify
    echo "DNS must point at 188.166.105.108 again, and deploy.sh / ci.yml defaults must be reverted."
    ;;

  cleanup)
    say "Requests still forwarded by the old server (last 10 lines of its log)"
    "${SSH[@]}" "$OLD" "tail -n 10 /var/log/nginx/wiring-forward.log 2>/dev/null || true"
    "${SSH[@]}" "$OLD" "rm -f /etc/nginx/sites-enabled/wiring.conf /etc/nginx/snippets/wiring-forward.conf && nginx -t -q && systemctl reload nginx; rm -f $LINK_KEY $LINK_KEY.pub $LINK_HOSTS"
    "${SSH[@]}" "$NEW" "sed -i '/wiring-migrate\$/d' /root/.ssh/authorized_keys; rm -f /etc/nginx/conf.d/wiring-old-forwarder.conf; nginx -t -q && systemctl reload nginx"
    echo "Old server no longer serves wiring. Its database, uploads and backups are untouched."
    ;;

  *)
    sed -n '2,17p' "$0"; exit 2
    ;;
esac
