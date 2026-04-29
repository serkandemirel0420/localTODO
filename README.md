# Local Todo

A minimal native React Native todo app built with Expo.

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
- Swipe right on an item to mark it done or active.
- Swipe left on an item to delete it.

## Search

Search uses `minisearch`, an in-memory Lucene-style full-text index with prefix
matching, fuzzy matching, and `AND` term combination.

## Storage

The app currently stores todos locally through AsyncStorage in
`src/storage/todoStore.ts`. That file exposes a small `TodoStore` interface, so a
future Google Drive-backed store can replace `localTodoStore` without changing
the UI or search layer.
