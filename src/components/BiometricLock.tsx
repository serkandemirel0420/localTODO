import React, { createContext, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, Platform, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BiometricLockController, type LockState } from '../biometricLockController';
import { biometricLockServices, desktopBiometrics } from '../biometricLock';

const LockContext = createContext<{ state: LockState; controller: BiometricLockController } | null>(null);

export function BiometricLockProvider({ children }: { children: React.ReactNode }) {
  const [controller] = useState(() => new BiometricLockController(biometricLockServices));
  const [state, setState] = useState(controller.state);
  useEffect(() => {
    const unsubscribe = controller.subscribe(setState);
    controller.setActivity(AppState.currentState ?? 'active');
    void controller.load();
    const subscription = Platform.OS !== 'web'
      ? AppState.addEventListener('change', (next) => controller.setActivity(next)) : null;
    const bridge = desktopBiometrics();
    const unsubscribeDesktop = bridge?.onActivity((next) => controller.setActivity(next));
    const onVisibility = () => controller.setActivity(document.hidden ? 'background' : 'active');
    if (Platform.OS === 'web' && !bridge) document.addEventListener('visibilitychange', onVisibility);
    return () => {
      unsubscribe();
      subscription?.remove();
      unsubscribeDesktop?.();
      if (Platform.OS === 'web' && !bridge) document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [controller]);

  return <LockContext.Provider value={{ state, controller }}>{children}</LockContext.Provider>;
}

export function useBiometricLock() {
  const lock = useContext(LockContext);
  if (!lock) throw new Error('Missing biometric lock provider');
  return lock;
}

export function BiometricLockScreen() {
  const { state, controller } = useBiometricLock();
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []);
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Ionicons name="lock-closed-outline" size={48} color="#302820" />
        <Text style={styles.title}>{state.ready ? 'Local Todo is locked' : 'Local Todo'}</Text>
        <Text style={styles.subtitle}>{state.ready ? 'Unlock with your fingerprint or face.' : 'Checking app lock…'}</Text>
        {state.message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{state.message}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Unlock Local Todo"
          disabled={state.busy} style={[styles.button, state.busy && styles.disabled]}
          onPress={() => { void (state.ready ? controller.unlock() : controller.load()); }}>
          {state.busy ? <ActivityIndicator color="#302820" /> : <Text style={styles.buttonText}>{state.ready ? 'Unlock' : 'Retry'}</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export function BiometricLockSetting() {
  const { state, controller } = useBiometricLock();
  return (
    <View style={styles.setting}>
      <View style={styles.row}>
        <View style={styles.settingText}>
          <Text style={styles.settingTitle}>Fingerprint / Face lock</Text>
          <Text style={styles.settingSubtitle}>Require unlocking when opening the app.</Text>
        </View>
        <Pressable accessibilityRole="switch" accessibilityLabel="Fingerprint / Face lock"
          accessibilityState={{ checked: state.enabled, disabled: state.busy }}
          disabled={state.busy} onPress={() => { void controller.toggle(); }}
          style={[styles.toggle, state.enabled && styles.toggleEnabled, state.busy && styles.disabled]}>
          <Text style={styles.buttonText}>{state.busy ? '…' : state.enabled ? 'On' : 'Off'}</Text>
        </Pressable>
      </View>
      <Text style={styles.settingSubtitle}>
        {Platform.OS === 'web'
          ? desktopBiometrics() ? 'Uses Touch ID on supported Macs.' : 'Available in the phone app and on Macs with Touch ID.'
          : 'Uses the biometrics set up on this device, with device passcode as a fallback.'}
      </Text>
      {state.message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{state.message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFF9EE' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  title: { fontSize: 24, color: '#302820' },
  subtitle: { fontSize: 15, color: '#71685E', textAlign: 'center' },
  message: { fontSize: 13, color: '#9C4932', marginTop: 8 },
  button: { backgroundColor: '#FFC400', borderRadius: 20, minWidth: 160, minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonText: { color: '#302820', fontSize: 15 },
  disabled: { opacity: 0.55 },
  setting: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E4DED6', borderRadius: 18, padding: 14, marginBottom: 18, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  settingText: { flex: 1 },
  settingTitle: { fontSize: 16, color: '#302820', marginBottom: 4 },
  settingSubtitle: { fontSize: 13, color: '#71685E', lineHeight: 18 },
  toggle: { borderRadius: 18, minWidth: 58, minHeight: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0EBE4' },
  toggleEnabled: { backgroundColor: '#FFC400' },
});
