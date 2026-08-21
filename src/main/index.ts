import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { SkopeoService } from './skopeo';
import { CredentialService } from './credentials';
import { BatchRunner } from './batchRunner';
import { VulnerabilityScanner } from './vulnerabilityScanner';
import { CosignService } from './cosign';
import { BatchMigrationConfig, RegistryCredential, TransportType } from '../types';


let mainWindow: BrowserWindow | null = null;

const skopeo = new SkopeoService();
const creds = new CredentialService();
const batchRunner = new BatchRunner(skopeo, creds);
const vulnScanner = new VulnerabilityScanner();
const cosign = new CosignService(skopeo);

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1080,
    minHeight: 720,
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

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

  // Credentials & Docker Config
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
    return skopeo.testConnection(cred);
  });


  ipcMain.handle('creds:get-docker-info', async () => {
    return creds.getDockerConfigInfo();
  });

  ipcMain.handle('creds:import-docker', async (_event, customPath?: string) => {
    return creds.importDockerConfig(customPath);
  });

  ipcMain.handle('creds:import-raw-docker', async (_event, rawJson: string) => {
    return creds.importFromRawJson(rawJson);
  });

  ipcMain.handle('creds:pick-and-import-docker-file', async () => {
    if (!mainWindow) return null;
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Docker Config or Kubernetes Secret File',
      filters: [
        { name: 'Docker / JSON Config', extensions: ['json', 'dockerconfigjson', 'txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (!res.canceled && res.filePaths.length > 0) {
      const selectedPath = res.filePaths[0];
      return creds.importDockerConfig(selectedPath);
    }
    return null;
  });

  ipcMain.handle('creds:export-docker-json', async () => {
    return creds.exportDockerConfig();
  });

  ipcMain.handle('creds:export-docker-file', async () => {
    if (!mainWindow) return null;
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Registry Vault to dockerconfig.json',
      defaultPath: 'dockerconfig.json',
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (!res.canceled && res.filePath) {
      const exported = creds.exportDockerConfig();
      fs.writeFileSync(res.filePath, exported.json, 'utf-8');
      return {
        success: true,
        filePath: res.filePath,
        registriesCount: exported.registriesCount,
      };
    }
    return null;
  });


  // Skopeo Operations
  ipcMain.handle('skopeo:inspect', async (_event, { imageRef, credId, insecure, platform }) => {
    const allCreds = creds.getAll();
    const cred = credId ? allCreds.find((c) => c.id === credId) : undefined;
    return skopeo.inspect(imageRef, cred, insecure, platform);
  });

  ipcMain.handle('skopeo:inspect-raw', async (_event, { imageRef, credId, insecure }) => {
    const allCreds = creds.getAll();
    const cred = credId ? allCreds.find((c) => c.id === credId) : undefined;
    return skopeo.inspectRaw(imageRef, cred, insecure);
  });

  ipcMain.handle('skopeo:inspect-sbom', async (_event, { imageRef, credId, insecure, platform }) => {
    const allCreds = creds.getAll();
    const cred = credId ? allCreds.find((c) => c.id === credId) : undefined;
    return skopeo.inspectSbom(imageRef, cred, insecure, platform);
  });

  ipcMain.handle('sbom:scan-vulns', async (_event, { imageRef, packages }) => {
    return vulnScanner.scanSbomPackages(imageRef, packages);
  });


  ipcMain.handle('reports:export-pdf', async (_event, { defaultFilename, htmlContent }) => {
    if (!mainWindow) return null;
    const saveRes = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Vulnerability Security Report to PDF',
      defaultPath: defaultFilename || 'vulnerability-report.pdf',
      filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
    });

    if (saveRes.canceled || !saveRes.filePath) {
      return null;
    }

    const printWin = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    try {
      await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
      const pdfBuffer = await printWin.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: {
          top: 0.3,
          bottom: 0.3,
          left: 0.3,
          right: 0.3,
        },
      });

      fs.writeFileSync(saveRes.filePath, pdfBuffer);
      return { success: true, filePath: saveRes.filePath };
    } finally {
      printWin.close();
    }
  });



  ipcMain.handle('skopeo:list-tags', async (_event, { imageRef, credId, insecure }) => {
    const allCreds = creds.getAll();
    const cred = credId ? allCreds.find((c) => c.id === credId) : undefined;
    return skopeo.listTags(imageRef, cred, insecure);
  });

  ipcMain.handle('skopeo:delete', async (_event, { imageRef, credId, insecure }) => {
    const allCreds = creds.getAll();
    const cred = credId ? allCreds.find((c) => c.id === credId) : undefined;
    return skopeo.delete(imageRef, cred, insecure);
  });

  ipcMain.handle('skopeo:batch-delete', async (_event, { imageRefs, credId, insecure }) => {
    const allCreds = creds.getAll();
    const cred = credId ? allCreds.find((c) => c.id === credId) : undefined;
    return skopeo.batchDelete(imageRefs, cred, insecure);
  });

  ipcMain.handle('skopeo:format-uri', async (_event, { transport, ref }: { transport: TransportType; ref: string }) => {
    return skopeo.formatImageUri(transport, ref);
  });

  // Cosign Operations
  ipcMain.handle('cosign:get-keys', async () => {
    return cosign.getAllKeys();
  });

  ipcMain.handle('cosign:generate-key', async (_event, { name, algorithm }) => {
    return cosign.generateKeyPair(name, algorithm);
  });

  ipcMain.handle('cosign:save-key', async (_event, key) => {
    return cosign.saveKey(key);
  });

  ipcMain.handle('cosign:delete-key', async (_event, id: string) => {
    return cosign.deleteKey(id);
  });

  ipcMain.handle('cosign:verify', async (_event, { imageRef, publicKeyPem, credId, insecure, platform }) => {
    const allCreds = creds.getAll();
    const cred = credId ? allCreds.find((c) => c.id === credId) : undefined;
    return cosign.verifySignature(imageRef, publicKeyPem, cred, insecure, platform);
  });

  ipcMain.handle('cosign:sign', async (_event, { imageRef, privateKeyPem, annotations, credId, insecure, platform }) => {
    const allCreds = creds.getAll();
    const cred = credId ? allCreds.find((c) => c.id === credId) : undefined;
    return cosign.signImage(imageRef, privateKeyPem, annotations, cred, insecure, platform);
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
