# Вход через Google и Яндекс

Один серверный OAuth Authorization Code flow с PKCE S256, одноразовым state и существующей cookie-сессией WIRING. Пароль обычного аккаунта продолжает работать. Доступ к письмам не запрашивается: адрес почты и данные профиля: код WIRING сохраняет только имя и адрес. Пакет `login:info` Яндекса также разрешает получить фамилию и пол, но они не используются. Токены провайдеров используются только на сервере и не сохраняются.

## Настройка

В серверном окружении (`/etc/wiring.env` в production, игнорируемый `.env` локально) задайте:

```
SITE_URL=https://wiring.club
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
YANDEX_CLIENT_ID=...
YANDEX_CLIENT_SECRET=...
OAUTH_ALLOWED_ORIGINS=https://wiring.club,https://wiring.date
```

Также нужны стабильный `APP_SECRET_KEY` и `SESSION_COOKIE_SECURE=1` в production. После изменения окружения перезапустите Flask/gunicorn. Без полной пары ID/Secret кнопка соответствующего провайдера скрыта. По умолчанию callback использует `SITE_URL`. Для нескольких адресов сайта задайте `OAUTH_ALLOWED_ORIGINS` и зарегистрируйте callback каждого адреса у обоих провайдеров: тогда возвращение происходит на тот же разрешённый origin, где начался вход, и cookie сохраняется. Произвольный Host не может подменить callback.

1. В [Google Cloud Console](https://console.cloud.google.com/apis/credentials) настройте OAuth consent screen и создайте OAuth client типа Web application. Разрешённый redirect URI: `https://wiring.club/api/auth/google/callback`; для второго домена также `https://wiring.date/api/auth/google/callback`. Области: `openid email profile`. В режиме Testing добавьте тестовых пользователей; для публичного запуска настройте публикацию consent screen по требованиям Google.
2. В [Яндекс OAuth](https://oauth.yandex.ru/) создайте приложение с веб-платформой, правами `login:email` и `login:info`. Redirect URI: `https://wiring.club/api/auth/yandex/callback`; для второго домена также `https://wiring.date/api/auth/yandex/callback`. Проверьте статус приложения и требования верификации Яндекса.
3. Для локальной проверки создайте отдельные OAuth приложения с callback `http://127.0.0.1:5070/api/auth/google/callback` и `http://127.0.0.1:5070/api/auth/yandex/callback`, установите локальный `SITE_URL=http://127.0.0.1:5070`. При наличии `BASE_PATH` вставьте его между origin и `/api/…` во всех callback URL. Не используйте production-аккаунты или секреты.

Документация протокола: [Google](https://developers.google.com/identity/protocols/oauth2/web-server), [Яндекс code flow и PKCE](https://yandex.ru/dev/id/doc/ru/codes/code-url), [данные Яндекс ID](https://yandex.ru/dev/id/doc/ru/user-information).

## Поведение

- На регистрации человек подтверждает 18+ и принятие правил/политики нажатием подписанной кнопки. Новый аккаунт получает имя и почту, затем открывается `/me` для заполнения анкеты. Согласия на особые данные и права на фото остаются отдельными. WIRING+ и приглашения выдаются тем же кодом, что при обычной регистрации.
- На экране входа неизвестный аккаунт не создаётся: отображается предложение открыть регистрацию.
- Идентичность хранится по `(provider, subject)` в `oauth_identities`; изменение адреса у провайдера не создаёт новый аккаунт при повторном входе.
- Совпадение с существующим подтверждённым аккаунтом связывается автоматически только для адресов, которыми управляет провайдер: Gmail / Google Workspace (`hd`) и перечисленные в `social_auth.py` домены Яндекс Почты. Неподтверждённая почта, сторонние домены и seed-аккаунты не связываются автоматически; человек получает предложение войти с паролем или восстановить его. Другая идентичность того же провайдера не перезаписывает привязку.
- У OAuth-регистрации нет известного человеку пароля. Его можно задать через существующий сброс пароля; экран удаления содержит эту ссылку. Удаление по-прежнему требует пароль. OAuth-вход восстанавливает удалённый профиль в пределах существующих 7 суток; после этого срока вход закрыт. Очистка аккаунта удаляет также привязки OAuth.
- State живёт 10 минут, привязан к браузерной сессии и провайдеру, расходуется в PostgreSQL до обращения к внешнему сервису. Ошибки возвращают человека к входу/регистрации с сообщением, без кода или токенов в адресе страницы.

## Проверка после настройки

На отдельных тестовых аккаунтах каждого провайдера: регистрация → анкета; выход → повторный вход в тот же ID; отмена доступа; отказ в доступе к почте; существующий подтверждённый адрес; сброс пароля и удаление/восстановление. Автоматические тесты используют моки ответов провайдеров и отдельную PostgreSQL `wiring_test`; они не проверяют настройки внешних OAuth-приложений.

## Нативный вход iOS/Android

Мобильный клиент [wiring-mobile](https://github.com/volodymyrk8/wiring-mobile) показывает те же Google/Яндекс кнопки и подтверждения 18+/правил. Использует системную браузерную auth-сессию; аккаунты, привязки и provider callback общие с сайтом.

1. Приложение генерирует собственный PKCE verifier, S256 challenge и случайный native_state. `POST /api/auth/{provider}/start` принимает обычный mode/consents/ref и `native: true`, `code_challenge`, `native_state`. Callback провайдера остаётся зарегистрированным веб-callback; произвольный app redirect не принимается.
2. В ответе URL `GET /api/auth/native/browser?state=...&ticket=...` для системного браузера. Он проверяет launch ticket/TTL и связывает существующий flow с браузерной cookie до перенаправления провайдеру. State по-прежнему расходуется один раз перед provider exchange. Не логировать query этой bootstrap-страницы; ответы `no-store` / `no-referrer`.
3. После общего account lifecycle callback возвращает `wiring://oauth?code=...&state=...`. Это одноразовый непрозрачный код на 60 секунд; в PostgreSQL хранится его SHA-256 и challenge. Access/refresh и provider tokens не передаются в URL. Отмена/ошибка возвращает native state с error.
4. `POST /api/auth/native/exchange` принимает code и code_verifier. Проверяет S256/TTL под row lock, расходует код и создаёт refresh family одним commit. Ответ — существующий формат native session `{access_token, refresh_token, expires_in, user}`, без `Set-Cookie`, с `Cache-Control: no-store`.

Тесты `tests/test_native_auth.py` используют только локальную тестовую БД и mocked provider identity. Реальный OAuth через оба системных браузера требует signed native build и отдельного тестового OAuth-приложения.
