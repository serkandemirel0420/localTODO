export type LockState = {
  ready: boolean;
  enabled: boolean;
  locked: boolean;
  busy: boolean;
  message: string;
};

export type LockServices = {
  load: () => Promise<boolean>;
  save: (enabled: boolean) => Promise<void>;
  available: () => Promise<boolean>;
  unavailableMessage?: () => string;
  authenticate: () => Promise<{ success: boolean; error?: string }>;
};

// Keep authentication and lifecycle races testable without a native UI.
export class BiometricLockController {
  state: LockState = { ready: false, enabled: false, locked: true, busy: false, message: '' };
  private listeners = new Set<(state: LockState) => void>();
  private active = true;
  private generation = 0;
  private authenticating = false;

  constructor(private services: LockServices) {}

  subscribe(listener: (state: LockState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }

  private update(patch: Partial<LockState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener(this.state));
  }

  async load() {
    if (this.state.busy) return;
    this.update({ busy: true, message: '' });
    try {
      const enabled = await this.services.load();
      this.update({ ready: true, enabled, locked: enabled, busy: false });
      if (enabled && this.active) await this.unlock();
    } catch {
      // A read failure must never silently disable a previously enabled lock.
      this.update({ busy: false, message: 'Could not read app lock settings. Try again.' });
    }
  }

  setActivity(next: string) {
    if (next === 'active') {
      const returning = !this.active;
      this.active = true;
      if (returning && this.state.ready && this.state.locked && !this.state.busy) {
        void this.unlock();
      }
      return;
    }
    // System biometric dialogs can temporarily make iOS inactive.
    if (next === 'inactive' && this.authenticating) return;
    this.active = false;
    // Android's device-credential fallback is a system activity. Keep its
    // authentication valid, but never grant access while we are backgrounded.
    if (!this.authenticating) this.generation += 1;
    if (this.state.enabled) this.update({ locked: true });
  }

  async unlock() {
    if (!this.state.ready || !this.state.enabled || this.state.busy || !this.active) return;
    await this.verify('unlock');
  }

  async toggle() {
    if (!this.state.ready || this.state.locked || this.state.busy || !this.active) return;
    await this.verify(this.state.enabled ? 'disable' : 'enable');
  }

  private async verify(action: 'unlock' | 'enable' | 'disable') {
    const generation = this.generation;
    this.update({ busy: true, message: '' });
    try {
      if (action === 'enable' && !await this.services.available()) {
        this.update({ message: this.services.unavailableMessage?.()
          ?? 'Set up fingerprint or face recognition in your device settings first.' });
        return;
      }
      if (generation !== this.generation || !this.active) return;
      this.authenticating = true;
      const result = await this.services.authenticate();
      this.authenticating = false;
      // Reject a late success after the user backgrounds the app.
      if (generation !== this.generation || !this.active) return;
      if (!result.success) {
        this.update({ message: result.error === 'user_cancel' || result.error === 'system_cancel'
          ? 'Authentication cancelled. Try again when ready.'
          : 'Could not verify your identity. Please try again.' });
        return;
      }
      if (action !== 'unlock') {
        const enabled = action === 'enable';
        await this.services.save(enabled);
        // Saving may finish after a background transition. Enabling still takes
        // effect, but access is only granted in the authenticated foreground.
        this.update({ enabled, locked: enabled && (generation !== this.generation || !this.active) });
      } else {
        this.update({ locked: false });
      }
    } catch {
      this.update({ message: 'App lock could not complete. Please try again.' });
    } finally {
      this.authenticating = false;
      this.update({ busy: false });
    }
  }
}
