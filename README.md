# Local Todo

Mobile todo app built with Expo and React Native.

## Run

Install a standalone Android build on a USB-connected phone:

```sh
make install
make android-release-install
```

This installs the release APK on the phone. It embeds the JavaScript bundle, so
the app does not need Metro, Expo Go, or the computer after installation.

For Expo Go development:

```sh
make install
make start
```

Scan the QR code with Expo Go while your phone and computer are on the same
Wi-Fi network.

Google Drive backup on Android needs a development build, not Expo Go. Without
USB, build a standalone APK in EAS cloud:

```sh
make android-preview-cloud
```

Install the EAS APK link or QR code on the Android phone. This standalone build
also runs without a Metro server.

For a development client with live reload and dev tools:

```sh
make android-dev-cloud
make start-dev
```

When the EAS build finishes, open the install link or QR code on the Android
phone, install the APK, then scan the `make start-dev` QR code from that installed
Local Todo development app. This mode does need the phone and computer on the
same Wi-Fi while you are running it.
If the phone cannot reach the computer on LAN, use `make start-dev-tunnel`
instead of `make start-dev`.

If Expo Go still shows an SDK compatibility error after package changes:

```sh
make start-clear
```

For simulator-only local development:

```sh
make start-local
```

For a physical phone on a different network:

```sh
make start-tunnel
```

The default Metro port is `8083`. Override it with `make start PORT=8090`.

## Google Drive Backup

Google Drive backup is one action in the app: tap **Back up to Google Drive**,
Google login opens if permission is needed, then the backup continues. Android
uses native Google Sign-In authorization; iOS uses the OAuth browser flow. The
production build uploads unlimited `local-todo-backup-slot-NN.json` files to
Drive `appDataFolder`. Development builds use
`local-todo-dev-backup-slot-NN.json` so dev and prod restores do not overwrite
each other.

There is no API key or client secret in the app. Google still requires OAuth
client IDs so the user can grant Drive permission to each build identity. Create
separate OAuth clients in Google Cloud for:

- iOS dev bundle ID: `com.localtodo.app.dev`
- iOS prod bundle ID: `com.localtodo.app`
- Android dev package: `com.localtodo.app.dev`
- Android prod package: `com.localtodo.app`
- Web/desktop, if you run the web target or packaged desktop app

Then copy `.env.example` to `.env` and fill:

```sh
EXPO_PUBLIC_GOOGLE_IOS_DEV_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_IOS_PROD_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_ANDROID_DEV_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_ANDROID_PROD_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...
```

For the packaged desktop app, create a Web OAuth client and add this authorized
JavaScript origin:

- `http://127.0.0.1:17873`

For the local dev APK installed with `make android-dev`, use this Android OAuth
client setup in Google Cloud:

- Application type: Android
- Package name: `com.localtodo.app.dev`
- SHA-1: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`

For the local production APK installed with `make android-release-install`, use:

- Application type: Android
- Package name: `com.localtodo.app`
- SHA-1: `A7:6E:45:8E:75:D1:67:F6:EA:F9:3E:F8:AB:95:4C:AA:DA:70:43:43`

For the EAS `preview` APK, create another Android OAuth client with the same
package name and this EAS keystore SHA-1:

```text
2E:FF:D2:31:45:94:68:D0:46:A2:65:A1:5F:0F:99:66:98:5A:E0:1E
```

The Google Cloud checklist is:

1. Open Google Cloud Console, select the project used for this app, and enable
   the Google Drive API.
2. Open Google Auth Platform, configure the app/consent screen, and add the
   Drive `appDataFolder` scope:
   `https://www.googleapis.com/auth/drive.appdata`.
3. Open Google Auth Platform > Clients and create the Android OAuth client for
   the APK you are installing, using the package name and matching SHA-1 above.
4. Put the created Android client ID in the matching dev or prod env variable
   and rebuild/reinstall the APK.

If a production APK opens Google, including in Brave, and says **Access blocked:
Local Todo has not completed the Google verification process**, publish the
Google OAuth consent screen. This is not the same as publishing the Android app
to the Google Play Store. Check the Google Cloud project that owns the
production OAuth client ID, then open Google Auth Platform > Audience and set
the publishing status to **In production**. The APK can stay privately
installed; the OAuth app is what becomes available to Google accounts.

Then open Data Access in the same project and make sure the app declares the
Drive `appDataFolder` scope used by this app:
`https://www.googleapis.com/auth/drive.appdata`. The backup code only requests
that app-data scope, so this block usually means the OAuth app is still in
Testing, the scope was not declared on the consent screen, or the APK is using a
client ID from a different Google Cloud project than the one you configured.

OAuth redirects require a development or production build with the app scheme
from `app.json`. Expo Go cannot complete this OAuth redirect reliably because it
does not use this app's custom scheme.

Android Google Sign-In also requires a development or production build because
the native Google module is not included in Expo Go. The Android OAuth client
must use the package name and SHA-1 fingerprint of the certificate that signs
the APK you install. For EAS cloud APKs, use the SHA-1 from the EAS Android
credentials for this project.

## Use

- Type in the top field to search existing items.
- Press return while typing to add a new todo.
- Double tap the todo list to open the menu.
- Tap a checkbox to mark a todo done or active.
- Swipe right on a todo to reveal done/delete actions.
- Swipe left on a todo to open its item settings.
- Open Settings from the filter menu to back up or restore Google Drive data.

## Search

Search uses normalized substring matching over todo titles and notes, with
`AND` term combination.

## Storage

Todos are stored locally through SQLite. App settings are stored through
AsyncStorage. Google OAuth tokens are stored through SecureStore. Google Drive
backup stores todos and app settings, but not OAuth tokens.
