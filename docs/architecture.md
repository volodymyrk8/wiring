# Архитектура WIRING

Краткое описание того, как устроен репозиторий сейчас, и принципы, по которым его развиваем.

## Стек

| Слой | Технология | Заметки |
|------|------------|---------|
| Сервер | Python 3, **Flask** | API + отдача shell-страницы, без отдельного API-фреймворка |
| БД | **PostgreSQL** (прод и local dev) / **SQLite** (fallback local, тесты) | `DATABASE_URL` → Postgres (`docker-compose.yml` локально); иначе `DATING_DB`; миграции `init_db()` + `_ensure_column` |
| Прод | **gunicorn** + nginx | см. `deploy/` |
| Клиент | **Preact + TS** (`src/`) + legacy shell (`public/app.js`) | Vite → `public/dist/`; постепенная миграция экранов |
| Стили | один **`public/styles.css`** | |
| Картинки | **`public/`** | `/public/...` через Flask |
| Зависимости Python | см. `requirements.txt` | Flask, Werkzeug, gunicorn, Pillow; Telethon — только для опционального Telegram-воркера |

Фронт **не** использует тяжёлые UI-библиотеки, bundler (Vite/Webpack) и CSS-фреймворки — осознанный выбор.

## Как запрос попадает в интерфейс

```mermaid
flowchart LR
  Browser[Браузер]
  Nginx[nginx]
  Gunicorn[gunicorn / Flask]
  DB[(PostgreSQL / SQLite)]
  Browser -->|HTML shell| Nginx --> Gunicorn
  Browser -->|/api/* JSON| Nginx --> Gunicorn
  Browser -->|/public/* статика| Nginx --> Gunicorn
  Gunicorn --> DB
```

1. Почти все «страницы» (`/`, `/login`, `/feed`, `/chats/...`) — один **`templates/index.html`**: пустой `#app` + подключение `app.js`.
2. **`public/app.js`** сам рисует экраны (строки HTML), ходит в **`/api/*`**, хранит состояние в памяти, URL — history API.
3. Отдельные **серверные шаблоны**: `templates/admin.html`, `templates/legal.html` (правила, privacy, support).
4. Доменная логика вынесена из монолита в модули рядом с `app.py`: `catalog`, `notify`, `premium`, `media`, `matchmaker`, и т.д.

## Оценка текущей архитектуры

**Сильные стороны**

- **Мало движущихся частей**: один процесс приложения, одна БД, понятный деплой (`deploy.sh`).
- **Мало зависимостей**: нет ORM, нет node_modules, нет лишних слоёв на фронте.
- **Бэкенд уже модульный**: справочники, почта, премиум, модерация — отдельные файлы, тесты `unittest` на API и логику.
- **Подходит продукту**: dating-SPA с сессиями и SQLite — нормальный масштаб без микросервисов.

**Компромиссы (не баги, а долг)**

- **`app.py` большой** — маршруты и часть бизнес-логики в одном файле; дальше новые фичи лучше не раздувать его без нужды.
- **`public/app.js` монолитный** — все экраны в одном файле; для переиспользования UI (формы, поля) планируется вынести маленькие модули (см. обсуждение `client/ui/` или `public/ui/`), **без** перехода на React «ради архитектуры».
- **Нет отдельного API-контракта** (OpenAPI) — ок для одной команды и одного клиента.

Итого: архитектура **простая и уместная** для WIRING; главный риск — рост двух монолитов (`app.py`, `app.js`), его гасим **KISS** и точечным выносом, а не новым стеком.

## Принципы разработки (KISS)

1. **KISS** — выбираем самое простое решение, которое закрывает задачу. Не добавляем слой (ORM, Redux, design system на npm), пока боль без него не станет явной.
2. **Минимум зависимостей** — не тянем объёмные библиотеки, плагины и фреймворки, если можно обойтись стандартной библиотекой, Flask, DOM API или небольшим своим модулем.
3. **Новая зависимость — только с причиной** — в PR/задаче коротко: зачем, почему не stdlib/существующий код, что с размером и обновлениями.
4. **Один клиент, один сервер** — API под текущий SPA; отдельный mobile/API-клиент — отдельное решение, не «на будущее» в коде.
5. **PostgreSQL** на проде и в local dev (`DATABASE_URL`, `docker compose`); **тесты** — SQLite без `DATABASE_URL`. Перенос данных: `scripts/migrate_sqlite_to_postgres.py`.
6. **Frontend** — `src/` (components/ui, features/*, entries/*), сборка Vite в `public/dist/`. Legacy SPA: `public/app.js` импортирует feature-бандлы динамически. Статика продукта: `public/` (css, media).
7. **Тесты** — `python3 -m unittest discover -s tests`; ручной UI — локально, тестовый пользователь из README.

## Куда класть новый код (шпаргалка)

| Что | Куда |
|-----|------|
| HTTP API, сессии | `app.py` или новый модуль + импорт в `app.py` |
| Справочники, тексты каталога | `catalog.py`, `cities.py`, … |
| Разметка главного приложения | `public/app.js` (постепенно — маленькие UI-модули) |
| Общие стили | `public/styles.css` (+ при появлении UI-kit — отдельный css рядом) |
| Админка / legal HTML | `templates/`, `legal_pages.py` |
| Скрипты dev/seed | `scripts/` |
| Документация продукта/деплоя | `README.md`, `docs/` |

## Связанные документы

- [docs/router.md](router.md) — SPA URLs, `src/router/`, тесты
- [README.md](../README.md) — local, тестовые пользователи, деплой
- [docs/telegram-triage.md](telegram-triage.md) — опциональный Telegram-воркер (Telethon)
- [V2.md](../V2.md) — продуктовые/UI-цели v2
