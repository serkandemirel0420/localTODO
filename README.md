# Local Todo

Mobile todo app built with Expo and React Native.

## Run

```sh
make install
make start
```

Scan the QR code with Expo Go while your phone and computer are on the same
Wi-Fi network.

Google Drive backup on Android needs a development build, not Expo Go. Without
USB, build an installable APK in EAS cloud:

```sh
make android-dev-cloud
make start-dev
```

When the EAS build finishes, open the install link or QR code on the Android
phone, install the APK, then scan the `make start-dev` QR code from that installed
Local Todo development app. Keep the phone and computer on the same Wi-Fi.
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
- Swipe left on a todo to reveal the menu action.
- Open Settings from the filter menu to back up or restore Google Drive data.

## Search

Search uses `minisearch`, an in-memory Lucene-style full-text index with prefix
matching, fuzzy matching, and `AND` term combination.

## Storage

Todos and app settings are stored locally through AsyncStorage. Google OAuth
tokens are stored through SecureStore. Google Drive backup stores todos and app
settings, but not OAuth tokens.
