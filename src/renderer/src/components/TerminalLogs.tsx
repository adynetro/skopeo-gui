import React, { useEffect, useRef } from 'react';
import { Terminal, Trash2, Copy, X } from 'lucide-react';
import { LogEntry } from '../../../types';

interface Props {
  logs: LogEntry[];
  isOpen: boolean;
  onClose: () => void;
  onClear: () => void;
  onShowToast: (msg: string, success: boolean) => void;
}

export const TerminalLogs: React.FC<Props> = ({
  logs,
  isOpen,
  onClose,
  onClear,
  onShowToast,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isOpen]);

  if (!isOpen) return null;

  const copyAll = () => {
    const text = logs.map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    onShowToast('Console logs copied to clipboard!', true);
  };

  return (
    <div className="h-64 bg-[#0a0a14] border-t border-white/[0.12] flex flex-col flex-shrink-0 z-40 select-text">
      <div className="h-9 px-4 bg-[#111122] border-b border-white/[0.06] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 text-xs font-mono font-bold text-amber-400">
          <Terminal className="w-3.5 h-3.5" />
          <span>Skopeo Execution Console</span>
          <span className="text-[10px] text-slate-500 font-normal">({logs.length} events)</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={copyAll}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-white/10"
            title="Copy all logs"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClear}
            className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-white/10"
            title="Clear logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-white/10"
            title="Close console"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 p-3 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-1">
        {logs.length === 0 ? (
          <div className="text-slate-600 italic">No output logged yet. Run a migration or inspection to see terminal logs.</div>
        ) : (
          logs.map((log) => {
            let color = 'text-slate-300';
            if (log.level === 'cmd') color = 'text-amber-300 font-bold';
            if (log.level === 'success') color = 'text-emerald-400 font-bold';
            if (log.level === 'error') color = 'text-rose-400 font-bold';
            if (log.level === 'warn') color = 'text-amber-500';

            return (
              <div key={log.id} className="flex items-start gap-2">
                <span className="text-slate-600 select-none flex-shrink-0">[{log.timestamp}]</span>
                <span className={`${color} break-all whitespace-pre-wrap`}>{log.message}</span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
