const { app, BrowserWindow, shell } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');

const DEFAULT_PORT = Number(process.env.LOCAL_TODO_DESKTOP_PORT || 17873);

let server;
let serverUrl;
let mainWindow;

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'],
  ['.wasm', 'application/wasm'],
  ['.ttf', 'font/ttf'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ico', 'image/x-icon'],
]);

const getAppRoot = () => path.resolve(__dirname, '..');

const getDistRoot = () => {
  const distRoot = path.join(getAppRoot(), 'dist');
  if (!fs.existsSync(path.join(distRoot, 'index.html'))) {
    throw new Error(`Desktop bundle missing at ${distRoot}. Run npm run desktop:export first.`);
  }
  return distRoot;
};

const canOpenAuthWindow = (targetUrl) => {
  try {
    const parsedUrl = new URL(targetUrl);

    return (
      parsedUrl.protocol === 'https:' &&
      (
        parsedUrl.hostname === 'accounts.google.com' ||
        parsedUrl.hostname.endsWith('.accounts.google.com')
      )
    );
  } catch {
    return false;
  }
};

const isGoogleAuthCallbackUrl = (targetUrl) => {
  if (!serverUrl) {
    return false;
  }

  try {
    const parsedUrl = new URL(targetUrl);
    const appUrl = new URL(serverUrl);
    const params = new URLSearchParams(parsedUrl.search);
    const fragment = parsedUrl.hash.startsWith('#') ? parsedUrl.hash.slice(1) : parsedUrl.hash;
    new URLSearchParams(fragment).forEach((value, key) => {
      if (!params.has(key)) {
        params.set(key, value);
      }
    });

    return (
      parsedUrl.origin === appUrl.origin &&
      params.has('state') &&
      (
        params.has('access_token') ||
        params.has('code') ||
        params.has('error')
      )
    );
  } catch {
    return false;
  }
};

const sendGoogleAuthCallbackToMainWindow = (targetUrl, callbackWindow) => {
  if (!mainWindow || mainWindow.isDestroyed() || !isGoogleAuthCallbackUrl(targetUrl)) {
    return false;
  }

  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.executeJavaScript(
    `window.dispatchEvent(new CustomEvent('localtodo-google-auth-callback', { detail: { url: ${JSON.stringify(targetUrl)} } }));`,
    true,
  ).catch((error) => {
    console.error('Failed to deliver Google auth callback to Local Todo.', error);
  });

  if (callbackWindow && !callbackWindow.isDestroyed() && callbackWindow !== mainWindow) {
    setTimeout(() => {
      if (!callbackWindow.isDestroyed()) {
        callbackWindow.close();
      }
    }, 100);
  }

  return true;
};

const attachAuthWindowHandlers = (authWindow) => {
  const interceptAuthCallback = (event, targetUrl) => {
    if (sendGoogleAuthCallbackToMainWindow(targetUrl, authWindow)) {
      event?.preventDefault?.();
    }
  };

  authWindow.webContents.on('will-navigate', interceptAuthCallback);
  authWindow.webContents.on('will-redirect', interceptAuthCallback);
  authWindow.webContents.on('did-navigate', (_event, targetUrl) => {
    sendGoogleAuthCallbackToMainWindow(targetUrl, authWindow);
  });
  authWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (sendGoogleAuthCallbackToMainWindow(targetUrl, authWindow)) {
      return { action: 'deny' };
    }

    if (canOpenAuthWindow(targetUrl)) {
      return { action: 'allow' };
    }

    shell.openExternal(targetUrl);
    return { action: 'deny' };
  });
};

const sendFile = (response, filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    'Content-Type': mimeTypes.get(extension) || 'application/octet-stream',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    // Google OAuth needs popup opener access until the Electron wrapper relays
    // the final callback URL back to the main app window.
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  fs.createReadStream(filePath).pipe(response);
};

const startStaticServer = async () => {
  const distRoot = getDistRoot();

  server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    const decodedPath = decodeURIComponent(requestUrl.pathname);
    const cleanPath = decodedPath.replace(/^\/+/, '');
    const requestedPath = path.normalize(path.join(distRoot, cleanPath));
    const indexPath = path.join(distRoot, 'index.html');
    const isInsideDist = requestedPath === distRoot || requestedPath.startsWith(`${distRoot}${path.sep}`);
    const candidatePath = isInsideDist && fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()
      ? requestedPath
      : indexPath;

    sendFile(response, candidatePath);
  });

  const listen = (port) => new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve(server.address());
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });

  let address;
  try {
    address = await listen(DEFAULT_PORT);
  } catch (error) {
    if (error.code !== 'EADDRINUSE') {
      throw error;
    }
    address = await listen(0);
  }

  serverUrl = `http://127.0.0.1:${address.port}/`;
  return serverUrl;
};

const createWindow = async () => {
  const url = serverUrl || await startStaticServer();
  mainWindow = new BrowserWindow({
    width: 430,
    height: 900,
    center: true,
    show: false,
    minWidth: 360,
    minHeight: 640,
    title: 'Local Todo',
    backgroundColor: '#ffc400',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (sendGoogleAuthCallbackToMainWindow(targetUrl)) {
      return { action: 'deny' };
    }

    if (canOpenAuthWindow(targetUrl)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 720,
          title: 'Google sign in',
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      };
    }

    shell.openExternal(targetUrl);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-create-window', (authWindow, details) => {
    attachAuthWindowHandlers(authWindow);
    sendGoogleAuthCallbackToMainWindow(details.url, authWindow);
  });

  await mainWindow.loadURL(url);

  if (mainWindow && !mainWindow.isVisible()) {
    mainWindow.show();
    mainWindow.focus();
  }
};

app.setName('Local Todo');

app.whenReady().then(createWindow).catch((error) => {
  console.error(error);
  app.quit();
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch((error) => {
      console.error(error);
      app.quit();
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (server) {
    server.close();
  }
});
