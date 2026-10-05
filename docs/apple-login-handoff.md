# Сообщение агенту Миши: вход через Apple

Дата: 5 октября 2026 года.

Добавлен вход и регистрация через Apple на сайте WIRING. Нужно подключить тот же способ входа в приложение, которое собирается для TestFlight.

## Где смотреть

- Сервер и сайт: `volodymyrk8/wiring`, ветка `codex/apple-login-handoff` — этот файл и реализация Apple.
- Мобильное приложение: [wiring-mobile, PR #1](https://github.com/volodymyrk8/wiring-mobile/pull/1), ветка `codex/web-parity`.
- Общий мобильный OAuth: [wiring, PR #6](https://github.com/volodymyrk8/wiring/pull/6), ветка `codex/native-parity-api`.
- Порядок сборки и передачи Мише: `wiring-mobile/docs/testflight-handoff.md`.

## Что готово в этой ветке

`social_auth.py` поддерживает провайдер `apple` в общем `/api/auth/providers` и `POST /api/auth/apple/start`. На сайте кнопки «Войти через Apple» и «Зарегистрироваться через Apple» появляются при наличии `APPLE_CLIENT_ID` и `APPLE_CLIENT_SECRET`.

Apple использует code flow с `response_mode=form_post` и nonce. Сервер обменивает code и проверяет подпись ID token по Apple JWKS, issuer, Services ID audience, срок, nonce и подтверждённую почту. Добавлена зависимость `PyJWT[crypto]`; установить обновлённый `requirements.txt`.

POST callback сохраняет только code/error во временном `oauth_flows.callback_payload`, затем делает 303 GET для проверки исходной browser cookie с SameSite=Lax. Запрос обновления использует `rowcount`: обёртка `database.py` не поддерживает произвольный `RETURNING state_hash`. Миграция колонки выполняется идемпотентно при старте.

Идентичность сохраняется по `(apple, sub)`. Поддерживается скрытая почта Apple; автоматического связывания с прежним аккаунтом по совпадению email нет. Запрашивается только email, имя нового профиля — «Участник», затем человек меняет его в анкете. Регистрация сохраняет подтверждение 18+ и правил, бонусы и приглашения.

## Что сделать в приложении и общей серверной ветке

1. Объединить изменения Apple с PR #6, сохранив его `native_challenge`, `native_state`, `/api/auth/native/browser`, `/api/auth/native/exchange` и выдачу существующих access/refresh. Эта ветка сама по себе завершает веб-вход cookie-сессией; она ещё не объединена с мобильным flow PR #6. Не заменять `social_auth.py` из PR #6 целиком файлом из этой ветки.
2. В PR #6 параметры Apple должны быть `response_mode=form_post` и `nonce=flow.verifier` также в `/api/auth/native/browser`, где отдельно собирается URL провайдера. Apple не получает провайдерский PKCE, но PKCE приложения для обмена одноразового результата остаётся обязательным.
3. После Apple POST → GET сохранить browser binding и завершение через `wiring://oauth?code=...&state=...` для native flow, включая отмену/ошибки. Обмен — существующий `/api/auth/native/exchange`; аккаунты и API общие с сайтом.
4. В `wiring-mobile/src/features/auth/SocialButtons.tsx` заменить двухпровайдерную подпись `google ? Google : Яндекс` на явную карту `google → Google`, `yandex → Яндекс`, `apple → Apple`. Иначе возвращённый сервером Apple сейчас будет подписан «Яндекс». На входе — «Войти через Apple», на регистрации — «Зарегистрироваться через Apple»; сохранить проверку согласий. `social.ts` уже принимает произвольного провайдера и содержит PKCE обмен.
5. Использовать текущий системный браузерный flow. Если вместо него вводится нативный Apple credential, отдельно реализовать серверную проверку App ID audience и nonce: текущая реализация проверяет только Services ID веб-flow.

## Настройка перед сборкой

- В Apple Developer включить Sign in with Apple для основного App ID и связанного Services ID. Bundle ID приложения из текущей передачи: `date.wiring.app`; проверить актуальное значение перед настройкой.
- `APPLE_CLIENT_ID` — Services ID; `APPLE_CLIENT_SECRET` — подписанный ES256 JWT. Секрет имеет срок действия, его нужно обновлять до истечения. Ключи `.p8`, JWT и signing credentials не коммитить.
- Зарегистрировать HTTPS Return URL `/api/auth/apple/callback` на используемом домене, учитывая `BASE_PATH`. В профиле TestFlight сейчас указан `https://wiring.date`; его callback должен быть зарегистрирован и origin разрешён на сервере. Localhost/IP для Apple callback не подходят.
- Для писем на скрытые адреса зарегистрировать отправителя в Apple Private Email Relay и настроить SPF/DKIM.
- Подробности: [social-login.md](social-login.md). Сначала объединить и выложить серверные изменения, затем проверять приложение.

## Проверки и статус

На отдельной локальной PostgreSQL `wiring_test` прошли все 141 Python-тест. Также прошли `npm run typecheck`, `npm run build`, `npm run test:router` и все 10 тестов профиля. Новые тесты проверяют реальную JWT-подпись на тестовом ключе, неверные claims/nonce, истечение срока, POST без cookie, исходный браузер, повторное использование и отмену.

Реальный вход через Apple ещё не проверен, настройки Apple Developer в этой работе не внесены, production-деплой не выполнен. После объединения проверить на подписанной iOS-сборке: регистрацию с обычной и скрытой почтой, выход и повторный вход в тот же ID, отмену, согласия, неверный/replayed native code и восстановление мобильной сессии. Google/Яндекс должны продолжать работать. Android использует тот же общий код; учитывать текущий порядок выпуска из передачи Мише.
