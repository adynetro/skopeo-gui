import React, { useState } from 'react';
import {
  Layers,
  ArrowRight,
  Play,
  Square,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Settings2,
  Tag,
  Filter,
  CheckSquare,
  Square as SquareIcon,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Server,
  Zap,
} from 'lucide-react';
import { BatchItem, BatchMigrationConfig, RegistryCredential, TransportType } from '../../../types';

interface Props {
  credentials: RegistryCredential[];
  activeItems: BatchItem[];
  isRunning: boolean;
  onStart: (config: BatchMigrationConfig) => void;
  onCancel: () => void;
  onShowToast: (msg: string, success: boolean) => void;
}

const TRANSPORTS: { value: TransportType; label: string; prefix: string }[] = [
  { value: 'docker', label: 'Docker Registry', prefix: 'docker://' },
  { value: 'oci', label: 'OCI Directory', prefix: 'oci://' },
  { value: 'dir', label: 'Local Dir', prefix: 'dir:' },
  { value: 'oci-archive', label: 'OCI Archive (.tar)', prefix: 'oci-archive:' },
  { value: 'docker-archive', label: 'Docker Archive (.tar)', prefix: 'docker-archive:' },
  { value: 'docker-daemon', label: 'Docker Daemon', prefix: 'docker-daemon:' },
];

export const BatchTransfer: React.FC<Props> = ({
  credentials,
  activeItems,
  isRunning,
  onStart,
  onCancel,
  onShowToast,
}) => {
  // Source configuration
  const [srcCredId, setSrcCredId] = useState<string>('');
  const [srcTransport, setSrcTransport] = useState<TransportType>('docker');
  const [srcRepo, setSrcRepo] = useState<string>('');
  const [srcInsecure, setSrcInsecure] = useState<boolean>(false);

  // Tags fetching
  const [isFetchingTags, setIsFetchingTags] = useState(false);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState('');
  const [manualTagsInput, setManualTagsInput] = useState('');

  // Destination configuration
  const [destCredId, setDestCredId] = useState<string>('');
  const [destTransport, setDestTransport] = useState<TransportType>('docker');
  const [destRepo, setDestRepo] = useState<string>('');
  const [destInsecure, setDestInsecure] = useState<boolean>(false);

  // Transfer options
  const [copyAllArch, setCopyAllArch] = useState(true);
  const [concurrency, setConcurrency] = useState(2);
  const [format, setFormat] = useState<'v2s1' | 'v2s2' | 'oci' | undefined>('v2s2');

  // UI state
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const selectedSrcCred = credentials.find((c) => c.id === srcCredId);
  const selectedDestCred = credentials.find((c) => c.id === destCredId);

  const handleFetchTags = async () => {
    if (!srcRepo.trim()) {
      onShowToast('Please enter a source repository first.', false);
      return;
    }
    setIsFetchingTags(true);
    setAvailableTags([]);
    try {
      const uri = (window as any).skopeoApi.formatUri(srcTransport, srcRepo.trim());
      const tags = await (window as any).skopeoApi.listTags(
        await uri,
        srcCredId || undefined,
        srcInsecure
      );
      setAvailableTags(tags);
      setSelectedTags(tags); // default select all
      onShowToast(`Discovered ${tags.length} tags for ${srcRepo}`, true);
    } catch (err: any) {
      onShowToast(err.message || 'Failed to list tags from repository', false);
    } finally {
      setIsFetchingTags(false);
    }
  };

  const handleSelectAllTags = () => {
    setSelectedTags(availableTags);
  };

  const handleClearTags = () => {
    setSelectedTags([]);
  };

  const handleToggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleApplyRegex = (pattern: string) => {
    try {
      const re = new RegExp(pattern);
      const matches = availableTags.filter((t) => re.test(t));
      setSelectedTags(matches);
      onShowToast(`Selected ${matches.length} tags matching pattern "${pattern}"`, true);
    } catch {
      onShowToast('Invalid regular expression', false);
    }
  };

  const handleStartBatch = () => {
    let finalTags = [...selectedTags];
    if (manualTagsInput.trim()) {
      const parsedManual = manualTagsInput.split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);
      finalTags = Array.from(new Set([...finalTags, ...parsedManual]));
    }

    if (!srcRepo.trim()) {
      onShowToast('Please specify a source repository.', false);
      return;
    }
    if (!destRepo.trim()) {
      onShowToast('Please specify a destination repository.', false);
      return;
    }
    if (finalTags.length === 0) {
      onShowToast('Please select or specify at least one tag to transfer.', false);
      return;
    }

    const config: BatchMigrationConfig = {
      name: `Migration ${srcRepo} -> ${destRepo}`,
      srcRegistryId: srcCredId || undefined,
      destRegistryId: destCredId || undefined,
      srcTransport,
      destTransport,
      srcRepo: srcRepo.trim(),
      destRepo: destRepo.trim(),
      selectedTags: finalTags,
      copyAllArchitectures: copyAllArch,
      srcInsecure,
      destInsecure,
      format,
      concurrency,
    };

    onStart(config);
  };

  const filteredTags = availableTags.filter((t) =>
    t.toLowerCase().includes(tagFilter.toLowerCase())
  );

  const completedCount = activeItems.filter((i) => i.status === 'completed').length;
  const failedCount = activeItems.filter((i) => i.status === 'failed').length;
  const runningCount = activeItems.filter((i) => i.status === 'running').length;
  const totalCount = activeItems.length;
  const overallProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap pb-4 border-b border-white/[0.08]">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-amber-400" />
            Batch Image Migration
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Batch-copy container images and tags between Oracle Cloud (OCIR), Docker Hub, GitHub Packages, or local storage.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isRunning ? (
            <button
              onClick={onCancel}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-rose-500 text-white hover:bg-rose-600 transition-colors shadow-[0_0_12px_rgba(244,63,94,0.3)]"
            >
              <Square className="w-4 h-4" />
              <span>Cancel Migration</span>
            </button>
          ) : (
            <button
              onClick={handleStartBatch}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 transition-all shadow-[0_0_15px_rgba(251,191,36,0.3)] hover:scale-[1.02]"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start Batch Migration ({selectedTags.length || 'Manual'} tags)</span>
            </button>
          )}
        </div>
      </div>

      {/* Migration Configuration Card */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Source Box */}
        <div className="p-4 rounded-xl bg-[#131326] border border-white/[0.08] space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5" />
              Source Image & Registry
            </span>
            <span className="text-[10px] text-slate-400">Origin Repository</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Registry Credentials / Domain
              </label>
              <select
                value={srcCredId}
                onChange={(e) => setSrcCredId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs focus:border-amber-400 focus:outline-none"
              >
                <option value="">(Custom / Unauthenticated / Public)</option>
                {credentials.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.domain}) {c.isAnonymous ? '• Anonymous' : `• ${c.username}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Transport</label>
                <select
                  value={srcTransport}
                  onChange={(e) => setSrcTransport(e.target.value as TransportType)}
                  className="w-full px-2 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs focus:border-amber-400 focus:outline-none font-mono"
                >
                  {TRANSPORTS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Source Image / Repository
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="e.g. docker.io/library/nginx or myrepo"
                    value={srcRepo}
                    onChange={(e) => setSrcRepo(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs font-mono focus:border-amber-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={isFetchingTags || !srcRepo.trim()}
                    onClick={handleFetchTags}
                    className="px-3 py-2 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 disabled:opacity-40 transition-colors flex items-center gap-1"
                    title="List tags from remote repository"
                  >
                    <Tag className="w-3.5 h-3.5" />
                    <span>{isFetchingTags ? '...' : 'Tags'}</span>
                  </button>
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={srcInsecure}
                onChange={(e) => setSrcInsecure(e.target.checked)}
                className="rounded accent-amber-500"
              />
              <span className="text-[11px] text-slate-400">
                Source Insecure TLS (<code className="text-amber-400 text-[10px]">--src-tls-verify=false</code>)
              </span>
            </label>
          </div>
        </div>

        {/* Destination Box */}
        <div className="p-4 rounded-xl bg-[#131326] border border-white/[0.08] space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5" />
              Destination Image & Registry
            </span>
            <span className="text-[10px] text-slate-400">Target Repository</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Registry Credentials / Target
              </label>
              <select
                value={destCredId}
                onChange={(e) => setDestCredId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs focus:border-emerald-400 focus:outline-none"
              >
                <option value="">(Custom / Unauthenticated / Public)</option>
                {credentials.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.domain}) {c.isAnonymous ? '• Anonymous' : `• ${c.username}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Transport</label>
                <select
                  value={destTransport}
                  onChange={(e) => setDestTransport(e.target.value as TransportType)}
                  className="w-full px-2 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs focus:border-emerald-400 focus:outline-none font-mono"
                >
                  {TRANSPORTS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Destination Image / Target Repo
                </label>
                <input
                  type="text"
                  placeholder="e.g. fra.ocir.io/mytenant/mirror/nginx"
                  value={destRepo}
                  onChange={(e) => setDestRepo(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs font-mono focus:border-emerald-400 focus:outline-none"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={destInsecure}
                onChange={(e) => setDestInsecure(e.target.checked)}
                className="rounded accent-emerald-500"
              />
              <span className="text-[11px] text-slate-400">
                Destination Insecure TLS (<code className="text-emerald-400 text-[10px]">--dest-tls-verify=false</code>)
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Tags Selector Drawer */}
      <div className="p-4 rounded-xl bg-[#131326] border border-white/[0.08] space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-white">
              Tags to Copy ({selectedTags.length} / {availableTags.length || 'Manual'})
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs">
            {availableTags.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleSelectAllTags}
                  className="text-[11px] text-amber-400 hover:text-amber-300 underline"
                >
                  Select All
                </button>
                <span className="text-slate-600">•</span>
                <button
                  type="button"
                  onClick={handleClearTags}
                  className="text-[11px] text-slate-400 hover:text-white underline"
                >
                  Clear All
                </button>
                <span className="text-slate-600">•</span>
                <button
                  type="button"
                  onClick={() => handleApplyRegex('^latest$|^v.*')}
                  className="text-[11px] text-slate-400 hover:text-amber-300 underline"
                >
                  Pick "latest" & "v*"
                </button>
              </>
            )}
          </div>
        </div>

        {availableTags.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Filter discovered tags..."
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs focus:border-amber-400 focus:outline-none"
                />
                <Filter className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              </div>
            </div>

            <div className="max-h-40 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1.5 p-2 rounded-lg bg-[#0a0a14] border border-white/5">
              {filteredTags.map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleToggleTag(tag)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-left text-xs font-mono truncate border transition-colors ${
                      isSelected
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                        : 'bg-white/[0.02] text-slate-400 border-white/5 hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    {isSelected ? (
                      <CheckSquare className="w-3 h-3 text-amber-400 flex-shrink-0" />
                    ) : (
                      <SquareIcon className="w-3 h-3 text-slate-600 flex-shrink-0" />
                    )}
                    <span className="truncate">{tag}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Manual Tags (comma or space-separated, e.g. <code className="text-amber-400">latest, 1.25, v2.0.0</code>)
            </label>
            <input
              type="text"
              placeholder="latest, 1.0, 1.1, stable"
              value={manualTagsInput}
              onChange={(e) => setManualTagsInput(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs font-mono focus:border-amber-400 focus:outline-none"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Tip: Click the "Tags" button next to source repo above to automatically list all remote tags.
            </p>
          </div>
        )}

        {/* Advanced Transfer Flags */}
        <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={copyAllArch}
                onChange={(e) => setCopyAllArch(e.target.checked)}
                className="rounded accent-amber-500"
              />
              <span className="text-slate-300">
                Copy All Architectures (<code className="text-amber-400 text-[10px]">--all</code>)
              </span>
            </label>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">Concurrency:</span>
              <select
                value={concurrency}
                onChange={(e) => setConcurrency(parseInt(e.target.value))}
                className="px-2 py-1 rounded bg-[#0a0a14] border border-white/10 text-white text-xs font-mono"
              >
                <option value="1">1 Worker (Sequential)</option>
                <option value="2">2 Concurrent Workers</option>
                <option value="4">4 Concurrent Workers</option>
                <option value="8">8 Concurrent Workers (Fast)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Execution Queue & Progress */}
      {activeItems.length > 0 && (
        <div className="p-4 rounded-xl bg-[#131326] border border-white/[0.08] space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-white">
                Transfer Progress ({completedCount} / {totalCount} Completed)
              </h2>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-emerald-400 font-bold">{completedCount} Succeeded</span>
              {failedCount > 0 && <span className="text-rose-400 font-bold">• {failedCount} Failed</span>}
              {runningCount > 0 && <span className="text-amber-400">• {runningCount} Active</span>}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-300"
              style={{ width: `${overallProgress}%` }}
            />
          </div>

          {/* Tasks Table */}
          <div className="divide-y divide-white/5 max-h-72 overflow-y-auto rounded-lg border border-white/5 bg-[#0a0a14]">
            {activeItems.map((item) => {
              const isExpanded = expandedItemId === item.id;
              return (
                <div key={item.id} className="p-2.5 space-y-2">
                  <div
                    className="flex items-center justify-between gap-2 cursor-pointer hover:bg-white/[0.02] p-1 rounded"
                    onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      )}

                      <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-white/5 text-amber-300 border border-white/10">
                        :{item.tag}
                      </span>

                      <span className="text-[11px] font-mono text-slate-400 truncate max-w-xs">
                        {item.destReference}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      {item.durationMs && (
                        <span className="text-[10px] text-slate-500 font-mono">
                          {(item.durationMs / 1000).toFixed(1)}s
                        </span>
                      )}

                      {item.status === 'completed' && (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-bold text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Done
                        </span>
                      )}
                      {item.status === 'running' && (
                        <span className="inline-flex items-center gap-1 text-amber-400 font-bold text-[11px] animate-pulse">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Copying...
                        </span>
                      )}
                      {item.status === 'failed' && (
                        <span className="inline-flex items-center gap-1 text-rose-400 font-bold text-[11px]">
                          <XCircle className="w-3.5 h-3.5" />
                          Failed
                        </span>
                      )}
                      {item.status === 'pending' && (
                        <span className="inline-flex items-center gap-1 text-slate-500 text-[11px]">
                          <Clock className="w-3.5 h-3.5" />
                          Queued
                        </span>
                      )}
                      {item.status === 'cancelled' && (
                        <span className="inline-flex items-center gap-1 text-amber-600 text-[11px]">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Cancelled
                        </span>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-3 rounded-lg bg-black/60 border border-white/5 space-y-2 text-xs font-mono">
                      <div className="text-[11px] text-slate-400">
                        <strong>Source:</strong> {item.srcReference}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        <strong>Destination:</strong> {item.destReference}
                      </div>
                      {item.error && (
                        <div className="text-rose-400 text-[11px] p-2 rounded bg-rose-950/40 border border-rose-500/20">
                          {item.error}
                        </div>
                      )}
                      {item.logs.length > 0 && (
                        <div className="max-h-32 overflow-y-auto text-[10px] text-slate-400 bg-[#07070e] p-2 rounded whitespace-pre-wrap">
                          {item.logs.join('\n')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
