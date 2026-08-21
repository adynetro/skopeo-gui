const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let win;

function setupMockIpc() {
  ipcMain.handle('system:get-info', async () => ({
    skopeoPath: '/opt/homebrew/bin/skopeo',
    skopeoVersion: 'skopeo version 1.17.0',
    isSkopeoInstalled: true,
    platform: 'darwin',
    arch: 'arm64'
  }));

  ipcMain.handle('creds:get-all', async () => [
    {
      id: 'docker-hub',
      name: 'Docker Hub (docker.io)',
      domain: 'docker.io',
      username: 'dockeruser',
      insecure: false,
      isAnonymous: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'quay-io',
      name: 'Quay.io (quay.io)',
      domain: 'quay.io',
      username: 'quayuser',
      insecure: false,
      isAnonymous: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'ghcr',
      name: 'GitHub Packages (ghcr.io)',
      domain: 'ghcr.io',
      username: 'developer',
      insecure: false,
      isAnonymous: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'gcr',
      name: 'Google Container Registry (gcr.io)',
      domain: 'gcr.io',
      username: '_json_key',
      insecure: false,
      isAnonymous: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ]);

  ipcMain.handle('creds:get-docker-info', async () => ({
    exists: true,
    path: '~/.docker/config.json',
    credsStore: 'desktop',
    credHelpers: {},
    registriesCount: 4,
    registriesList: ['docker.io', 'quay.io', 'ghcr.io', 'gcr.io'],
    helperAvailable: true,
    helperPath: '/usr/local/bin/docker-credential-desktop',
    rawAuthsCount: 0
  }));

  ipcMain.handle('cosign:get-keys', async () => [
    {
      id: 'key-1',
      name: 'Production Release Key (ECDSA P-256)',
      publicKey: '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...\n-----END PUBLIC KEY-----',
      algorithm: 'ECDSA_P256',
      createdAt: new Date().toISOString()
    },
    {
      id: 'key-2',
      name: 'Staging CI/CD Signing Key (Ed25519)',
      publicKey: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA...\n-----END PUBLIC KEY-----',
      algorithm: 'ED25519',
      createdAt: new Date().toISOString()
    }
  ]);

  ipcMain.handle('batch:status', async () => ({
    isRunning: false,
    config: null,
    items: [],
    completedCount: 0,
    failedCount: 0,
    totalCount: 0,
    overallProgress: 0,
    startTime: null,
    endTime: null
  }));
}

async function run() {
  await app.whenReady();
  setupMockIpc();

  win = new BrowserWindow({
    width: 1280,
    height: 840,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../dist-electron/preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  await win.loadFile(path.join(__dirname, '../dist/index.html'));
  await new Promise((r) => setTimeout(r, 1500));

  const outDir = path.join(__dirname, '../docs/screenshots');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // 1. Batch Transfer screenshot
  let img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, '01-batch-transfer.png'), img.toPNG());
  console.log('Saved 01-batch-transfer.png');

  // 2. Image Inspector
  await win.webContents.executeJavaScript(`
    (() => {
      const buttons = Array.from(document.querySelectorAll('aside button'));
      if (buttons[1]) buttons[1].click();
    })()
  `);
  await new Promise((r) => setTimeout(r, 600));
  img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, '02-image-inspector.png'), img.toPNG());
  console.log('Saved 02-image-inspector.png');

  // 3. Security & SBOM
  await win.webContents.executeJavaScript(`
    (() => {
      const buttons = Array.from(document.querySelectorAll('aside button'));
      if (buttons[2]) buttons[2].click();
    })()
  `);
  await new Promise((r) => setTimeout(r, 600));
  img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, '03-sbom-vulnerabilities.png'), img.toPNG());
  console.log('Saved 03-sbom-vulnerabilities.png');

  // 4. Cosign Signing & Keys
  await win.webContents.executeJavaScript(`
    (() => {
      const buttons = Array.from(document.querySelectorAll('aside button'));
      if (buttons[3]) buttons[3].click();
    })()
  `);
  await new Promise((r) => setTimeout(r, 600));
  img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, '04-cosign-manager.png'), img.toPNG());
  console.log('Saved 04-cosign-manager.png');

  // 5. Credential Vault
  await win.webContents.executeJavaScript(`
    (() => {
      const buttons = Array.from(document.querySelectorAll('aside button'));
      if (buttons[4]) buttons[4].click();
    })()
  `);
  await new Promise((r) => setTimeout(r, 600));
  img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, '05-credential-vault.png'), img.toPNG());
  console.log('Saved 05-credential-vault.png');

  app.quit();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
