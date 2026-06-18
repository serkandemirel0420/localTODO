# Local Todo App Summary

This file is the working map for the whole app. Keep it updated when a feature
changes so future fixes can start from the intended behavior instead of from
guesswork.

## Product Shape

Local Todo is a mobile-first personal todo app built with Expo and React Native.
It is optimized for quick capture, customizable list/preset workflows, date and
reminder filtering, undoable delete flows, and private Google Drive backup.

The main app is in `App.tsx`. Shared domain code lives under `src/`, with UI
components in `src/components/`, persistence in `src/storage/`, Google Drive
backup code in `src/google/`, and development-only seed data in `src/dev/`.

## Primary Screens And Surfaces

- Main todo view: capture input, search, grouped/filtered todo list, swipe
  actions, todo detail editing, completed item visibility, and undo feedback.
- Filter configuration screen: list/date/priority/repeating filters, avoided
  filters, sort mode, group mode, visible meta tags, section expansion state,
  and result count.
- Quick preset navbar: horizontal shortcuts below the list. It is driven by the
  Settings list tree and saved preset assignments, not by hardcoded presets.
- Settings drawer/menu: editable lists, saved presets, navbar slots/icons,
  filter colors, meta tag visibility, deleted todos, backup/restore, and dev
  test-data controls.
- Google Drive slot picker: choose one of 10 production slots or 10 test slots
  for backup/restore.
- Reminder and repeat pickers: reminder time, repeat interval, and repeating
  item filter state.
- Calendar and date controls: relative date presets, custom dates, and display
  mode for date labels.

## Todo Data Model

Todos are defined in `src/todos.ts`.

Each todo has:

- `id`: stable unique id.
- `text`: short row title.
- `content`: longer note/detail text.
- `pinned`: row is sorted above unpinned rows where applicable.
- `done`: completed state.
- `createdAt`: timestamp used for ordering and date anchoring.
- `filters`: selected date, list, priority, and reminder/repeat values.

Todo filters are normalized on load and write. Date values are frozen against an
anchor when needed so relative labels such as Today or Tomorrow do not drift in
stored items.

## Filtering Rules

Filter selection is intentionally user-friendly and broad:

- Values within the same filter family are OR semantics.
- Different filter families layer together.
- Avoided filters exclude matching items.
- The `Repeating items` value is a reminder-filter sentinel, not a normal date
  bucket.
- Search uses normalized AND term matching across title and notes.

These contracts are especially important when touching preset application,
quick navbar taps, create-and-reveal behavior, or notification reveal behavior.

## Lists, Presets, And Navbar

Lists and presets are fully customizable app data.

The Settings list tree is stored in `AppSettings.listMenuTree`. Each list can
carry label, icon, visibility, keywords, children, and optional sort/group
preferences. The navbar reads this tree so visible Settings lists naturally
become shortcut slots.

Saved presets are stored in `AppSettings.menuPresets`. A saved preset contains:

- label and optional hidden search keywords.
- selected filters.
- required filters.
- avoided filters.
- list ordering mode.
- todo sort and group modes.

`src/presets.ts` turns Settings lists into preset-shaped shortcut objects. That
lets list shortcuts and saved presets share one application path. If a user
saves a preset that exactly matches a list label, that saved preset wins so the
user's custom sort/group choices are respected.

The navbar can grow with the Settings list tree up to the configured maximum.
Navbar slot ids and icon names are settings data, so they must not be replaced
with fixed app assumptions.

## Reminders And Repeating Items

Reminder state lives in the todo reminder filter family. `src/reminders.ts`
encodes and decodes reminder time plus repeat preset values. Supported repeat
presets are none, daily, weekly, monthly, and yearly.

`src/todoAlarms.ts` owns scheduled notifications. Android exact-alarm access is
checked through the native module in `android/app/src/main/java/com/localtodo/app`.
If exact alarms are blocked, the app asks the user to open Android settings so
closed-app reminders are not delayed.

Notification taps should reveal the target todo by id while preserving the
filter behavior that makes the todo visible.

## Undo And Deleted Todos

Deleted todos are stored in app settings as `deletedTodos`, with a deletion
timestamp. The app uses this data for undo/restore flows and for Settings-level
deleted-item management.

When changing delete or restore behavior, keep these requirements:

- Delete should feel immediate.
- Undo should restore the same todo data.
- Restored items should be visible or revealed in the current context.
- Completed/deleted state must not corrupt backup or search data.

## Persistence

Todo persistence is handled by `src/storage/todoStore.ts` and
`src/storage/todoDatabase.ts`.

- Todos live in SQLite (`local-todo.db`).
- The SQLite store maintains normal columns plus an FTS search table.
- Legacy AsyncStorage todos migrate into SQLite when the database is empty.
- App settings live in AsyncStorage under `local-todo.settings.v1`.
- OAuth tokens live in SecureStore through `src/google/googleAuthStore.ts`.

Backups include todos and app settings. Backups do not include OAuth tokens.

## Google Drive Backup And Restore

Drive backup logic is in `src/google/driveBackup.ts`.

The app uses Google Drive `appDataFolder`, which keeps backup files private to
the app. The current UX provides:

- 10 production backup slots.
- 10 test backup slots.
- Slot picker for backup and restore.
- Empty slot restore disabled.
- Filled slot backup replaces that slot.
- Automatic backup writes to slot 1.
- Legacy one-file and timestamped backups remain restorable through slot 1.

Production and test backups use separate basenames. Dev builds also use a dev
production basename so local development cannot overwrite installed production
backup data.

## Development Test Data

Development test data is in `src/dev/seedTestTodos.ts`.

The dev seed is intentionally development-only. It creates sample customizable
lists, saved presets, and many todos so preset/navbar/settings behavior can be
checked quickly without turning those examples into production defaults.

Seeded lists cover:

- navbar-visible list shortcuts.
- one hidden navbar list.
- nested list sections.
- list-specific icon, keyword, sort, and group settings.

Seeded presets cover:

- list/status grouping.
- today + priority focus.
- avoided-filter behavior.
- repeating-item filtering.
- hidden-list/backlog filtering.

Seeded todos cover:

- multiple lists.
- relative and absolute dates.
- priorities.
- reminders.
- repeat presets.
- done and pinned states.
- one-list and multi-list assignments.

Use this data to quickly verify presets, navbar list shortcuts, filters, group
headers, search, reminder labels, repeat filters, and backup/restore behavior.

## Component Responsibilities

- `App.tsx`: orchestration, state, settings flows, modals, and top-level UI.
- `src/components/TodoRow.tsx`: row rendering and row-level interactions.
- `src/components/QuickPresetNav.tsx`: navbar slot rendering and press/hold UI.
- `src/components/FilterConfigScreen.tsx`: filter/sort/group/meta-tag screen.
- `src/components/ReminderTimeModal.tsx`: reminder time modal.
- `src/components/ReminderTimeWheelPicker.tsx`: wheel-based time picker.
- `src/components/RepeatReminderModal.tsx`: reminder plus repeat editor.
- `src/components/RepeatPickerList.tsx`: repeat preset list.
- `src/components/SimpleCalendarModal.tsx`: custom date picker.
- `src/components/TodoMetaTags.tsx`: row meta tag display.
- `src/components/InlineTimePicker.tsx`: inline time editing helper.

When a feature grows, prefer moving focused rendering or domain logic out of
`App.tsx` into one of these components or a small `src/` helper module.

## Build And Verification

Common checks:

```sh
npm run typecheck
git diff --check
make android-release
```

Install a release build on a USB-connected Android phone:

```sh
make android-release-install
adb devices -l
adb shell dumpsys package com.localtodo.app | rg "versionCode|versionName|lastUpdateTime"
```

For dev-client USB work:

```sh
make start-dev-usb
make android-open-metro
```

Before shipping broad app changes, test at least:

- create todo from empty input state and from active filter state.
- edit todo text/content/filters.
- swipe done/delete/settings actions.
- undo delete.
- search with multiple terms.
- list/date/priority/reminder filters.
- repeating item filter.
- quick navbar tap and long-press detail.
- saved preset apply and edit.
- Settings list reorder, icon, visibility, and keywords.
- sort and group modes.
- completed item visibility.
- reminder scheduling.
- notification reveal.
- production backup slot save and restore.
- test backup slot save and restore.
- dev seed add/remove flow.
