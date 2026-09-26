#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "$(uname -s)" == Darwin ]]; then
  export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
  if [[ -z "${JAVA_HOME:-}" ]]; then
    JAVA_HOME=$(/usr/libexec/java_home -v 17 2>/dev/null || /usr/libexec/java_home -v 21 2>/dev/null || /usr/libexec/java_home)
    export JAVA_HOME
  fi
else
  export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
fi
export PATH="${JAVA_HOME:+$JAVA_HOME/bin:}$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

if [[ ! -d "$ANDROID_HOME" ]]; then
  echo 'Android SDK not found. Install it in Android Studio or set ANDROID_HOME.' >&2
  exit 1
fi
node scripts/configure-android.cjs

action="${1:-run}"
if [[ $# -gt 0 ]]; then shift; fi
case "$action" in
  run) exec node node_modules/react-native/cli.js run-android --active-arch-only "$@" ;;
  studio)
    if [[ "$(uname -s)" != Darwin ]]; then
      echo 'Open the android directory in Android Studio.'
      exit 0
    fi
    # Use the IDE launcher: macOS document-open events can select the parent
    # repository instead of importing the nested Gradle project.
    for studio_app in "${ANDROID_STUDIO_APP:-/Applications/Android Studio.app}" "$HOME/Applications/Android Studio.app"; do
      if [[ -x "$studio_app/Contents/MacOS/studio" ]]; then
        exec "$studio_app/Contents/MacOS/studio" "$PWD/android"
      fi
    done
    echo 'Android Studio not found. Set ANDROID_STUDIO_APP to its .app directory.' >&2
    exit 1
    ;;
  devices) exec adb devices -l ;;
  apk)
    cd android
    exec ./gradlew :app:assembleRelease "-PreactNativeArchitectures=${ANDROID_ABIS:-arm64-v8a}" "$@"
    ;;
  install)
    apk=android/app/build/outputs/apk/release/app-release.apk
    if [[ ! -f "$apk" ]]; then
      echo 'Run npm run android:apk first.' >&2
      exit 1
    fi
    exec adb install -r "$apk" "$@"
    ;;
  *) echo "Unknown action: $action" >&2; exit 1 ;;
esac
