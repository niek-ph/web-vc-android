# Web VC for Android

A personal browser-and-casting app built with **bare React Native 0.87.1**, React
19, TypeScript, Kotlin, and local Gradle builds. No Expo, EAS, cloud build service,
or Play Store account is needed.

The starter includes a WebView browser with an address bar, back/reload controls,
a native Chromecast / Google TV device picker, and a **Cast sample** action using
a five-second CC0 flower video from MDN. The **Videos** list detects web streams,
embedded players, HLS qualities and subtitle tracks.

## Start developing

From the repository root:

```sh
npm ci                 # Only needed after cloning or changing dependencies
npm start              # Leave Metro running in this terminal
```

In a second terminal, with an emulator running or a USB-debugging phone connected:

```sh
npm run android
```

This builds and installs the debug app for the connected device's architecture.
Edit `App.tsx` or `src/` and save: Fast Refresh updates JavaScript/TypeScript
without a native rebuild. Rebuild after adding native dependencies or changing
Kotlin, Gradle, or the manifest. The first build downloads native dependencies;
later builds use Gradle's local cache. Avoid `gradlew clean` during normal work.

## Use Android Studio

```sh
npm run android:studio
```

This writes ignored machine-local SDK and Node paths, then opens the **android/**
directory in Android Studio on macOS. Let Gradle sync finish, select the `app`
configuration and a device, then press Run. Keep `npm start` running for debug
builds. For a physical phone, run `adb reverse tcp:8081 tcp:8081` when launching
from Studio; `npm run android` handles this automatically.

If Studio asks which Gradle JDK to use, select JDK 21 (the existing JetBrains JBR
21 installation on this Mac). The terminal scripts prefer JDK 17 if installed,
then JDK 21, and respect an explicit `JAVA_HOME`. Node is resolved to its actual
executable, so Studio does not depend on a version-manager shim in your shell.
Run any `android:*` command again after changing Node installations.

## Test on your phone

1. Enable Android **Developer options → USB debugging**.
2. Connect the phone by USB and accept its debugging prompt.
3. Run `npm run android:devices` and confirm the phone appears as `device`.
4. Run `npm run android` while Metro is running.
5. Put the phone and Chromecast / Google TV on the same Wi-Fi, tap the Cast icon,
   choose the TV, and press **Cast sample**.

The device needs Google Play Services. A Google Play emulator is useful for UI
checks, but use a physical phone for Cast discovery/playback. Guest networks,
VPNs, and Wi-Fi client isolation can prevent discovery.

The sample is MDN's [CC0 flower clip](https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4).
It lasts five seconds; **Video finished** afterward is expected. The app checks
the source before casting and displays playback errors reported by the receiver.

## Choose a website video

1. Open the film page in the address bar.
2. Press Play on its player. Some pages require a second Play click inside the
   embedded player before a stream is requested.
3. Tap **Videos (N) · Players (N)**. Embedded player links are listed separately;
   **Open player** lets you explore another source while keeping previous results.
4. Stream cards show MP4/WebM/HLS/DASH, resolution, duration, bitrate and codecs
   where detected. **Read qualities & subtitles** reads an HLS playlist without
   downloading the film. Choose **Auto quality** for streams with separate audio.
5. Connect with the Cast icon, optionally select a detected WebVTT subtitle, and
   choose **Cast this video**. Successful loading pauses playback in the webpage.

Detection observes video/source/track elements, lazy player links, player JSON,
fetch/XHR and network requests, including cross-origin frames on recent Android
System WebView versions. HLS fragments and known subtitle/audio playlists are
excluded from the video list. Results reset when navigating to a new page normally
or entering a new address; exploring players preserves the list.

The app cannot promise every stream on every website: inactive players must load
first, blob URLs are not directly castable, and DRM or cookie/header-restricted
streams may require a different player or a future local proxy. DASH URLs are
recognized, but DASH manifest track/quality inspection is not implemented.
Subtitle metadata is only shown when the page or manifest exposes it. External
Cast captions currently support WebVTT; SRT/TTML are listed without conversion.
HLS subtitle renditions remain part of the master stream and depend on receiver
support. A compatible format still needs a receiver-accessible URL and CORS.

The Android customization subclasses the upstream WebView manager, preserves its
Fabric component/module, and injects `android/app/src/main/assets/media-detector.js`
at document start. Rebuild after editing that asset or the Kotlin classes. No
patches to `node_modules` are needed.

## Troubleshooting

If a website stays blank, open the same URL in Chrome inside the emulator.
If Chrome also cannot load it, restart the emulator; use **Cold Boot** in Android
Studio's Device Manager if a regular restart does not help. This resolved the
emulator's stalled network/DNS connection during testing. App rebuilds and Metro
restarts do not repair that connection.

The browser displays network/HTTP errors and stops waiting after 30 seconds.
Use **Reload** to retry. JavaScript and DOM storage are enabled for modern sites.

If casting fails, the TV must be able to fetch the video URL itself. A URL working
on the phone or computer does not guarantee it works on the receiver. The original
Big Buck Bunny sample returned HTTP 403, so it has been replaced. The current
sample was verified through receiver-reported playing and finished states.

## Build a standalone APK

```sh
npm run android:apk
npm run android:install  # Install on a connected device
```

Output: `android/app/build/outputs/apk/release/app-release.apk`.

The release APK bundles JavaScript and runs without Metro or your computer.
It defaults to **arm64-v8a** for modern Android phones. To include Intel emulator
support, use `ANDROID_ABIS=arm64-v8a,x86_64 npm run android:apk`.
You can also transfer the APK to your phone and open it, allowing installation
from that source when Android prompts you.

For personal use, this release variant uses the template's development signing
key. It is not a private distribution key. Use your own release signing key
before distributing the app. Debug and release use the same application ID, so
installing one replaces the other.

## Toolchain

- Node 24 LTS (`.nvmrc`), npm, and JDK 17 or 21.
- Android Studio with Android SDK Platform **37** and Build-Tools **37.0.0**.
- Android NDK **27.1.12297006** and CMake **3.22.1** (SDK Manager → SDK Tools).
- Android SDK Platform-Tools; an emulator image with Google Play or a real phone.
- Gradle **9.4.1**, supplied by the checked-in wrapper.
- Minimum device API **24** (Android 7); target API **36**, from the RN template.

Gradle can download missing SDK components when the corresponding licenses have
already been accepted. Otherwise install them and accept their licenses through
Android Studio's SDK Manager. Watchman is optional (`brew install watchman`).

The scripts use `~/Library/Android/sdk` on macOS and `~/Android/Sdk` on Linux, or
your `ANDROID_HOME`. They do not edit shell startup files. For direct `adb` or
Gradle commands on macOS, set these in your terminal:

```sh
export ANDROID_HOME="$HOME/Library/Android/sdk"
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

The convenience scripts target macOS/Linux; on Windows use Android Studio and
`android\gradlew.bat` with SDK, Java, and Node configured in your environment.

## Project layout and checks

```text
App.tsx                         App entry and safe-area provider
src/features/browser/           Browser screen and address validation
src/features/cast/              Cast session and playback UI
src/features/media/             Discovery, playlist parsing, stream/subtitle picker
android/                        Native Android Studio / Gradle project
scripts/                        Local toolchain and build helpers
__tests__/                      Focused behavior tests
```

```sh
npm run check                   # TypeScript, ESLint, and Jest
```

Dependencies are locked in `package-lock.json`; the Google Cast Android SDK is
pinned in `android/build.gradle`. SDK paths, IDE state, build outputs, and
`node_modules` are ignored. The existing Git repository and branch are preserved.

For a repeatable browser integration check, run `node scripts/media-fixture.cjs`
and open `http://10.0.2.2:8082` in the emulator. Expect one MP4 from a separate
iframe origin, 960 × 540 resolution, five seconds and a Dutch WebVTT track. To
also test captions on a physical receiver, run with `MEDIA_FIXTURE_HOST=<Mac LAN IP>`
and open that address on port 8082. This explicitly exposes only the fixture on
the LAN; stop it with Ctrl+C after testing.

## Next features

1. Add playback controls, bookmarks and history.
2. Add DASH manifest inspection and SRT/TTML conversion.
3. Handle websites that require cookies or request headers; consider a local
   media proxy where needed.

Casting sends a media URL to the receiver; it does not mirror the WebView. A web
page URL or `blob:` URL is not automatically a playable video URL. The receiver
must be able to fetch and decode the media itself. DRM and site authentication
need separate consideration.

HTTP is enabled deliberately for local-network resources and HTTP websites;
HTTPS addresses are preferred by default. The browser blocks non-web navigation
schemes and file access. No injected bridge or page-script execution is added by
the app at this stage.

References: [React Native local setup](https://reactnative.dev/docs/getting-started-without-a-framework),
[WebView](https://github.com/react-native-webview/react-native-webview),
[Google Cast Android setup](https://react-native-google-cast.github.io/docs/getting-started/setup).
