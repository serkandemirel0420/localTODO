# Local Todo App Summary

This document is the working map for the whole app. Keep it updated whenever a
feature changes so future work can start from the intended behavior instead of
from guesswork.

## App Aim

Local Todo is a mobile-first personal todo app for fast capture, flexible
filtering, and recoverable day-to-day task management. The app is designed for
someone who wants to quickly write a thought or task, place it into one or more
custom contexts, jump between those contexts from the bottom navbar, and keep
their private data recoverable through Google Drive backups.

The app is not a fixed GTD template. Lists, saved presets, navbar shortcuts,
filter colors, sort/group behavior, search keywords, and backup slots are user
data. The code should treat them as customizable state, not as hardcoded
product assumptions.

The core goals are:

- Capture tasks quickly with minimal friction.
- Keep tasks visible after creation, even when filters are active.
- Let the user build their own list and preset system.
- Make filtering broad and forgiving by default.
- Keep destructive actions undoable or recoverable.
- Deliver reminders reliably on Android, including while the app is closed.
- Back up and restore both todos and app settings.
- Keep dev/test workflows fast enough to check presets, filters, and backups
  without hand-entering data every time.

## Product Shape

Local Todo is an Expo React Native app.

- Main entry: `App.tsx`.
- Domain helpers: `src/`.
- UI components: `src/components/`.
- Persistence: `src/storage/`.
- Google Drive backup: `src/google/`.
- Development seed data: `src/dev/`.
- Android native alarm bridge: `android/app/src/main/java/com/localtodo/app/`.

The app has one primary mobile surface with layered drawers and modals rather
than many separate screens. The main view stays close to the user while
Settings, filters, reminders, and detail editing open as focused overlays.

## Primary User Flow

The normal use loop is:

1. Type a todo title in the create field.
2. Optionally add notes, list/date/priority/reminder filters, or repeat rules.
3. Save the todo.
4. Use quick navbar shortcuts, filter controls, or search to move between task
   views.
5. Mark tasks done, edit details, or swipe for row actions.
6. Undo accidental changes or restore deleted items from Settings.
7. Back up app data to Google Drive slots.

Creation should feel immediate. If a user creates an item while filtered to a
specific list/date/preset, the app should seed the new item from that context
or reveal the new item afterward. Bugs that look like "creation failed" are
often visibility/reveal bugs, not database insert bugs.

## Main Surfaces

### Main Todo View

The main view contains:

- Header title based on current selection, active preset, active list, or app
  fallback title.
- Settings button.
- Create/search area.
- Filtered todo list.
- Todo rows with checkbox, title, notes preview, meta tags, and swipe actions.
- Undo toast above the bottom nav.
- Quick preset navbar.
- Bottom navigation controls for search, filters/calendar, list/menu, and
  settings.

The todo list can render flat rows or grouped sections depending on active
group mode. Grouped views support section collapse/expand and double-tap quick
nav behavior for toggling all sections.

### Todo Detail Editing

Todo details allow editing:

- Title.
- Longer content/note text.
- Lists.
- Dates.
- Priority.
- Reminder time.
- Repeat rule.
- Done state.
- Pin state.

Detail edits should preserve the same `Todo` data shape as row edits and should
sync to SQLite plus alarms when relevant.

### Filter Configuration

The filter config screen lets the user adjust:

- Optional selected filters.
- Required filters.
- Avoided filters.
- List/date/priority/reminder filters.
- Repeating items filter.
- Sort mode.
- Group mode.
- Visible meta tag settings.
- Expanded/collapsed section state.

Filter config state is persisted so the UI opens in the same shape the user
left it.

### Quick Preset Navbar

The quick preset navbar is the horizontal shortcut row above the bottom nav. It
is driven by settings data:

- Visible Settings lists become list shortcuts.
- Explicit saved preset assignments can override a slot.
- Slot icons come from list icons or saved icon settings.
- Hidden Settings lists are skipped.
- Slot numbers are visible order; `navIndex` is the persisted settings/list
  index. Those are different when hidden lists are skipped.

Quick nav behavior:

- Tap applies the shortcut or saved preset.
- Long press shows preset details.
- Double tap a matching preset can toggle grouped section collapse/expand.
- The same shortcut source is shown inside Settings under `Navbar shortcuts`.

Important contract: quick nav presets are not hardcoded starter buttons. They
are derived from `AppSettings.listMenuTree`, `quickPresetNavPresetIds`, and
`quickPresetNavIconNames`.

### List/Menu Drawer

The list/menu drawer is where users browse lists, dates, priorities, repeat
filters, saved presets, sort/group options, and meta-tag controls. Saved preset
rows default to edit/open behavior, not surprise immediate apply, because the
user often wants to adjust an existing preset.

The menu must keep these concepts separate:

- Applying a list or preset to the active todo/list view.
- Editing saved preset settings.
- Editing hidden search keywords.
- Applying filters to selected todos.
- Editing current todo targets.

### Search

Search uses normalized AND-term matching across todo titles and notes. Search
also exposes saved presets and list sections. Hidden search keywords can be
attached to presets and lists so the user can find a concept without displaying
those keywords everywhere.

Important search behavior:

- Search title/section rows should remain stable under list recycling.
- Preset/list keyword editing is intentionally behind long press.
- Search should not add always-visible clutter for hidden keyword metadata.

### Settings

Settings is the control center for app configuration and recovery. It includes:

- Backup and restore.
- Completed/done item visibility.
- Deleted todos and restore/delete management.
- Settings list editor.
- Navbar shortcut visibility and icon/list controls.
- Filter colors.
- Date label display mode.
- Meta tag visibility.
- Dev test-data controls in dev builds.

Settings list rows support:

- Rename and hidden keyword editing.
- Icon selection.
- Pin/unpin in navbar.
- Reorder by selecting two handles to swap.
- Swipe left to delete.

The `Navbar shortcuts` strip in Settings is a read of the same quick nav items
used by the bottom navbar. If the bottom navbar shows `Status` first, Settings
should show `Status` first in that strip.

## Data Model

### Todo

Todos are defined in `src/todos.ts`.

Each todo has:

- `id`: stable unique id.
- `text`: short title.
- `content`: longer notes.
- `pinned`: whether the todo is pinned above normal rows where supported.
- `done`: completed state.
- `createdAt`: creation timestamp used for sorting and date anchoring.
- `filters`: date/list/priority/reminder values.

Todo filters are normalized on load and write. Date values can be frozen
against an anchor so relative labels such as `Today` and `Tomorrow` do not
drift incorrectly when saved on a todo.

### Todo Filters

`TodoFilters` has four families:

- `date`.
- `list`.
- `priority`.
- `reminder`.

The reminder family also carries encoded repeat state because reminders and
repeat rules are edited together.

### Deleted Todo

Deleted todos are stored as todo snapshots plus `deletedAt`. They live in app
settings, not in the active SQLite todo list. This lets the app offer undo and
Settings-level restore/delete management.

### App Settings

App settings are defined in `src/storage/appSettingsStore.ts` and persisted in
AsyncStorage under `local-todo.settings.v1`.

Important settings include:

- Selected, required, and avoided filters.
- Last create filters.
- List tree.
- List order mode.
- Saved presets.
- Quick nav preset assignments and icon names.
- Filter config UI state.
- Filter colors.
- Meta tag visibility.
- Deleted todos.
- Done visibility.
- Date label display mode.
- Google Drive backup state.
- Collapsed group ids.
- Global sort and group modes.

Any feature that changes settings should consider:

- Local normalization in `appSettingsStore`.
- Backup serialization in `src/google/driveBackup.ts`.
- Restore normalization.
- UI state and refs in `App.tsx`.

### List Tree

Lists are stored as `StoredListMenuNode`.

Each list can carry:

- `label`.
- `iconName`.
- `showInNavbar`.
- `searchKeywords`.
- `children`.
- `sortMode`.
- `groupMode`.
- `subsectionSortMode`.
- `subsectionGroupMode`.

Top-level and nested list labels share one uniqueness space. Adding or renaming
a list must check the whole tree, not only top-level items.

### Saved Presets

Saved presets are stored as `StoredMenuPreset`.

Each preset contains:

- `id`.
- `label`.
- optional hidden `searchKeywords`.
- selected filters.
- required filters.
- avoided filters.
- list order mode.
- todo group mode.
- todo sort mode.
- creation timestamp.

Saved presets are complete view definitions. Applying one should restore its
filters and display modes. Editing one should not accidentally apply a
different view.

## Filtering Semantics

Filtering is intentionally broad and user-friendly:

- Values inside the same family use OR semantics.
- Different families layer together.
- Required filters must match.
- Avoided filters exclude matches.
- Search terms use AND semantics.
- List parents can match child list values where subsection logic needs that.

Examples:

- List `Work` plus list `Home` means Work OR Home.
- List `Work` plus priority `High` means Work AND High.
- Required date `Today` means every visible item must match Today.
- Avoided priority `Low` hides Low items.

The `Repeating items` filter is special. It is a filter-only sentinel
(`REPEATING_ITEMS_FILTER_VALUE`), not a normal date value and not a normal
encoded reminder time. It must stay separate in:

- Normalization.
- Counts and menu summaries.
- Preset save/update comparisons.
- Matching logic.
- Backup and restore.

## Sorting And Grouping

Sort modes:

- Newest.
- Oldest.
- A to Z.
- Priority.
- Date.

Group modes:

- None.
- Priority.
- Date.
- List.
- Status.

Global sort/group modes can be overridden by active list display settings or a
saved preset. List-specific modes live on list nodes. Subsection views can have
separate sort/group preferences from the parent list view.

## Reminders And Repeating Items

Reminder state is encoded in `src/reminders.ts`.

Supported repeat presets:

- None.
- Daily.
- Weekly.
- Monthly.
- Yearly.

Reminder values can represent:

- No reminder.
- Time only.
- Repeat only.
- Time plus repeat.

Android reminder scheduling lives in `src/todoAlarms.ts` and uses
`expo-notifications` plus the native exact-alarm capability bridge. Closed-app
reminders depend on Android exact alarm access. If exact alarms are unavailable,
the app should guide the user to Android settings instead of silently accepting
late reminders.

Notification taps should reveal the target todo by id. The reveal path should
adjust context enough to make the todo visible without corrupting the user's
saved filters.

## Undo And Recovery

Undo is meant to protect common accidental actions:

- Mark done.
- Delete.
- Settings/filter changes where undo is wired.
- List/preset changes where undo is wired.

Undo should be close to the mutation path. Do not bolt undo only onto one UI
button while another path mutates the same data without recovery.

Deleted todo recovery has two layers:

- Immediate undo toast for fast mistakes.
- Settings deleted-todo list for later restore or permanent delete.

Restoring a deleted todo should restore the todo data and make the restored item
visible or revealable in the current context.

## Persistence

Todo persistence:

- SQLite database: `local-todo.db`.
- Store API: `src/storage/todoStore.ts`.
- SQLite implementation: `src/storage/todoDatabase.ts`.
- FTS search table for search.
- Legacy AsyncStorage todo migration when the database is empty.

Settings persistence:

- AsyncStorage key: `local-todo.settings.v1`.
- Normalization: `normalizeAppSettings`.
- Save API: `appSettingsStore.save`.

Auth persistence:

- Google OAuth tokens are stored with SecureStore through
  `src/google/googleAuthStore.ts`.

Important persistence rule: if a behavior is user-customizable, it must survive
app restart and Drive restore. App UI, settings normalization, and backup
payload normalization must move together.

## Google Drive Backup And Restore

Drive backup logic lives in `src/google/driveBackup.ts`.

The app uses Google Drive `appDataFolder`, so backups are private to the app.
Backups include:

- Todos.
- App settings.
- Deleted todos.
- Filter state.
- List tree.
- Saved presets.
- Quick nav preset assignments.
- Quick nav icons.
- Filter colors.
- Meta tag visibility.
- Date label settings.
- Backup timestamps.

Backups do not include OAuth tokens.

Current backup behavior:

- 10 production backup slots.
- 10 test backup slots.
- Slot picker for backup.
- Slot picker for restore.
- Empty restore slots are disabled.
- Backing up to a filled slot replaces that slot.
- Automatic backup writes to slot 1.
- Legacy one-file and timestamped backups are still restorable through slot 1.

Production and test scopes use different basenames. Dev builds use a dev
production basename so local testing cannot overwrite installed production app
backup data.

Backup/restore must preserve list navbar visibility. `showInNavbar` is part of
the list tree and should round-trip through both production and test backups.

## Development Test Data

Development test data lives in `src/dev/seedTestTodos.ts`.

The dev seed is development-only. It creates sample customizable lists, saved
presets, and todos so filter/preset/navbar behavior can be tested quickly
without turning those examples into production defaults.

Seeded lists cover:

- Navbar-visible list shortcuts.
- One hidden navbar list.
- Nested list sections.
- List-specific icons.
- Hidden list search keywords.
- List-specific sort/group settings.

Seeded presets cover:

- List/status grouping.
- Today plus priority focus.
- Avoided-filter behavior.
- Repeating-item filtering.
- Hidden-list/backlog filtering.

Seeded todos cover:

- Multiple lists.
- Relative and absolute dates.
- Priorities.
- Reminder times.
- Repeat presets.
- Done state.
- Pinned state.
- One-list and multi-list assignments.

The dev Settings panel can add or clear this data. Clearing dev data should
remove only seeded lists, seeded presets, and seeded todos, not user-created
data.

## How The App Is Used

### Quick Capture

Use the create input to add a todo. If filters are active, creation should seed
from the remembered or current context. The app should avoid creating an item
that immediately disappears unless the reveal path intentionally moves the user
to it.

### Filtering Work

Use the bottom filter/calendar control or list/menu drawer to select dates,
lists, priorities, reminders, and repeat filters. Use required filters when a
view must always include a value. Use avoided filters when a view should hide a
value.

### Preset Work

Use saved presets for reusable views. A preset is not only a label; it stores
filters plus sort/group/list-order modes. Saved preset rows should open for
editing by default. Quick nav shortcuts apply quickly.

### List Work

Use Settings > Lists to create, rename, reorder, hide/show, and style lists.
Lists can be nested. List labels are shared across the tree, so duplicates
should be blocked across top-level and child lists.

### Search Work

Use search for todo text and note terms. Use hidden search keywords on presets
or lists when a concept should be discoverable by alternate words without
showing those words in normal UI.

### Reminder Work

Use reminder time and repeat controls in create/detail/edit flows. Android
closed-app reminders require exact alarm access. Alarm reconciliation should run
when todos change and when the app resumes.

### Backup Work

Use Settings > Backup for Google Drive backup/restore. Choose production slots
for real app snapshots and test slots for trial restores. Do not overwrite a
filled slot unless replacing that version is intentional.

## Architecture Responsibilities

### `App.tsx`

`App.tsx` currently orchestrates most app state and top-level UI. It owns:

- Loaded todo/settings state.
- Filter and menu state.
- Create/edit flows.
- Settings modal state.
- Undo state.
- Backup action wiring.
- Alarm reconciliation calls.
- Top-level rendering.

Because `App.tsx` is large, new work should move focused rendering or pure
domain logic into smaller files when it reduces real complexity.

### `src/components/TodoRow.tsx`

Renders todo rows and row-level interactions:

- Checkbox.
- Title/preview.
- Meta row.
- Swipe actions.
- Press/long-press behavior.
- Layout constraints for grouped and flat rows.

### `src/components/QuickPresetNav.tsx`

Renders quick navbar slots:

- Press to apply.
- Long press detail.
- Selected state.
- Empty/disabled slots.
- Accessibility labels.

It should not decide what a slot means. Slot meaning comes from `src/presets.ts`
and app settings.

### `src/components/FilterConfigScreen.tsx`

Renders filter, required/avoided, sort, group, and meta-tag controls. It should
keep filter semantics aligned with `App.tsx` matching logic and settings
persistence.

### Reminder Components

- `ReminderTimeModal.tsx`: reminder time modal.
- `ReminderTimeWheelPicker.tsx`: wheel-based time picker.
- `RepeatReminderModal.tsx`: reminder plus repeat editor.
- `RepeatPickerList.tsx`: repeat preset list.
- `InlineTimePicker.tsx`: inline time editing helper.

### Other Components

- `SimpleCalendarModal.tsx`: custom date picker.
- `TodoMetaTags.tsx`: row meta tag display.

### Domain Helpers

- `src/todos.ts`: todo model, normalization, filter cloning, text layout
  helpers.
- `src/reminders.ts`: reminder/repeat encoding and labels.
- `src/todoRecurrence.ts`: repeat date math.
- `src/todoAlarms.ts`: notification scheduling and reconciliation.
- `src/todoListRows.ts`: grouped/flat row construction.
- `src/todoOptions.ts`: sort/group/filter menu options.
- `src/filterColors.ts`: color storage and theme helpers.
- `src/metaTags.ts`: meta tag visibility.
- `src/presets.ts`: quick nav slot construction and list-to-preset bridging.
- `src/haptics.ts`: shared haptic helper.

### Storage Helpers

- `src/storage/appSettingsStore.ts`: settings schema, defaults, normalization,
  clone helpers, and AsyncStorage persistence.
- `src/storage/todoStore.ts`: public todo persistence API.
- `src/storage/todoDatabase.ts`: SQLite implementation and FTS.

### Google Helpers

- `src/google/googleAuthStore.ts`: SecureStore-backed auth token storage.
- `src/google/driveBackup.ts`: backup payload creation, Drive file listing,
  slot mapping, upload, download, and restore normalization.

## Important Behavioral Contracts

Preserve these contracts unless the product decision intentionally changes:

- Lists and presets are fully customizable.
- Quick nav is settings/list driven, not hardcoded.
- Settings `Navbar shortcuts` and bottom quick nav must use the same source.
- Saved preset rows open/edit by default.
- Quick nav shortcuts apply quickly.
- Values in the same filter family are OR.
- Different filter families layer together.
- `Repeating items` is a filter-only sentinel.
- Search keyword editing stays hidden behind long press.
- Create under filters should stay visible or reveal the created item.
- Delete should feel immediate.
- Undo should restore the same data.
- Backup must include app settings, not only todos.
- Drive restore must not drop quick nav, list visibility, search keywords, or
  preset data.
- Android reminder work must check exact-alarm capability.
- Haptics should be subtle and shared through the helper.
- Dirty worktrees may contain user changes; do not revert unrelated changes.

## Build And Verification

Common local checks:

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

Useful Android runtime checks:

```sh
adb logcat -c
adb shell monkey -p com.localtodo.app 1
adb logcat -d -t 1200 | rg -i "FATAL EXCEPTION|Unable to load script|ReactNativeJS|\\sE AndroidRuntime"
```

Use UIAutomator when checking accessibility-visible state:

```sh
adb shell uiautomator dump /sdcard/localtodo-window.xml
adb shell cat /sdcard/localtodo-window.xml
```

## Manual Test Checklist

Before shipping broad app changes, test:

- App starts from a production bundle.
- Create todo with no filters.
- Create todo while a list filter is active.
- Create todo while a saved/quick preset is active.
- Edit todo title and notes.
- Edit todo filters.
- Mark done and undo.
- Swipe delete and undo.
- Restore a deleted todo from Settings.
- Permanently delete a deleted todo.
- Search with one term and multiple terms.
- Search preset/list headers and hidden keywords.
- List filters.
- Date filters.
- Priority filters.
- Reminder filters.
- Repeating-items filter.
- Required filters.
- Avoided filters.
- Sort modes.
- Group modes.
- Collapse/expand grouped sections.
- Quick nav tap.
- Quick nav long press.
- Quick nav double tap for section toggle.
- Saved preset open/edit/update.
- Save a virtual list shortcut as a real preset.
- Settings list add.
- Settings list rename.
- Settings list hidden keyword edit.
- Settings list icon edit.
- Settings list pin/unpin in navbar.
- Settings list reorder.
- Settings list delete.
- Filter color edit.
- Date label display mode.
- Meta tag visibility.
- Completed item visibility.
- Reminder scheduling.
- Android exact-alarm warning path.
- Notification tap reveal.
- Production backup slot save.
- Production backup slot restore.
- Test backup slot save.
- Test backup slot restore.
- Legacy backup slot 1 visibility.
- Dev seed add.
- Dev seed clear.

## Refactoring Direction

The current app works through a large `App.tsx` orchestrator. Future cleanup
should be conservative and behavior-led:

- Move pure logic into `src/` helpers when the logic has no UI dependency.
- Move repeated or self-contained rendering into `src/components/`.
- Keep settings normalization and Drive normalization in sync.
- Prefer existing local helpers over new abstractions.
- Add comments only where they explain non-obvious behavior or important
  product contracts.
- Avoid broad visual rewrites while fixing behavioral bugs.

Good future extraction candidates:

- Settings section components.
- Saved preset editor/list components.
- Backup picker/status components.
- Create drawer state helpers.
- Undo action helpers.
- Preset matching/update helpers.
- Filter matching helpers.

Each extraction should preserve tests/checks and user-visible behavior first.
