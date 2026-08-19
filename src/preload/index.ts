import { contextBridge, ipcRenderer } from 'electron';
import { BatchItem, BatchMigrationConfig, ImageInspection, LogEntry, RegistryCredential, TransportType } from '../types';

export const skopeoApi = {
  // System & Binary
  getSystemInfo: () => ipcRenderer.invoke('system:get-info'),
  saveSettings: (settings: any) => ipcRenderer.invoke('system:save-settings', settings),

  // Credentials
  getCredentials: () => ipcRenderer.invoke('creds:get-all'),
  saveCredential: (cred: any) => ipcRenderer.invoke('creds:save', cred),
  deleteCredential: (id: string) => ipcRenderer.invoke('creds:delete', id),
  testCredential: (cred: RegistryCredential) => ipcRenderer.invoke('creds:test', cred),
  importDockerConfig: () => ipcRenderer.invoke('creds:import-docker'),

  // Skopeo Operations
  inspectImage: (imageRef: string, credId?: string, insecure?: boolean) =>
    ipcRenderer.invoke('skopeo:inspect', { imageRef, credId, insecure }),
  listTags: (imageRef: string, credId?: string, insecure?: boolean) =>
    ipcRenderer.invoke('skopeo:list-tags', { imageRef, credId, insecure }),
  formatUri: (transport: TransportType, ref: string) =>
    ipcRenderer.invoke('skopeo:format-uri', { transport, ref }),

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
