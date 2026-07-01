import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  initializeAuth,
  linkWithCredential,
  signInAnonymously,
  signInWithCredential,
  type Auth,
  type Persistence,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  type Firestore,
  type FirestoreSettings,
} from 'firebase/firestore';
import { Platform } from 'react-native';

import type { StoredGoogleAuth } from '../google/googleAuthStore';

const FIREBASE_CONFIG = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
};
const FIREBASE_DATA_USER_ID = (process.env.EXPO_PUBLIC_FIREBASE_DATA_USER_ID ?? '')
  .trim()
  .replace(/\//g, '');

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let firestoreInstance: Firestore | null = null;
let firebaseUserPromise: Promise<User> | null = null;

export const isFirebaseConfigured = () => (
  Boolean(
    FIREBASE_CONFIG.apiKey &&
    FIREBASE_CONFIG.appId &&
    FIREBASE_CONFIG.authDomain &&
    FIREBASE_CONFIG.projectId,
  )
);

const getReactNativeAsyncStoragePersistence = (storage: typeof AsyncStorage): Persistence => {
  const ReactNativePersistence = class {
    static readonly type = 'LOCAL';

    readonly type = 'LOCAL';

    async _isAvailable() {
      try {
        await storage.setItem('firebase:storageAvailable', '1');
        await storage.removeItem('firebase:storageAvailable');
        return true;
      } catch {
        return false;
      }
    }

    async _set(key: string, value: unknown) {
      await storage.setItem(key, JSON.stringify(value));
    }

    async _get(key: string) {
      const value = await storage.getItem(key);
      return value ? JSON.parse(value) as unknown : null;
    }

    async _remove(key: string) {
      await storage.removeItem(key);
    }

    _addListener() {
      return undefined;
    }

    _removeListener() {
      return undefined;
    }
  };

  return ReactNativePersistence as unknown as Persistence;
};

export const getLocalTodoFirebaseApp = () => {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured.');
  }

  if (!appInstance) {
    appInstance = getApps().length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);
  }

  return appInstance;
};

export const getLocalTodoFirebaseAuth = () => {
  if (!authInstance) {
    const app = getLocalTodoFirebaseApp();

    if (Platform.OS === 'web') {
      authInstance = getAuth(app);
    } else {
      try {
        authInstance = initializeAuth(app, {
          persistence: getReactNativeAsyncStoragePersistence(AsyncStorage),
        });
      } catch {
        authInstance = getAuth(app);
      }
    }
  }

  return authInstance;
};

export const getLocalTodoFirestore = () => {
  if (!firestoreInstance) {
    const app = getLocalTodoFirebaseApp();
    const settings: FirestoreSettings = {
      ignoreUndefinedProperties: true,
      localCache: Platform.OS === 'web' ? persistentLocalCache() : memoryLocalCache(),
    };

    try {
      firestoreInstance = initializeFirestore(app, settings);
    } catch {
      firestoreInstance = getFirestore(app);
    }
  }

  return firestoreInstance;
};

export const getLocalTodoFirebaseUser = async () => {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured.');
  }

  const auth = getLocalTodoFirebaseAuth();
  if (auth.currentUser) {
    return auth.currentUser;
  }

  if (!firebaseUserPromise) {
    firebaseUserPromise = signInAnonymously(auth)
      .then((credential) => credential.user)
      .finally(() => {
        firebaseUserPromise = null;
      });
  }

  return firebaseUserPromise;
};

export const getLocalTodoFirebaseDataUserId = async () => {
  const user = await getLocalTodoFirebaseUser();
  return FIREBASE_DATA_USER_ID || user.uid;
};

export const hasLocalTodoFirebaseDataUserId = () => Boolean(FIREBASE_DATA_USER_ID);

export const linkStoredGoogleAuthToFirebase = async (storedAuth: StoredGoogleAuth) => {
  if (!storedAuth.idToken || !isFirebaseConfigured()) {
    return getLocalTodoFirebaseUser();
  }

  const auth = getLocalTodoFirebaseAuth();
  const currentUser = auth.currentUser ?? await getLocalTodoFirebaseUser();
  const credential = GoogleAuthProvider.credential(storedAuth.idToken, storedAuth.accessToken);

  try {
    if (currentUser.isAnonymous) {
      return (await linkWithCredential(currentUser, credential)).user;
    }

    return (await signInWithCredential(auth, credential)).user;
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';

    if (
      code === 'auth/credential-already-in-use' ||
      code === 'auth/account-exists-with-different-credential' ||
      code === 'auth/email-already-in-use'
    ) {
      return (await signInWithCredential(auth, credential)).user;
    }

    throw error;
  }
};
