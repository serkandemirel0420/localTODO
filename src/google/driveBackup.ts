import {
  cloneDeletedTodos,
  cloneTodoFilters,
  formatListLabel,
  normalizeDeletedTodos,
  normalizeTodo,
  normalizeTodoFilters,
  pruneTodoFilters,
  type DeletedTodo,
  type Todo,
  type TodoFilters,
} from '../todos';
import {
  cloneFilterColors,
  normalizeFilterColors,
  type FilterColorSettings,
} from '../filterColors';
import {
  type DateLabelDisplayMode,
} from '../dates';
import {
  cloneMetaTagVisibility,
  normalizeMetaTagVisibility,
  type MetaTagVisibility,
} from '../metaTags';
import {
  cloneFilterConfigUiState,
  cloneQuickPresetNavIconNames,
  cloneQuickPresetNavPresetIds,
  ensureQuickPresetDefaults,
  normalizeFilterConfigUiState,
  normalizeQuickPresetNavIconNames,
  normalizeQuickPresetNavPresetIds,
  type FilterConfigUiState,
  type QuickPresetNavIconNames,
  type QuickPresetNavPresetIds,
} from '../storage/appSettingsStore';
import { isDevAppVariant } from '../appVariant';

export const GOOGLE_DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const GOOGLE_AUTH_SCOPES = [GOOGLE_DRIVE_APPDATA_SCOPE];

const MAIN_BACKUP_FILE_BASENAME = isDevAppVariant ? 'local-todo-dev-backup' : 'local-todo-backup';
const TEST_BACKUP_FILE_BASENAME = 'local-todo-test-backup';
const BACKUP_MIME_TYPE = 'application/json';
export const DRIVE_BACKUP_SLOT_COUNT = 10;

export type BackupListOrderMode = 'alphabetical' | 'manual';
export type BackupTodoGroupMode = 'date' | 'list' | 'none' | 'priority' | 'status';
export type BackupTodoSortMode = 'alphabetical' | 'date' | 'newest' | 'oldest' | 'priority';

export type BackupListMenuNode = {
  label: string;
  iconName?: string;
  showInNavbar?: boolean;
  searchKeywords?: string;
  children?: BackupListMenuNode[];
  sortMode?: BackupTodoSortMode;
  groupMode?: BackupTodoGroupMode;
  subsectionSortMode?: BackupTodoSortMode;
  subsectionGroupMode?: BackupTodoGroupMode;
};

export type BackupMenuPreset = {
  id: string;
  label: string;
  searchKeywords?: string;
  filters: TodoFilters;
  requiredFilters: TodoFilters;
  avoidedFilters: TodoFilters;
  listOrderMode: BackupListOrderMode;
  todoGroupMode: BackupTodoGroupMode;
  todoSortMode: BackupTodoSortMode;
  createdAt: number;
};

export type BackupSettings = {
  collapsedTodoGroupIds: string[];
  dateLabelDisplayMode: DateLabelDisplayMode;
  deletedTodos: DeletedTodo[];
  filterConfigUiState: FilterConfigUiState;
  filterColors: FilterColorSettings;
  googleDriveBackupEnabled: boolean;
  googleDriveLastBackupAt: string | null;
  googleDriveLastRestoreAt: string | null;
  hideDoneTodos: boolean;
  lastCreateTodoFilters: TodoFilters;
  listMenuTree: BackupListMenuNode[];
  listOrderMode: BackupListOrderMode;
  menuPresets: BackupMenuPreset[];
  metaTagVisibility: MetaTagVisibility;
  quickPresetDefaultsVersion: number;
  quickPresetNavIconNames: QuickPresetNavIconNames;
  quickPresetNavPresetIds: QuickPresetNavPresetIds;
  avoidedFilters: TodoFilters;
  requiredFilters: TodoFilters;
  selectedFilters: TodoFilters;
  showOverdueMetaTags: boolean;
  todoGroupMode: BackupTodoGroupMode;
  todoSortMode: BackupTodoSortMode;
};

export type LocalTodoBackup = {
  app: 'localTODO';
  exportedAt: string;
  schemaVersion: 1;
  settings: BackupSettings;
  todos: Todo[];
};

export type DriveBackupFile = {
  id: string;
  modifiedTime?: string;
  name: string;
  size?: string;
};

export type DriveBackupSlot = {
  file: DriveBackupFile | null;
  slot: number;
};

export type DriveUploadResult = {
  file: DriveBackupFile;
  uploadedAt: string;
};

export type DriveBackupUploadTarget = {
  slot: DriveBackupSlot;
  type: 'slot';
};

export type DriveBackupScope = 'main' | 'test';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const normalizeBackupTodoGroupMode = (value: unknown): BackupTodoGroupMode => {
  if (
    value === 'date' ||
    value === 'list' ||
    value === 'priority' ||
    value === 'status'
  ) {
    return value;
  }

  return 'none';
};

const normalizeCollapsedTodoGroupIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
};

const normalizeBackupTodoSortMode = (value: unknown): BackupTodoSortMode => {
  if (
    value === 'alphabetical' ||
    value === 'date' ||
    value === 'newest' ||
    value === 'oldest' ||
    value === 'priority'
  ) {
    return value;
  }

  return 'newest';
};

const parseOptionalBackupTodoSortMode = (value: unknown): BackupTodoSortMode | undefined => {
  if (
    value === 'alphabetical' ||
    value === 'date' ||
    value === 'newest' ||
    value === 'oldest' ||
    value === 'priority'
  ) {
    return value;
  }

  return undefined;
};

const parseOptionalBackupTodoGroupMode = (value: unknown): BackupTodoGroupMode | undefined => {
  if (
    value === 'date' ||
    value === 'list' ||
    value === 'none' ||
    value === 'priority' ||
    value === 'status'
  ) {
    return value;
  }

  return undefined;
};

const normalizeBackupListMenuNode = (item: Record<string, unknown>): BackupListMenuNode | null => {
  if (typeof item.label !== 'string') {
    return null;
  }

  const label = formatListLabel(item.label);
  if (!label) {
    return null;
  }

  const children = Array.isArray(item.children)
    ? item.children
        .map((child) => (
          isRecord(child) ? normalizeBackupListMenuNode(child) : null
        ))
        .filter((child): child is BackupListMenuNode => Boolean(child))
    : [];

  const sortMode = parseOptionalBackupTodoSortMode(item.sortMode);
  const groupMode = parseOptionalBackupTodoGroupMode(item.groupMode);
  const subsectionSortMode = parseOptionalBackupTodoSortMode(item.subsectionSortMode);
  const subsectionGroupMode = parseOptionalBackupTodoGroupMode(item.subsectionGroupMode);
  const iconName = typeof item.iconName === 'string' && item.iconName.trim()
    ? item.iconName.trim()
    : undefined;
  const showInNavbar = item.showInNavbar === false ? false : undefined;
  const searchKeywords = typeof item.searchKeywords === 'string'
    ? item.searchKeywords.replace(/\s+/g, ' ').trim()
    : '';

  return {
    label,
    ...(iconName ? { iconName } : {}),
    ...(showInNavbar === false ? { showInNavbar: false } : {}),
    ...(searchKeywords ? { searchKeywords } : {}),
    ...(sortMode !== undefined ? { sortMode } : {}),
    ...(groupMode !== undefined ? { groupMode } : {}),
    ...(subsectionSortMode !== undefined ? { subsectionSortMode } : {}),
    ...(subsectionGroupMode !== undefined ? { subsectionGroupMode } : {}),
    children: children.length > 0 ? children : undefined,
  };
};

const cloneListMenuTree = (nodes: BackupListMenuNode[]): BackupListMenuNode[] =>
  nodes.map((node) => ({
    label: node.label,
    ...(node.iconName ? { iconName: node.iconName } : {}),
    ...(node.showInNavbar === false ? { showInNavbar: false } : {}),
    ...(node.searchKeywords ? { searchKeywords: node.searchKeywords } : {}),
    sortMode: node.sortMode,
    groupMode: node.groupMode,
    subsectionSortMode: node.subsectionSortMode,
    subsectionGroupMode: node.subsectionGroupMode,
    children: node.children ? cloneListMenuTree(node.children) : undefined,
  }));

const cloneMenuPresets = (presets: BackupMenuPreset[]): BackupMenuPreset[] =>
  presets.map((preset) => ({
    id: preset.id,
    label: preset.label,
    ...(preset.searchKeywords ? { searchKeywords: preset.searchKeywords } : {}),
    filters: cloneTodoFilters(preset.filters),
    requiredFilters: pruneTodoFilters(preset.requiredFilters, preset.filters),
    avoidedFilters: cloneTodoFilters(preset.avoidedFilters),
    listOrderMode: preset.listOrderMode,
    todoGroupMode: preset.todoGroupMode,
    todoSortMode: preset.todoSortMode,
    createdAt: preset.createdAt,
  }));

const flattenBackupListMenuTree = (nodes: BackupListMenuNode[]): BackupListMenuNode[] => {
  const seen = new Set<string>();
  const flattened: BackupListMenuNode[] = [];

  const walk = (items: BackupListMenuNode[]) => {
    for (const item of items) {
      const key = item.label.toLocaleLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        flattened.push({
          label: item.label,
          ...(item.iconName ? { iconName: item.iconName } : {}),
          ...(item.showInNavbar === false ? { showInNavbar: false } : {}),
          ...(item.searchKeywords ? { searchKeywords: item.searchKeywords } : {}),
        });
      }

      if (item.children?.length) {
        walk(item.children);
      }
    }
  };

  walk(nodes);
  return flattened;
};

const normalizeBackupListMenuTree = (value: unknown): BackupListMenuNode[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const nodes = value
    .map((item) => (isRecord(item) ? normalizeBackupListMenuNode(item) : null))
    .filter((item): item is BackupListMenuNode => Boolean(item));

  return nodes.length > 0 ? nodes : [];
};

const normalizeBackupMenuPresets = (value: unknown): BackupMenuPreset[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index): BackupMenuPreset | null => {
      if (!isRecord(item)) {
        return null;
      }

      const id = typeof item.id === 'string' && item.id.trim()
        ? item.id.trim()
        : `preset-${index + 1}`;
      const label = typeof item.label === 'string' && item.label.trim()
        ? item.label.trim()
        : `Preset ${index + 1}`;
      const createdAt = typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
        ? item.createdAt
        : 0;
      const searchKeywords = typeof item.searchKeywords === 'string'
        ? item.searchKeywords.replace(/\s+/g, ' ').trim()
        : '';
      const filters = normalizeTodoFilters(item.filters);

      return {
        id,
        label,
        ...(searchKeywords ? { searchKeywords } : {}),
        filters,
        requiredFilters: pruneTodoFilters(normalizeTodoFilters(item.requiredFilters), filters),
        avoidedFilters: normalizeTodoFilters(item.avoidedFilters),
        listOrderMode: item.listOrderMode === 'manual' ? 'manual' : 'alphabetical',
        todoGroupMode: normalizeBackupTodoGroupMode(item.todoGroupMode),
        todoSortMode: normalizeBackupTodoSortMode(item.todoSortMode),
        createdAt,
      };
    })
    .filter((item): item is BackupMenuPreset => Boolean(item));
};

const escapeDriveQueryString = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const readDriveError = async (response: Response) => {
  const text = await response.text();

  try {
    const parsed = JSON.parse(text) as unknown;
    if (
      isRecord(parsed) &&
      isRecord(parsed.error) &&
      typeof parsed.error.message === 'string'
    ) {
      return parsed.error.message;
    }
  } catch {
    // Fall through to raw text.
  }

  return text || `Google Drive request failed with status ${response.status}`;
};

const driveFetch = async (url: string, accessToken: string, init: RequestInit = {}) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(await readDriveError(response));
  }

  return response;
};

const parseDriveFile = (value: unknown): DriveBackupFile | null => {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') {
    return null;
  }

  return {
    id: value.id,
    modifiedTime: typeof value.modifiedTime === 'string' ? value.modifiedTime : undefined,
    name: value.name,
    size: typeof value.size === 'string' ? value.size : undefined,
  };
};

const getBackupFileBasename = (scope: DriveBackupScope) =>
  scope === 'test' ? TEST_BACKUP_FILE_BASENAME : MAIN_BACKUP_FILE_BASENAME;

const padBackupSlot = (slot: number) => String(slot).padStart(2, '0');

const normalizeBackupSlot = (slot: number) => (
  Number.isInteger(slot) && slot >= 1 && slot <= DRIVE_BACKUP_SLOT_COUNT ? slot : 1
);

const getLegacyBackupFileName = (scope: DriveBackupScope) => `${getBackupFileBasename(scope)}.json`;

const getLegacyBackupFileNamePrefix = (scope: DriveBackupScope) =>
  `${getBackupFileBasename(scope)}-`;

const getBackupSlotFileName = (scope: DriveBackupScope, slot: number) =>
  `${getBackupFileBasename(scope)}-slot-${padBackupSlot(normalizeBackupSlot(slot))}.json`;

const parseBackupSlotFromFileName = (fileName: string, scope: DriveBackupScope) => {
  const escapedBasename = getBackupFileBasename(scope).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escapedBasename}-slot-(\\d{2})\\.json$`).exec(fileName);
  if (!match) {
    return null;
  }

  const slot = Number(match[1]);
  return Number.isInteger(slot) && slot >= 1 && slot <= DRIVE_BACKUP_SLOT_COUNT ? slot : null;
};

export const createBackupPayload = (
  todos: Todo[],
  settings: BackupSettings,
): LocalTodoBackup => {
  const exportedAt = new Date().toISOString();

  return {
    app: 'localTODO',
    exportedAt,
    schemaVersion: 1,
    settings: {
      collapsedTodoGroupIds: [...settings.collapsedTodoGroupIds],
      dateLabelDisplayMode: settings.dateLabelDisplayMode,
      deletedTodos: cloneDeletedTodos(settings.deletedTodos),
      filterConfigUiState: cloneFilterConfigUiState(settings.filterConfigUiState),
      filterColors: cloneFilterColors(settings.filterColors),
      googleDriveBackupEnabled: settings.googleDriveBackupEnabled,
      googleDriveLastBackupAt: exportedAt,
      googleDriveLastRestoreAt: settings.googleDriveLastRestoreAt,
      hideDoneTodos: settings.hideDoneTodos,
      lastCreateTodoFilters: cloneTodoFilters(settings.lastCreateTodoFilters),
      listMenuTree: cloneListMenuTree(settings.listMenuTree),
      listOrderMode: settings.listOrderMode,
      menuPresets: cloneMenuPresets(settings.menuPresets),
      metaTagVisibility: cloneMetaTagVisibility(settings.metaTagVisibility),
      quickPresetDefaultsVersion: settings.quickPresetDefaultsVersion,
      quickPresetNavIconNames: cloneQuickPresetNavIconNames(settings.quickPresetNavIconNames),
      quickPresetNavPresetIds: cloneQuickPresetNavPresetIds(settings.quickPresetNavPresetIds),
      avoidedFilters: cloneTodoFilters(settings.avoidedFilters),
      requiredFilters: pruneTodoFilters(settings.requiredFilters, settings.selectedFilters),
      selectedFilters: cloneTodoFilters(settings.selectedFilters),
      showOverdueMetaTags: settings.showOverdueMetaTags,
      todoGroupMode: settings.todoGroupMode,
      todoSortMode: settings.todoSortMode,
    },
    todos,
  };
};

export const normalizeBackupPayload = (value: unknown): LocalTodoBackup | null => {
  if (!isRecord(value) || !Array.isArray(value.todos)) {
    return null;
  }

  const todos = value.todos.map(normalizeTodo).filter((todo): todo is Todo => Boolean(todo));
  const settings = isRecord(value.settings) ? value.settings : {};
  const normalizedQuickPresetNavPresetIds = normalizeQuickPresetNavPresetIds(
    settings.quickPresetNavPresetIds,
  );
  const quickPresetDefaults = ensureQuickPresetDefaults(
    normalizeBackupMenuPresets(settings.menuPresets),
    normalizedQuickPresetNavPresetIds,
    normalizeQuickPresetNavIconNames(
      settings.quickPresetNavIconNames,
      normalizedQuickPresetNavPresetIds.length || undefined,
    ),
    typeof settings.quickPresetDefaultsVersion === 'number'
      ? settings.quickPresetDefaultsVersion
      : 0,
  );
  const selectedFilters = normalizeTodoFilters(settings.selectedFilters);

  return {
    app: 'localTODO',
    exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : new Date().toISOString(),
    schemaVersion: 1,
    settings: {
      collapsedTodoGroupIds: normalizeCollapsedTodoGroupIds(settings.collapsedTodoGroupIds),
      dateLabelDisplayMode: settings.dateLabelDisplayMode === 'remaining' ? 'remaining' : 'exact',
      deletedTodos: normalizeDeletedTodos(settings.deletedTodos),
      filterConfigUiState: normalizeFilterConfigUiState(settings.filterConfigUiState),
      filterColors: normalizeFilterColors(settings.filterColors),
      googleDriveBackupEnabled: settings.googleDriveBackupEnabled === true,
      googleDriveLastBackupAt:
        typeof settings.googleDriveLastBackupAt === 'string' ? settings.googleDriveLastBackupAt : null,
      googleDriveLastRestoreAt:
        typeof settings.googleDriveLastRestoreAt === 'string' ? settings.googleDriveLastRestoreAt : null,
      hideDoneTodos: settings.hideDoneTodos === true,
      lastCreateTodoFilters: normalizeTodoFilters(settings.lastCreateTodoFilters),
      listMenuTree: normalizeBackupListMenuTree(settings.listMenuTree),
      listOrderMode: settings.listOrderMode === 'manual' ? 'manual' : 'alphabetical',
      menuPresets: quickPresetDefaults.menuPresets,
      metaTagVisibility: normalizeMetaTagVisibility(settings.metaTagVisibility),
      quickPresetDefaultsVersion: quickPresetDefaults.quickPresetDefaultsVersion,
      quickPresetNavIconNames: quickPresetDefaults.quickPresetNavIconNames,
      quickPresetNavPresetIds: quickPresetDefaults.quickPresetNavPresetIds,
      avoidedFilters: normalizeTodoFilters(settings.avoidedFilters),
      requiredFilters: pruneTodoFilters(normalizeTodoFilters(settings.requiredFilters), selectedFilters),
      selectedFilters,
      showOverdueMetaTags: settings.showOverdueMetaTags !== false,
      todoGroupMode: normalizeBackupTodoGroupMode(settings.todoGroupMode),
      todoSortMode: normalizeBackupTodoSortMode(settings.todoSortMode),
    },
    todos,
  };
};

export const listDriveBackupFiles = async (
  accessToken: string,
  scope: DriveBackupScope = 'main',
) => {
  const files: DriveBackupFile[] = [];
  let pageToken: string | undefined;
  const legacyBackupFileName = getLegacyBackupFileName(scope);
  const legacyBackupFileNamePrefix = getLegacyBackupFileNamePrefix(scope);
  const slotBackupFileNamePrefix = `${getBackupFileBasename(scope)}-slot-`;

  do {
    const params = new URLSearchParams({
      fields: 'nextPageToken,files(id,name,modifiedTime,size)',
      orderBy: 'modifiedTime desc',
      pageSize: '100',
      q: [
        '(',
        `name='${escapeDriveQueryString(legacyBackupFileName)}'`,
        ' or ',
        `name contains '${escapeDriveQueryString(legacyBackupFileNamePrefix)}'`,
        ' or ',
        `name contains '${escapeDriveQueryString(slotBackupFileNamePrefix)}'`,
        ') and trashed=false',
      ].join(''),
      spaces: 'appDataFolder',
    });

    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const response = await driveFetch(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
      accessToken,
    );
    const parsed = (await response.json()) as unknown;

    if (!isRecord(parsed) || !Array.isArray(parsed.files)) {
      return files;
    }

    parsed.files
      .map(parseDriveFile)
      .filter((file): file is DriveBackupFile => Boolean(file))
      .filter((file) => (
        file.name === legacyBackupFileName ||
        file.name.startsWith(legacyBackupFileNamePrefix) ||
        file.name.startsWith(slotBackupFileNamePrefix)
      ))
      .forEach((file) => {
        files.push(file);
      });

    pageToken = typeof parsed.nextPageToken === 'string' ? parsed.nextPageToken : undefined;
  } while (pageToken);

  return files;
};

export const listDriveBackupSlots = async (
  accessToken: string,
  scope: DriveBackupScope = 'main',
): Promise<DriveBackupSlot[]> => {
  const files = await listDriveBackupFiles(accessToken, scope);
  const filesBySlot = new Map<number, DriveBackupFile>();
  let newestLegacyFile: DriveBackupFile | null = null;

  files.forEach((file) => {
    const slot = parseBackupSlotFromFileName(file.name, scope);
    if (slot) {
      filesBySlot.set(slot, file);
      return;
    }

    if (!newestLegacyFile) {
      newestLegacyFile = file;
    }
  });

  // Older app versions had one rolling backup or timestamped backups. Show the
  // newest legacy file in slot 1 so users can still restore it after upgrading.
  if (!filesBySlot.has(1) && newestLegacyFile) {
    filesBySlot.set(1, newestLegacyFile);
  }

  return Array.from({ length: DRIVE_BACKUP_SLOT_COUNT }, (_, index) => {
    const slot = index + 1;
    return {
      file: filesBySlot.get(slot) ?? null,
      slot,
    };
  });
};

export const findDriveBackupFile = async (
  accessToken: string,
  scope: DriveBackupScope = 'main',
) => {
  const slots = await listDriveBackupSlots(accessToken, scope);
  const firstFilledSlot = slots.find((slot) => slot.file);

  return firstFilledSlot?.file ?? null;
};

const createMultipartBody = (metadata: Record<string, unknown>, payload: LocalTodoBackup) => {
  const boundary = `localtodo-${Date.now().toString(36)}`;
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${BACKUP_MIME_TYPE}; charset=UTF-8`,
    '',
    JSON.stringify(payload),
    `--${boundary}--`,
    '',
  ].join('\r\n');

  return { body, boundary };
};

export const uploadDriveBackup = async (
  accessToken: string,
  payload: LocalTodoBackup,
  target?: DriveBackupUploadTarget,
  scope: DriveBackupScope = 'main',
): Promise<DriveUploadResult> => {
  const targetSlot = target?.slot.slot ?? 1;
  const existingFile = target
    ? target.slot.file
    : (await listDriveBackupSlots(accessToken, scope))[targetSlot - 1]?.file ?? null;
  const backupFileName = getBackupSlotFileName(scope, targetSlot);
  const metadata = existingFile
    ? { mimeType: BACKUP_MIME_TYPE, name: backupFileName }
    : { mimeType: BACKUP_MIME_TYPE, name: backupFileName, parents: ['appDataFolder'] };
  const { body, boundary } = createMultipartBody(metadata, payload);
  const params = new URLSearchParams({
    fields: 'id,name,modifiedTime,size',
    uploadType: 'multipart',
  });
  const url = existingFile
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?${params.toString()}`
    : `https://www.googleapis.com/upload/drive/v3/files?${params.toString()}`;
  const response = await driveFetch(url, accessToken, {
    body,
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    method: existingFile ? 'PATCH' : 'POST',
  });
  const file = parseDriveFile((await response.json()) as unknown);

  if (!file) {
    throw new Error('Google Drive returned an invalid backup file response.');
  }

  return {
    file,
    uploadedAt: payload.exportedAt,
  };
};

export const downloadDriveBackup = async (
  accessToken: string,
  backupFile?: DriveBackupFile,
  scope: DriveBackupScope = 'main',
) => {
  const file = backupFile ?? await findDriveBackupFile(accessToken, scope);

  if (!file) {
    return null;
  }

  const response = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
    accessToken,
  );
  const payload = normalizeBackupPayload((await response.json()) as unknown);

  if (!payload) {
    throw new Error('Google Drive backup file is not a valid Local Todo backup.');
  }

  return {
    file,
    payload,
  };
};
