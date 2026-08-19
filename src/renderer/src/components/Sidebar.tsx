import React from 'react';
import {
  Layers,
  ArrowRightLeft,
  KeyRound,
  Search,
  BookOpen,
  Cloud,
  Terminal,
} from 'lucide-react';

export type TabType = 'batch' | 'single' | 'inspector' | 'credentials' | 'logs';

interface Props {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  credentialsCount: number;
  activeTasksCount: number;
}

export const Sidebar: React.FC<Props> = ({
  activeTab,
  onTabChange,
  credentialsCount,
  activeTasksCount,
}) => {
  const navItems = [
    {
      id: 'batch' as TabType,
      label: 'Batch Migration',
      description: 'Move multiple images/tags',
      icon: Layers,
      badge: activeTasksCount > 0 ? `${activeTasksCount} active` : undefined,
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    },
    {
      id: 'single' as TabType,
      label: 'Single Transfer',
      description: 'Quick 1-to-1 image copy',
      icon: ArrowRightLeft,
    },
    {
      id: 'inspector' as TabType,
      label: 'Image Inspector',
      description: 'Tags, layers & multi-arch',
      icon: Search,
    },
    {
      id: 'credentials' as TabType,
      label: 'Credential Vault',
      description: 'Registries & anonymous access',
      icon: KeyRound,
      badge: `${credentialsCount}`,
      badgeColor: 'bg-white/10 text-slate-300',
    },
  ];

  return (
    <aside className="w-64 bg-[#0d0d1a] border-r border-white/[0.08] flex flex-col flex-shrink-0 select-none">
      <div className="p-3 space-y-1">
        <div className="px-3 py-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          Workflows
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full text-left flex items-start gap-3 p-2.5 rounded-lg border transition-all ${
                isActive
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 shadow-[0_0_15px_rgba(251,191,36,0.08)]'
                  : 'bg-transparent border-transparent text-slate-300 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              <Icon
                className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                  isActive ? 'text-amber-400' : 'text-slate-400'
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold truncate leading-tight">
                    {item.label}
                  </span>
                  {item.badge && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono border ${item.badgeColor}`}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                  {item.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-auto p-3 border-t border-white/[0.08]">
        <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <Cloud className="w-3.5 h-3.5 text-amber-400" />
            <span>Registry Protocols</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Supports <span className="text-amber-300/90 font-mono">docker://</span>, <span className="text-amber-300/90 font-mono">oci://</span>, <span className="text-amber-300/90 font-mono">dir:</span>, <span className="text-amber-300/90 font-mono">oci-archive:</span>.
          </p>
        </div>
      </div>
    </aside>
  );
};
