import React, { useState, useEffect } from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar, TabType } from './components/Sidebar';
import { BatchTransfer } from './components/BatchTransfer';
import { SingleTransfer } from './components/SingleTransfer';
import { ImageInspector } from './components/ImageInspector';
import { CredentialManager } from './components/CredentialManager';
import { TerminalLogs } from './components/TerminalLogs';
import { SettingsModal } from './components/SettingsModal';
import { AppSettings, BatchItem, BatchMigrationConfig, LogEntry, RegistryCredential } from '../../types';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('batch');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [credentials, setCredentials] = useState<RegistryCredential[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; success: boolean } | null>(null);

  // Batch migration state
  const [activeBatchItems, setActiveBatchItems] = useState<BatchItem[]>([]);
  const [isBatchRunning, setIsBatchRunning] = useState(false);

  const showToast = (message: string, success: boolean = true) => {
    setToast({ message, success });
    setTimeout(() => setToast(null), 3500);
  };

  const loadInitialData = async () => {
    try {
      if ((window as any).skopeoApi) {
        const sysInfo = await (window as any).skopeoApi.getSystemInfo();
        setSettings({
          skopeoPath: sysInfo.skopeoPath,
          skopeoVersion: sysInfo.skopeoVersion,
          isSkopeoInstalled: sysInfo.isSkopeoInstalled,
          defaultConcurrency: 2,
          autoImportDockerAuth: true,
          tempDirectory: '',
        });

        const credsList = await (window as any).skopeoApi.getCredentials();
        setCredentials(credsList);
      }
    } catch (err: any) {
      console.error('Failed to load initial data:', err);
    }
  };

  useEffect(() => {
    loadInitialData();

    if ((window as any).skopeoApi) {
      const unsubBatch = (window as any).skopeoApi.onBatchItemUpdate((item: BatchItem) => {
        setActiveBatchItems((prev) => {
          const index = prev.findIndex((i) => i.id === item.id);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = item;
            return updated;
          }
          return [...prev, item];
        });
      });

      const unsubLogs = (window as any).skopeoApi.onLogEntry((log: LogEntry) => {
        setLogs((prev) => [...prev.slice(-400), log]);
      });

      return () => {
        unsubBatch();
        unsubLogs();
      };
    }
  }, []);

  const handleStartBatch = async (config: BatchMigrationConfig) => {
    setIsBatchRunning(true);
    setIsLogsOpen(true);
    try {
      await (window as any).skopeoApi.startBatchMigration(config);
      showToast('Batch migration finished!', true);
    } catch (err: any) {
      showToast(err.message || 'Batch migration error', false);
    } finally {
      setIsBatchRunning(false);
    }
  };

  const handleCancelBatch = async () => {
    try {
      await (window as any).skopeoApi.cancelBatchMigration();
      showToast('Cancellation requested.', false);
    } catch (err: any) {
      showToast(err.message || 'Failed to cancel', false);
    }
  };

  const activeRunningCount = activeBatchItems.filter((i) => i.status === 'running').length;

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0d0d18] text-[#e0e0e0] overflow-hidden">
      {/* Native macOS Titlebar */}
      <TitleBar
        settings={settings}
        activeLogsCount={logs.length}
        isLogsOpen={isLogsOpen}
        onToggleLogs={() => setIsLogsOpen(!isLogsOpen)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main App Layout */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          credentialsCount={credentials.length}
          activeTasksCount={activeRunningCount}
        />

        <main className="flex-1 flex flex-col min-w-0 bg-[#0f0f1c] overflow-hidden">
          {activeTab === 'batch' && (
            <BatchTransfer
              credentials={credentials}
              activeItems={activeBatchItems}
              isRunning={isBatchRunning}
              onStart={handleStartBatch}
              onCancel={handleCancelBatch}
              onShowToast={showToast}
            />
          )}

          {activeTab === 'single' && (
            <SingleTransfer
              credentials={credentials}
              onShowToast={showToast}
            />
          )}

          {activeTab === 'inspector' && (
            <ImageInspector
              credentials={credentials}
              onShowToast={showToast}
            />
          )}

          {activeTab === 'credentials' && (
            <CredentialManager
              credentials={credentials}
              onRefresh={loadInitialData}
              onShowToast={showToast}
            />
          )}
        </main>
      </div>

      {/* Real-time Terminal Log Console Drawer */}
      <TerminalLogs
        logs={logs}
        isOpen={isLogsOpen}
        onClose={() => setIsLogsOpen(false)}
        onClear={() => setLogs([])}
        onShowToast={showToast}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        onClose={() => setIsSettingsOpen(false)}
        onRefreshInfo={loadInitialData}
        onShowToast={showToast}
      />

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl shadow-2xl border text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 ${
            toast.success
              ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/90 border-rose-500/40 text-rose-200'
          }`}
        >
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
};
