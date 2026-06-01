import * as SecureStore from 'expo-secure-store';

import { APP_VARIANT } from '../appVariant';

const STORAGE_KEY = `local-todo.google-auth.${APP_VARIANT}.v1`;

export type StoredGoogleAuth = {
  accessToken: string;
  expiresIn?: number;
  idToken?: string;
  issuedAt: number;
  refreshToken?: string;
  scope?: string;
  tokenType?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const normalizeStoredGoogleAuth = (value: unknown): StoredGoogleAuth | null => {
  if (!isRecord(value) || typeof value.accessToken !== 'string') {
    return null;
  }

  return {
    accessToken: value.accessToken,
    expiresIn: typeof value.expiresIn === 'number' ? value.expiresIn : undefined,
    idToken: typeof value.idToken === 'string' ? value.idToken : undefined,
    issuedAt: typeof value.issuedAt === 'number' ? value.issuedAt : Math.floor(Date.now() / 1000),
    refreshToken: typeof value.refreshToken === 'string' ? value.refreshToken : undefined,
    scope: typeof value.scope === 'string' ? value.scope : undefined,
    tokenType: typeof value.tokenType === 'string' ? value.tokenType : undefined,
  };
};

export const googleAuthStore = {
  async clear() {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  },

  async load() {
    const stored = await SecureStore.getItemAsync(STORAGE_KEY);
    return stored ? normalizeStoredGoogleAuth(JSON.parse(stored) as unknown) : null;
  },

  async save(auth: StoredGoogleAuth) {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(normalizeStoredGoogleAuth(auth)));
  },
};
