import {
  cloneTodoFilters,
  normalizeTodo,
  normalizeTodoFilters,
  type Todo,
  type TodoFilters,
} from '../todos';

export const GOOGLE_DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const GOOGLE_AUTH_SCOPES = [GOOGLE_DRIVE_APPDATA_SCOPE];

const BACKUP_FILE_NAME = 'local-todo-backup.json';
const BACKUP_MIME_TYPE = 'application/json';

export type BackupSettings = {
  googleDriveBackupEnabled: boolean;
  googleDriveLastBackupAt: string | null;
  googleDriveLastRestoreAt: string | null;
  selectedFilters: TodoFilters;
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
      googleDriveBackupEnabled: settings.googleDriveBackupEnabled,
      googleDriveLastBackupAt: exportedAt,
      googleDriveLastRestoreAt: settings.googleDriveLastRestoreAt,
      selectedFilters: cloneTodoFilters(settings.selectedFilters),
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

  return {
    app: 'localTODO',
    exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : new Date().toISOString(),
    schemaVersion: 1,
    settings: {
      googleDriveBackupEnabled: settings.googleDriveBackupEnabled === true,
      googleDriveLastBackupAt:
        typeof settings.googleDriveLastBackupAt === 'string' ? settings.googleDriveLastBackupAt : null,
      googleDriveLastRestoreAt:
        typeof settings.googleDriveLastRestoreAt === 'string' ? settings.googleDriveLastRestoreAt : null,
      selectedFilters: normalizeTodoFilters(settings.selectedFilters),
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
