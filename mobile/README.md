# WIRING Mobile

Expo (React Native + TypeScript) клиент для существующего Flask API https://github.com/volodymyrk8/wiring. План: [../docs/mobile-plan.md](../docs/mobile-plan.md).

## Запуск

```sh
npm install
# сервер по умолчанию https://wiring.date; локально:
EXPO_PUBLIC_API_URL=http://127.0.0.1:5070 npx expo start   # iOS simulator
EXPO_PUBLIC_API_URL=http://10.0.2.2:5070 npx expo start    # Android emulator
npm run typecheck
```

Локальный бэкенд и тестовые аккаунты (`dev@wiring.test` / `wiring-dev`) описаны в README репозитория wiring.

## Что есть
Вход, регистрация (18+, согласие), лента (лайк / пропуск, мэтч), лайки, чаты (опрос раз в 8 с, защита от устаревших ответов), профиль человека с жалобой и блокировкой, свой профиль, выход, удаление аккаунта, светлая и тёмная темы.

## Чего нет (следующие шаги)
- Токен-авторизация: сейчас используется cookie-сессия, которую хранит нативный сетевой стек. Для релиза нужны `Authorization: Bearer` и refresh (фаза 1 плана).
- Нативный push (APNs/FCM), пагинация чата, SSE/WebSocket.
- Редактор анкеты (фото, теги, намерения), фильтры ленты, голосовые и фото в чате, WIRING+.
- Тесты (Jest, Maestro), Sentry, EAS Build/Submit.
- Приложение не запускалось против живого сервера: проверены только типы (`tsc`) и сборка бандла.

## Сборка iOS (проверено на Xcode 27, iPhone 17 Simulator)
```sh
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8   # иначе CocoaPods падает на юникоде в пути
EXPO_PUBLIC_API_URL=http://127.0.0.1:5070 npx expo run:ios --configuration Release --device "iPhone 17" --no-bundler
xcrun simctl launch booted date.wiring.app
```
Release-сборка встраивает JS и не требует Metro. Debug-клиент подхватывает любой Metro на порту 8081 (у меня там оказался чужой проект), поэтому для скриншотов использовался Release.
Ошибка `osascript ... System Events` в конце `expo run:ios` безвредна: приложение уже установлено, запускать вручную командой выше.

## Известные ограничения по итогам запуска
- Лента: если тестовый аккаунт уже лайкнул всех, покажется «Пока всё». Сброс на локальной БД: `DELETE FROM feed_history`.
- Не проверялись: регистрация, жалоба и блокировка (кроме отрисовки), отправка сообщений, удаление аккаунта, тёмная тема, Dynamic Type/VoiceOver.

## Сборка Android (WSL, проверено)
Собрано на `mike@192.168.2.81` (WSL2 Ubuntu 22.04): JDK 17 (Temurin), Android SDK (platform 36, build-tools 36.0.0, cmake 3.22.1, NDK подтянул Gradle), Node 26. Всё в `~/dev/{tools,android-sdk,wiring-mobile}`.
```sh
export JAVA_HOME=$HOME/dev/tools/jdk17 ANDROID_HOME=$HOME/dev/android-sdk
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH
export EXPO_PUBLIC_API_URL=http://192.168.2.101:5070 CI=1
npm ci --legacy-peer-deps && npx expo prebuild --platform android --no-install
cd android && echo "sdk.dir=$ANDROID_HOME" > local.properties && ./gradlew assembleRelease --no-daemon
```
Результат: `android/app/build/outputs/apk/release/app-release.apk` (104 МБ, все архитектуры, 22 мин с холодным кэшем). На Mac: `build/wiring-android-release.apk`.
Подводные камни:
- При копировании проекта с Mac через tar появляются файлы `._*`; Metro падает на них. Удалять: `find . -name '._*' -not -path './node_modules/*' -delete` (или `COPYFILE_DISABLE=1 tar`).
- Баннер WSL печатается в stdout любой ssh-команды, поэтому scp и бинарный `cat` через ssh ломаются. Файлы забирать через `base64` с маркерами.
- `npm install` требует `--legacy-peer-deps` (конфликт peer-зависимостей react-dom).
- Разрешён cleartext-трафик (`expo-build-properties`), потому что API по http. Для production переключить на https и убрать.
- APK подписан debug-ключом. Для Google Play нужен release keystore и AAB (`./gradlew bundleRelease`).
