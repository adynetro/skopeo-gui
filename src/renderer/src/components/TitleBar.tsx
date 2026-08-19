import React from 'react';
import { Terminal, Shield, CheckCircle2, AlertCircle, Settings as SettingsIcon } from 'lucide-react';
import { AppSettings } from '../../../types';

interface Props {
  settings: AppSettings | null;
  activeLogsCount: number;
  isLogsOpen: boolean;
  onToggleLogs: () => void;
  onOpenSettings: () => void;
}

export const TitleBar: React.FC<Props> = ({
  settings,
  activeLogsCount,
  isLogsOpen,
  onToggleLogs,
  onOpenSettings,
}) => {
  return (
    <header className="titlebar-drag-region h-12 bg-[#121224]/80 backdrop-blur-md border-b border-white/[0.08] flex items-center justify-between px-4 pl-20 select-none z-30 flex-shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <img
            src="./icon.png"
            alt="Skopeo GUI"
            className="w-5 h-5 rounded object-cover shadow-[0_0_10px_rgba(251,191,36,0.3)] border border-amber-500/30"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <span className="font-bold text-sm text-white tracking-wide">Skopeo GUI</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/70 font-mono">Apple Silicon</span>
        </div>

        {settings && (
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 pl-3 border-l border-white/10">
            {settings.isSkopeoInstalled ? (
              <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px] bg-emerald-950/40 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono">
                <CheckCircle2 className="w-3 h-3" />
                {settings.skopeoVersion || 'Ready'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-rose-400 text-[11px] bg-rose-950/40 border border-rose-500/20 px-2 py-0.5 rounded-full">
                <AlertCircle className="w-3 h-3" />
                Skopeo CLI Missing
              </span>
            )}
          </div>
        )}
      </div>

      <div className="titlebar-no-drag flex items-center gap-2">
        <button
          onClick={onToggleLogs}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
            isLogsOpen
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10 hover:text-white'
          }`}
          title="Toggle Terminal Logs Drawer"
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Console</span>
          {activeLogsCount > 0 && (
            <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1 rounded-full font-mono">
              {activeLogsCount}
            </span>
          )}
        </button>

        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-md text-slate-300 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10 transition-colors"
          title="Settings"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
