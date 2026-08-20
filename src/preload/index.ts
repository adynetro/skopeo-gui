import { contextBridge, ipcRenderer } from 'electron';
import { BatchItem, BatchMigrationConfig, ImageInspection, LogEntry, RegistryCredential, SbomInspection, TransportType } from '../types';

export const skopeoApi = {
  // System & Binary
  getSystemInfo: () => ipcRenderer.invoke('system:get-info'),
  saveSettings: (settings: any) => ipcRenderer.invoke('system:save-settings', settings),

  // Credentials & Docker Config
  getCredentials: () => ipcRenderer.invoke('creds:get-all'),
  saveCredential: (cred: any) => ipcRenderer.invoke('creds:save', cred),
  deleteCredential: (id: string) => ipcRenderer.invoke('creds:delete', id),
  testCredential: (cred: RegistryCredential) => ipcRenderer.invoke('creds:test', cred),
  getDockerConfigInfo: () => ipcRenderer.invoke('creds:get-docker-info'),
  importDockerConfig: (customPath?: string) => ipcRenderer.invoke('creds:import-docker', customPath),
  importRawDockerConfig: (rawJson: string) => ipcRenderer.invoke('creds:import-raw-docker', rawJson),
  pickAndImportDockerFile: () => ipcRenderer.invoke('creds:pick-and-import-docker-file'),
  exportDockerConfigJson: () => ipcRenderer.invoke('creds:export-docker-json'),
  exportDockerConfigFile: () => ipcRenderer.invoke('creds:export-docker-file'),


  // Skopeo Operations
  inspectImage: (imageRef: string, credId?: string, insecure?: boolean, platform?: { os?: string; arch?: string; variant?: string }) =>
    ipcRenderer.invoke('skopeo:inspect', { imageRef, credId, insecure, platform }),
  inspectSbom: (imageRef: string, credId?: string, insecure?: boolean, platform?: { os?: string; arch?: string; variant?: string }) =>
    ipcRenderer.invoke('skopeo:inspect-sbom', { imageRef, credId, insecure, platform }),
  scanSbomVulnerabilities: (imageRef: string, packages: any[]) =>
    ipcRenderer.invoke('sbom:scan-vulns', { imageRef, packages }),
  inspectRaw: (imageRef: string, credId?: string, insecure?: boolean) =>
    ipcRenderer.invoke('skopeo:inspect-raw', { imageRef, credId, insecure }),
  listTags: (imageRef: string, credId?: string, insecure?: boolean) =>
    ipcRenderer.invoke('skopeo:list-tags', { imageRef, credId, insecure }),
  deleteImage: (imageRef: string, credId?: string, insecure?: boolean) =>
    ipcRenderer.invoke('skopeo:delete', { imageRef, credId, insecure }),
  batchDeleteImages: (imageRefs: string[], credId?: string, insecure?: boolean) =>
    ipcRenderer.invoke('skopeo:batch-delete', { imageRefs, credId, insecure }),
  formatUri: (transport: TransportType, ref: string) =>
    ipcRenderer.invoke('skopeo:format-uri', { transport, ref }),

  // Cosign Operations
  getCosignKeys: () => ipcRenderer.invoke('cosign:get-keys'),
  generateCosignKeyPair: (name?: string, algorithm?: string) =>
    ipcRenderer.invoke('cosign:generate-key', { name, algorithm }),
  saveCosignKey: (key: any) => ipcRenderer.invoke('cosign:save-key', key),
  deleteCosignKey: (id: string) => ipcRenderer.invoke('cosign:delete-key', id),
  verifyCosignSignature: (imageRef: string, publicKeyPem?: string, credId?: string, insecure?: boolean, platform?: { os?: string; arch?: string; variant?: string }) =>
    ipcRenderer.invoke('cosign:verify', { imageRef, publicKeyPem, credId, insecure, platform }),
  signCosignImage: (imageRef: string, privateKeyPem: string, annotations?: Record<string, string>, credId?: string, insecure?: boolean, platform?: { os?: string; arch?: string; variant?: string }) =>
    ipcRenderer.invoke('cosign:sign', { imageRef, privateKeyPem, annotations, credId, insecure, platform }),

  // Batch Migration
  startBatchMigration: (config: BatchMigrationConfig) =>
    ipcRenderer.invoke('batch:start', config),
  cancelBatchMigration: () => ipcRenderer.invoke('batch:cancel'),
  getBatchStatus: () => ipcRenderer.invoke('batch:status'),

  // Listeners
  onBatchItemUpdate: (callback: (item: BatchItem) => void) => {
    const handler = (_event: any, item: BatchItem) => callback(item);
    ipcRenderer.on('batch:item-update', handler);
    return () => ipcRenderer.removeListener('batch:item-update', handler);
  },
  onLogEntry: (callback: (log: LogEntry) => void) => {
    const handler = (_event: any, log: LogEntry) => callback(log);
    ipcRenderer.on('log:entry', handler);
    return () => ipcRenderer.removeListener('log:entry', handler);
  },
};

contextBridge.exposeInMainWorld('skopeoApi', skopeoApi);
