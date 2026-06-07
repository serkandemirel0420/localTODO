import {
  cloneDeletedTodos,
  cloneTodoFilters,
  formatListLabel,
  normalizeDeletedTodos,
  normalizeTodo,
  normalizeTodoFilters,
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
  cloneQuickPresetNavPresetIds,
  ensureQuickPresetDefaults,
  normalizeFilterConfigUiState,
  normalizeQuickPresetNavPresetIds,
  type FilterConfigUiState,
  type QuickPresetNavPresetIds,
} from '../storage/appSettingsStore';
import { isDevAppVariant } from '../appVariant';

export const GOOGLE_DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const GOOGLE_AUTH_SCOPES = [GOOGLE_DRIVE_APPDATA_SCOPE];

const BACKUP_FILE_NAME = isDevAppVariant ? 'local-todo-dev-backup.json' : 'local-todo-backup.json';
const BACKUP_MIME_TYPE = 'application/json';

export type BackupListOrderMode = 'alphabetical' | 'manual';
export type BackupTodoGroupMode = 'date' | 'list' | 'none' | 'priority' | 'status';
export type BackupTodoSortMode = 'alphabetical' | 'date' | 'newest' | 'oldest' | 'priority';

export type BackupListMenuNode = {
  label: string;
  children?: BackupListMenuNode[];
  sortMode?: BackupTodoSortMode;
  groupMode?: BackupTodoGroupMode;
  subsectionSortMode?: BackupTodoSortMode;
  subsectionGroupMode?: BackupTodoGroupMode;
};

export type BackupMenuPreset = {
  id: string;
  label: string;
  filters: TodoFilters;
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
  quickPresetNavPresetIds: QuickPresetNavPresetIds;
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

export type DriveUploadResult = {
  file: DriveBackupFile;
  uploadedAt: string;
};

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

  return {
    label,
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
    filters: cloneTodoFilters(preset.filters),
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
        flattened.push({ label: item.label });
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

      return {
        id,
        label,
        filters: normalizeTodoFilters(item.filters),
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
      quickPresetNavPresetIds: cloneQuickPresetNavPresetIds(settings.quickPresetNavPresetIds),
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
  const quickPresetDefaults = ensureQuickPresetDefaults(
    normalizeBackupMenuPresets(settings.menuPresets),
    normalizeQuickPresetNavPresetIds(settings.quickPresetNavPresetIds),
    typeof settings.quickPresetDefaultsVersion === 'number'
      ? settings.quickPresetDefaultsVersion
      : 0,
  );

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
      quickPresetNavPresetIds: quickPresetDefaults.quickPresetNavPresetIds,
      selectedFilters: normalizeTodoFilters(settings.selectedFilters),
      showOverdueMetaTags: settings.showOverdueMetaTags !== false,
      todoGroupMode: normalizeBackupTodoGroupMode(settings.todoGroupMode),
      todoSortMode: normalizeBackupTodoSortMode(settings.todoSortMode),
    },
    todos,
  };
};

export const findDriveBackupFile = async (accessToken: string) => {
  const params = new URLSearchParams({
    fields: 'files(id,name,modifiedTime,size)',
    orderBy: 'modifiedTime desc',
    q: `name='${escapeDriveQueryString(BACKUP_FILE_NAME)}' and trashed=false`,
    spaces: 'appDataFolder',
  });
  const response = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    accessToken,
  );
  const parsed = (await response.json()) as unknown;

  if (!isRecord(parsed) || !Array.isArray(parsed.files)) {
    return null;
  }

  return parseDriveFile(parsed.files[0]);
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
): Promise<DriveUploadResult> => {
  const existingFile = await findDriveBackupFile(accessToken);
  const metadata = existingFile
    ? { mimeType: BACKUP_MIME_TYPE, name: BACKUP_FILE_NAME }
    : { mimeType: BACKUP_MIME_TYPE, name: BACKUP_FILE_NAME, parents: ['appDataFolder'] };
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

export const downloadDriveBackup = async (accessToken: string) => {
  const file = await findDriveBackupFile(accessToken);

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
