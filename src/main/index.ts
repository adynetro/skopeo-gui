import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';
import { SkopeoService } from './skopeo';
import { CredentialService } from './credentials';
import { BatchRunner } from './batchRunner';
import { BatchMigrationConfig, RegistryCredential, TransportType } from '../types';

let mainWindow: BrowserWindow | null = null;

const skopeo = new SkopeoService();
const creds = new CredentialService();
const batchRunner = new BatchRunner(skopeo, creds);

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#0f0f1c',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    // mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Register IPC handlers
function registerIpc() {
  // System Info
  ipcMain.handle('system:get-info', async () => {
    const binInfo = await skopeo.findBinary();
    return {
      skopeoPath: binInfo.path,
      skopeoVersion: binInfo.version,
      isSkopeoInstalled: binInfo.isInstalled,
      platform: process.platform,
      arch: process.arch,
    };
  });

  ipcMain.handle('system:save-settings', async (_event, settings) => {
    if (settings.skopeoPath) {
      skopeo.setCustomPath(settings.skopeoPath);
    }
    return true;
  });

  // Credentials
  ipcMain.handle('creds:get-all', async () => {
    return creds.getAll();
  });

  ipcMain.handle('creds:save', async (_event, cred) => {
    return creds.save(cred);
  });

  ipcMain.handle('creds:delete', async (_event, id: string) => {
    return creds.delete(id);
  });

  ipcMain.handle('creds:test', async (_event, cred: RegistryCredential) => {
    try {
      const testImage = cred.domain === 'docker.io'
        ? 'docker://docker.io/library/alpine:latest'
        : `docker://${cred.domain}`;
      await skopeo.listTags(testImage, cred, cred.insecure);
      return { success: true, message: 'Authentication verified successfully!' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Authentication check failed' };
    }
  });

  ipcMain.handle('creds:import-docker', async () => {
    return creds.importDockerConfig();
  });

  // Skopeo Operations
  ipcMain.handle('skopeo:inspect', async (_event, { imageRef, credId, insecure }) => {
    const allCreds = creds.getAll();
    const cred = credId ? allCreds.find((c) => c.id === credId) : undefined;
    return skopeo.inspect(imageRef, cred, insecure);
  });

  ipcMain.handle('skopeo:list-tags', async (_event, { imageRef, credId, insecure }) => {
    const allCreds = creds.getAll();
    const cred = credId ? allCreds.find((c) => c.id === credId) : undefined;
    return skopeo.listTags(imageRef, cred, insecure);
  });

  ipcMain.handle('skopeo:format-uri', async (_event, { transport, ref }: { transport: TransportType; ref: string }) => {
    return skopeo.formatImageUri(transport, ref);
  });

  // Batch
  ipcMain.handle('batch:start', async (_event, config: BatchMigrationConfig) => {
    if (!mainWindow) throw new Error('Main window not found');
    return batchRunner.startMigration(config, mainWindow);
  });

  ipcMain.handle('batch:cancel', async () => {
    batchRunner.cancel();
    return true;
  });

  ipcMain.handle('batch:status', async () => {
    return batchRunner.getStatus();
  });
}

app.whenReady().then(async () => {
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
