import React, { useState } from 'react';
import { Settings as SettingsIcon, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { AppSettings } from '../../../types';

interface Props {
  isOpen: boolean;
  settings: AppSettings | null;
  onClose: () => void;
  onRefreshInfo: () => void;
  onShowToast: (msg: string, success: boolean) => void;
}

export const SettingsModal: React.FC<Props> = ({
  isOpen,
  settings,
  onClose,
  onRefreshInfo,
  onShowToast,
}) => {
  const [customPath, setCustomPath] = useState(settings?.skopeoPath || '');

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await (window as any).skopeoApi.saveSettings({
        skopeoPath: customPath.trim(),
      });
      onRefreshInfo();
      onShowToast('Settings updated.', true);
      onClose();
    } catch (err: any) {
      onShowToast(err.message || 'Failed to save settings', false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#121226] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <SettingsIcon className="w-4 h-4 text-amber-400" />
            Application Settings
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div className="p-3 rounded-lg bg-[#0a0a14] border border-white/5 space-y-1">
            <div className="text-xs text-slate-400 font-bold uppercase">Skopeo Status</div>
            <div className="flex items-center gap-2 mt-1">
              {settings?.isSkopeoInstalled ? (
                <span className="text-xs font-mono text-emerald-400 flex items-center gap-1.5 font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  {settings.skopeoVersion}
                </span>
              ) : (
                <span className="text-xs font-mono text-rose-400 flex items-center gap-1.5 font-bold">
                  <AlertCircle className="w-4 h-4" />
                  Binary not found
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 font-mono break-all mt-1">
              {settings?.skopeoPath || 'Run "brew install skopeo" to install'}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Custom Skopeo Binary Path (Optional)
            </label>
            <input
              type="text"
              placeholder="/opt/homebrew/bin/skopeo"
              value={customPath}
              onChange={(e) => setCustomPath(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs font-mono focus:border-amber-400 focus:outline-none"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Leave blank to automatically discover the binary in Homebrew or standard system PATH.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 transition-colors"
            >
              Save Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
