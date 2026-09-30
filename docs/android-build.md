# WIRING Mobile — сборка Android

## Окружение и команды (WSL, проверено)
Собрано на `mike@192.168.2.81` (WSL2 Ubuntu 22.04): JDK 17 (Temurin), Android SDK (platform 36, build-tools 36.0.0, cmake 3.22.1, NDK подтянул Gradle), Node 26. Всё в `~/dev/{tools,android-sdk,wiring-mobile}`.
```sh
export JAVA_HOME=$HOME/dev/tools/jdk17 ANDROID_HOME=$HOME/dev/android-sdk
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH
export EXPO_PUBLIC_API_URL=http://192.168.2.101:5070 WIRING_CLEARTEXT=1 CI=1
npm ci --legacy-peer-deps && npx expo prebuild --platform android --no-install
cd android && echo "sdk.dir=$ANDROID_HOME" > local.properties && ./gradlew assembleRelease --no-daemon
```
Результат: `android/app/build/outputs/apk/release/app-release.apk` (104 МБ, все архитектуры, 22 мин с холодным кэшем). На Mac: `build/wiring-android-release.apk`.
Подводные камни:
- При копировании проекта с Mac через tar появляются файлы `._*`; Metro падает на них. Удалять: `find . -name '._*' -not -path './node_modules/*' -delete` (или `COPYFILE_DISABLE=1 tar`).
- Баннер WSL печатается в stdout любой ssh-команды, поэтому scp и бинарный `cat` через ssh ломаются. Файлы забирать через `base64` с маркерами.
- `npm install` требует `--legacy-peer-deps` (конфликт peer-зависимостей react-dom).
- Cleartext-трафик включается только `WIRING_CLEARTEXT=1` (нужен для API по http). Без переменной сборка безопасна для production.
- APK подписан debug-ключом. Для Google Play нужен release keystore и AAB (`./gradlew bundleRelease`).
