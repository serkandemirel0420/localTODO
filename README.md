# Local Todo

Mobile todo app built with Expo and React Native.

## Run

```sh
make install
make start
```

Scan the QR code with Expo Go while your phone and computer are on the same
Wi-Fi network.

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

## Use

- Type in the top field to search existing items.
- Press return while typing to add a new todo.
- Double tap the todo list to open the menu.
- Tap a checkbox to mark a todo done or active.
- Swipe right on a todo to reveal done/delete actions.
- Swipe left on a todo to reveal the menu action.
- Open the left drawer to tune drawer and todo swipe settings.

## Search

Search uses `minisearch`, an in-memory Lucene-style full-text index with prefix
matching, fuzzy matching, and `AND` term combination.

## Storage

The app currently stores todos locally through AsyncStorage in
`src/storage/todoStore.ts`. That file exposes a small `TodoStore` interface, so a
future Google Drive-backed store can replace `localTodoStore` without changing
the UI or search layer.
