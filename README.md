# Local Todo

A minimal native React Native todo app built with Expo.

## Run

```sh
make install
make ios
```

or:

```sh
make android
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
