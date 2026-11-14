const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('localTodoBiometrics', {
  load: () => ipcRenderer.invoke('biometric-lock:load'),
  save: (enabled) => ipcRenderer.invoke('biometric-lock:save', enabled),
  available: () => ipcRenderer.invoke('biometric-lock:available'),
  authenticate: () => ipcRenderer.invoke('biometric-lock:authenticate'),
  onActivity: (listener) => {
    const handler = (_event, state) => listener(state);
    ipcRenderer.on('biometric-lock:activity', handler);
    return () => ipcRenderer.removeListener('biometric-lock:activity', handler);
  },
});
