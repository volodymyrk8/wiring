# WIRING

Знакомства для нейроотличных. Свои фото, промпты, фильтры, свайп, кто лайкнул, мэтчи, переписка, блок и жалобы.

Сайт: https://wiring.date/

**Архитектура и принципы (KISS, минимум зависимостей):** [docs/architecture.md](docs/architecture.md)

## Local

**Dev URL (always the same):** http://127.0.0.1:5070/

Local development uses port **5070** on purpose — bookmarks, Cursor browser, and nginx on the server all assume it. Do not pick another port unless you also change `DEV_PORT` in `app.py` and this section.

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # Postgres on localhost:5433 (docker compose)
npm install && npm run build   # app shell + Preact features → public/dist/
./scripts/dev.sh       # postgres (if set) + rebuild client + seed users
```

**Frontend (TypeScript + Preact + Vite):** sources in `src/` (industry layout). Application shell: `src/app/bootstrap.js` → `public/dist/app.js`; `public/app.js` is only a compatibility shim. New UI: `src/components/ui/`, features in `src/features/<name>/`, bundle entries in `src/entries/`. After editing `src/`, run `npm run build` (or `npm run dev:client` for watch).

```
src/
  components/ui/     # shared primitives (Button, FieldFloating, …)
  app/               # application shell and shared API client
  features/auth/     # auth screens + mountAuth()
  features/chat/     # chats list, thread, polling and composer
  entries/app.ts      # application shell → public/dist/app.js
  entries/auth.ts    # Vite entry → public/dist/auth.js
  entries/router.ts  # → public/dist/router.js (URL ↔ view)
  router/            # matchRoute, hrefFor, planRoute, syncViewToUrl
  lib/               # small helpers
```

After `npm run build`, the application shell loads route-level feature bundles from `public/dist/`. Run `npm run test:router` to smoke-test routes.

**Database:** PostgreSQL 16 is the only supported database engine. Local dev uses **PostgreSQL 16** in Docker (`docker compose up -d postgres`). `./scripts/dev.sh` starts postgres, waits until ready, seeds test users, and boots the dev server.

```sh
docker compose down          # stop DB
docker compose down -v       # stop and wipe dev data volume
```

Or manually (same port):

```sh
PORT=5070 FLASK_DEBUG=1 python3 app.py
```

Optional `.env` for local overrides (never commit secrets):

```sh
cp .env.example .env
```

### Тестирование сайта: вход

При **ручной** проверке WIRING в браузере (локально, в Cursor, QA, демо фич) **всегда** авторизуемся одним и тем же тестовым аккаунтом — не регистрируем новых людей «на глаз» и не используем реальные прод-логины.

| | |
|---|---|
| **Имя в анкете** | Дев |
| **Почта** | `dev@wiring.test` |
| **Пароль** | `wiring-dev` |
| **Где** | только **local**: http://127.0.0.1:5070/ (на production этих аккаунтов нет) |

Пароль в доке открытый намеренно: это dev-аккаунты, не секреты.

**Пир** — второй тестовый аккаунт (собеседник для чатов и мэтчей). Не живой человек, только local:

| | |
|---|---|
| **Имя в анкете** | Пир |
| **Почта** | `peer@wiring.test` |
| **Пароль** | `wiring-dev` (тот же) |

Скрипт заводит взаимный лайк Дев ↔ Пир и одно приветственное сообщение в чате.

**Ещё 10 тестовых профилей** (`alma@wiring.test` … `jura@wiring.test`, пароль везде `wiring-dev`) — заполненные анкеты для ленты и фильтров. У **Дева** автоматически **7 чатов** с первыми семью из них, в каждом **10 сообщений** (фиктивные переписки для проверки UI).

`./scripts/dev.sh` перед стартом создаёт всё это. Повторно: `python3 scripts/ensure_dev_user.py` или только соц-часть: `python3 scripts/seed_test_social.py` (нужен уже созданный Дев).

**Исключения:** сценарии «гость» (`POST /api/demo`), регистрация и почтовое подтверждение — отдельные проверки со своими шагами.

```sh
./scripts/test.sh
# or: npm run build && npm run test:router && python3 -m unittest discover -s tests -q
```

See [tests/README.md](tests/README.md) and [docs/router.md](docs/router.md).

## Очередь задач из Telegram

Папка `docs/telegram-triage.md` описывает безопасное подключение одной
приватной группы. Воркер читает сообщения только для черновиков в админке;
публикация и выполнение задач начинаются после ручного одобрения.

## Deploy

**Local (same as before):**

```sh
./scripts/test.sh   # optional
./deploy.sh
```

**GitHub:** push/merge to `main` runs tests, then `./deploy.sh` via Actions. Set repository secret `DEPLOY_SSH_KEY` once — see [docs/github-actions.md](docs/github-actions.md).

Repo: https://github.com/volodymyrk8/wiring

### PostgreSQL (production)
PostgreSQL is the only supported database engine. Set `DATABASE_URL` in `/etc/wiring.env`:

```sh
sudo -u postgres psql -c "CREATE USER wiring_app WITH PASSWORD '…';"
sudo -u postgres psql -c "CREATE DATABASE wiring OWNER wiring_app;"
echo 'DATABASE_URL=postgresql://wiring_app:…@127.0.0.1:5432/wiring' | sudo tee -a /etc/wiring.env
sudo systemctl restart wiring
```
