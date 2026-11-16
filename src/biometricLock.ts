import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';
import type { LockServices } from './biometricLockController';

type DesktopBiometrics = {
  load: () => Promise<boolean>;
  save: (enabled: boolean) => Promise<void>;
  available: () => Promise<boolean>;
  authenticate: () => Promise<{ success: boolean; error?: string }>;
  onActivity: (listener: (state: string) => void) => () => void;
};

declare global {
  interface Window { localTodoBiometrics?: DesktopBiometrics }
}

const KEY = 'local-todo.biometric-lock.v1';
const GRACE_KEY = 'local-todo.biometric-grace-minutes.v1';
export const desktopBiometrics = () => (
  Platform.OS === 'web' && typeof window !== 'undefined' ? window.localTodoBiometrics : undefined
);

export const biometricLockServices: LockServices = {
  async loadGrace() {
    const value = Platform.OS === 'web' ? localStorage.getItem(GRACE_KEY) : await SecureStore.getItemAsync(GRACE_KEY);
    if (value === null) return 5;
    const minutes = Number(value);
    return Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440 ? minutes : 5;
  },
  async saveGrace(minutes) {
    if (Platform.OS === 'web') localStorage.setItem(GRACE_KEY, String(minutes));
    else await SecureStore.setItemAsync(GRACE_KEY, String(minutes), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
  },
  unavailableMessage: () => Platform.OS === 'web'
    ? desktopBiometrics()
      ? 'Touch ID is unavailable. Set up Touch ID on a supported Mac first.'
      : 'Biometric app lock requires the phone app or a Mac with Touch ID.'
    : 'Set up fingerprint or face recognition in your device settings first.',
  async load() {
    if (Platform.OS === 'web') return desktopBiometrics()?.load() ?? false;
    const stored = await SecureStore.getItemAsync(KEY);
    if (stored !== null && stored !== 'true' && stored !== 'false') throw new Error('Invalid lock setting');
    return stored === 'true';
  },
  async save(enabled) {
    if (Platform.OS === 'web') {
      const bridge = desktopBiometrics();
      if (!bridge) throw new Error('Biometrics unavailable');
      await bridge.save(enabled);
      return;
    }
    await SecureStore.setItemAsync(KEY, String(enabled), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },
  async available() {
    if (Platform.OS === 'web') return desktopBiometrics()?.available() ?? false;
    return await LocalAuthentication.hasHardwareAsync() && await LocalAuthentication.isEnrolledAsync();
  },
  async authenticate() {
    if (Platform.OS === 'web') {
      return desktopBiometrics()?.authenticate() ?? { success: false, error: 'not_available' };
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Local Todo',
      promptSubtitle: 'Use your fingerprint or face to continue',
      cancelLabel: 'Cancel',
      fallbackLabel: 'Use device passcode',
      disableDeviceFallback: false,
      requireConfirmation: false,
      // Include system-supported face unlock as well as fingerprint sensors.
      biometricsSecurityLevel: 'weak',
    });
    // The Android PIN activity can deliver its result just before our activity
    // resumes. Wait briefly for foreground before passing success to the gate.
    if (result.success && AppState.currentState !== 'active') {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => { subscription.remove(); resolve(); }, 1000);
        const subscription = AppState.addEventListener('change', (state) => {
          if (state === 'active') { clearTimeout(timer); subscription.remove(); resolve(); }
        });
        if (AppState.currentState === 'active') { clearTimeout(timer); subscription.remove(); resolve(); }
      });
    }
    return result;
  },
};
