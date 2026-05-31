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
backup uploads `local-todo-backup.json` to the Drive `appDataFolder`, which is
private app storage in the user's Drive.

There is no API key or client secret in the app. Google still requires OAuth
client IDs so the user can grant Drive permission to this build. Create OAuth
clients in Google Cloud for:

- iOS bundle ID: `com.localtodo.app`
- Android package: `com.localtodo.app`
- Web, if you run the web target

Then copy `.env.example` to `.env` and fill:

```sh
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...
```

For the local APK installed with `make android-release-install`, use this Android
OAuth client setup in Google Cloud:

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
4. Put the created Android client ID in `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`
   and rebuild/reinstall the APK.

OAuth redirects require a development or production build with the app scheme
from `app.json`. Expo Go cannot complete this OAuth redirect reliably because it
does not use this app's custom scheme.

Android Google Sign-In also requires a development or production build because
the native Google module is not included in Expo Go. The Android OAuth client
must use package `com.localtodo.app` and the SHA-1 fingerprint of the certificate
that signs the APK you install. For EAS cloud APKs, use the SHA-1 from the EAS
Android credentials for this project.

## Use

- Type in the top field to search existing items.
- Press return while typing to add a new todo.
- Double tap the todo list to open the menu.
- Tap a checkbox to mark a todo done or active.
- Swipe right on a todo to reveal done/delete actions.
- Swipe left on a todo to open its item settings.
- Open Settings from the filter menu to back up or restore Google Drive data.

## Search

Search uses SQLite full-text search over todo titles and notes, with prefix
matching and `AND` term combination.

## Storage

Todos are stored locally through SQLite. App settings are stored through
AsyncStorage. Google OAuth tokens are stored through SecureStore. Google Drive
backup stores todos and app settings, but not OAuth tokens.
