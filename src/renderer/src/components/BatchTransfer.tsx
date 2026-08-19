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
  Tag,
  Filter,
  CheckSquare,
  Square as SquareIcon,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Server,
  Zap,
  ListPlus,
  FileText,
  Trash2,
  Plus,
  Sparkles,
  HelpCircle,
} from 'lucide-react';
import { BatchItem, BatchMigrationConfig, ImageTransferPair, RegistryCredential, TransportType } from '../../../types';

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

const SAMPLE_IMAGES = `docker.io/library/alpine:latest
docker.io/library/redis:7-alpine
docker.io/library/nginx:alpine
docker.io/library/postgres:16-alpine
docker.io/library/node:22-alpine`;

export const BatchTransfer: React.FC<Props> = ({
  credentials,
  activeItems,
  isRunning,
  onStart,
  onCancel,
  onShowToast,
}) => {
  // Batch Mode: 'multi-images' (list of different images) or 'tags' (single repo with multiple tags)
  const [batchMode, setBatchMode] = useState<'multi-images' | 'tags'>('multi-images');

  // Source configuration
  const [srcCredId, setSrcCredId] = useState<string>('');
  const [srcTransport, setSrcTransport] = useState<TransportType>('docker');
  const [srcInsecure, setSrcInsecure] = useState<boolean>(false);

  // Destination configuration
  const [destCredId, setDestCredId] = useState<string>('');
  const [destTransport, setDestTransport] = useState<TransportType>('docker');
  const [destRepoPrefix, setDestRepoPrefix] = useState<string>(''); // e.g. fra.ocir.io/mytenancy/mirror
  const [destInsecure, setDestInsecure] = useState<boolean>(false);

  // Mode 1: Multi-Images list state
  const [imageListText, setImageListText] = useState<string>(SAMPLE_IMAGES);

  // Mode 2: Single-Repo Tags state
  const [srcRepo, setSrcRepo] = useState<string>('');
  const [destRepo, setDestRepo] = useState<string>('');
  const [isFetchingTags, setIsFetchingTags] = useState(false);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState('');
  const [manualTagsInput, setManualTagsInput] = useState('');

  // General options
  const [copyAllArch, setCopyAllArch] = useState(true);
  const [concurrency, setConcurrency] = useState(2);
  const [format, setFormat] = useState<'v2s1' | 'v2s2' | 'oci' | undefined>('v2s2');

  // UI state
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  // Parse multi-image lines
  const parsedImagePairs: ImageTransferPair[] = imageListText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      // Support "src -> dest" or "src => dest" or just "src"
      if (line.includes('->') || line.includes('=>')) {
        const parts = line.split(/->|=>/).map((s) => s.trim());
        return { src: parts[0], dest: parts[1] };
      }
      return { src: line };
    });

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
      setSelectedTags(tags);
      onShowToast(`Discovered ${tags.length} tags for ${srcRepo}`, true);
    } catch (err: any) {
      onShowToast(err.message || 'Failed to list tags from repository', false);
    } finally {
      setIsFetchingTags(false);
    }
  };

  const handleStartBatch = () => {
    if (batchMode === 'multi-images') {
      if (parsedImagePairs.length === 0) {
        onShowToast('Please enter at least one image in the list.', false);
        return;
      }

      if (!destRepoPrefix.trim() && parsedImagePairs.some((p) => !p.dest)) {
        onShowToast('Please specify a Destination Prefix (e.g. fra.ocir.io/mytenant/mirror) or explicit destination mapping for each image.', false);
        return;
      }

      const config: BatchMigrationConfig = {
        name: `Multi-image Batch (${parsedImagePairs.length} images)`,
        mode: 'multi-images',
        srcRegistryId: srcCredId || undefined,
        destRegistryId: destCredId || undefined,
        srcTransport,
        destTransport,
        destRepo: destRepoPrefix.trim(),
        imagesList: parsedImagePairs,
        copyAllArchitectures: copyAllArch,
        srcInsecure,
        destInsecure,
        format,
        concurrency,
      };

      onStart(config);
    } else {
      // Tags mode
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
        name: `Tag Migration ${srcRepo} -> ${destRepo}`,
        mode: 'tags',
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
    }
  };

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
            Batch-replicate multiple container images or tags between Oracle Cloud (OCIR), Docker Hub, GitHub Packages, or local storage.
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
              <span>
                Start Batch Migration (
                {batchMode === 'multi-images'
                  ? `${parsedImagePairs.length} Images`
                  : `${selectedTags.length || 'Manual'} Tags`}
                )
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Mode Selector Tabs */}
      <div className="flex items-center gap-2 bg-[#131326] p-1.5 rounded-xl border border-white/[0.08]">
        <button
          onClick={() => setBatchMode('multi-images')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-xs font-bold transition-all ${
            batchMode === 'multi-images'
              ? 'bg-amber-500 text-black shadow-[0_0_15px_rgba(251,191,36,0.25)]'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <ListPlus className="w-4 h-4" />
          <span>Multi-Image List Mode (Move Multiple Different Images)</span>
        </button>

        <button
          onClick={() => setBatchMode('tags')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-xs font-bold transition-all ${
            batchMode === 'tags'
              ? 'bg-amber-500 text-black shadow-[0_0_15px_rgba(251,191,36,0.25)]'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          <Tag className="w-4 h-4" />
          <span>Single-Repo Tag Mode (Move Multiple Tags for One Repo)</span>
        </button>
      </div>

      {/* Credentials & Transports Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Source Registry Credentials */}
        <div className="p-4 rounded-xl bg-[#131326] border border-white/[0.08] space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5" />
              Source Registry
            </span>
            <span className="text-[10px] text-slate-400">Origin Auth</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Source Vault Credentials
              </label>
              <select
                value={srcCredId}
                onChange={(e) => setSrcCredId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs focus:border-amber-400 focus:outline-none"
              >
                <option value="">(Custom / Unauthenticated / Anonymous)</option>
                {credentials.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.domain}) {c.isAnonymous ? '• Anonymous' : `• ${c.username}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-1">
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">Transport</label>
              <select
                value={srcTransport}
                onChange={(e) => setSrcTransport(e.target.value as TransportType)}
                className="w-full px-2 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs font-mono"
              >
                {TRANSPORTS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
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

        {/* Destination Registry Credentials */}
        <div className="p-4 rounded-xl bg-[#131326] border border-white/[0.08] space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5" />
              Destination Registry
            </span>
            <span className="text-[10px] text-slate-400">Target Auth</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Destination Vault Credentials
              </label>
              <select
                value={destCredId}
                onChange={(e) => setDestCredId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs focus:border-emerald-400 focus:outline-none"
              >
                <option value="">(Custom / Unauthenticated / Anonymous)</option>
                {credentials.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.domain}) {c.isAnonymous ? '• Anonymous' : `• ${c.username}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-1">
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">Transport</label>
              <select
                value={destTransport}
                onChange={(e) => setDestTransport(e.target.value as TransportType)}
                className="w-full px-2 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs font-mono"
              >
                {TRANSPORTS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
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

      {/* MODE 1: Multi-Image List Mode UI */}
      {batchMode === 'multi-images' && (
        <div className="p-4 rounded-xl bg-[#131326] border border-white/[0.08] space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.06] flex-wrap gap-2">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <ListPlus className="w-4 h-4" />
                Batch Images Input Matrix ({parsedImagePairs.length} Images Detected)
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Paste any list of container images (one per line). Optionally specify custom destinations using <code className="text-amber-300 text-[10px]">source -&gt; destination</code>.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setImageListText(SAMPLE_IMAGES)}
                className="text-[11px] px-2.5 py-1 rounded bg-white/5 border border-white/10 text-amber-300 hover:bg-white/10 transition-colors flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" />
                <span>Load Sample List</span>
              </button>
              <button
                type="button"
                onClick={() => setImageListText('')}
                className="text-[11px] px-2.5 py-1 rounded bg-white/5 border border-white/10 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Images List (one per line)
              </label>
              <textarea
                rows={7}
                value={imageListText}
                onChange={(e) => setImageListText(e.target.value)}
                placeholder={`alpine:latest\nredis:7-alpine\npostgres:16-alpine\nnginx:alpine\nghcr.io/org/app:v1.2.0 -> fra.ocir.io/mytenant/mirror/app:v1.2.0`}
                className="w-full p-3 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs font-mono focus:border-amber-400 focus:outline-none resize-y leading-relaxed"
              />
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Destination Target Prefix / Namespace
                </label>
                <input
                  type="text"
                  placeholder="e.g. fra.ocir.io/mytenancy/mirror"
                  value={destRepoPrefix}
                  onChange={(e) => setDestRepoPrefix(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs font-mono focus:border-emerald-400 focus:outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  All images will automatically be mirrored under this destination path.
                </p>
              </div>

              {destRepoPrefix && parsedImagePairs.length > 0 && (
                <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/20 text-[11px] space-y-1">
                  <div className="text-emerald-300 font-bold">Live Mapping Preview:</div>
                  <div className="text-slate-300 font-mono text-[10px] truncate">
                    {parsedImagePairs[0].src} &rarr;
                  </div>
                  <div className="text-emerald-400 font-mono text-[10px] truncate font-bold">
                    {parsedImagePairs[0].dest ||
                      `${destRepoPrefix.replace(/\/+$/, '')}/${
                        parsedImagePairs[0].src.split('/').pop()
                      }`}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODE 2: Single-Repo Multi-Tag UI */}
      {batchMode === 'tags' && (
        <div className="p-4 rounded-xl bg-[#131326] border border-white/[0.08] space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Source Repository Name
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="e.g. docker.io/library/nginx"
                  value={srcRepo}
                  onChange={(e) => setSrcRepo(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs font-mono focus:border-amber-400 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={isFetchingTags || !srcRepo.trim()}
                  onClick={handleFetchTags}
                  className="px-3 py-2 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 disabled:opacity-40 transition-colors flex items-center gap-1"
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>{isFetchingTags ? '...' : 'Fetch Tags'}</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Destination Target Repository
              </label>
              <input
                type="text"
                placeholder="e.g. fra.ocir.io/mytenancy/mirror/nginx"
                value={destRepo}
                onChange={(e) => setDestRepo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs font-mono focus:border-emerald-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Tags Browser */}
          {availableTags.length > 0 ? (
            <div className="space-y-2 pt-2 border-t border-white/5">
              <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                <span className="font-bold text-white uppercase text-[11px]">
                  Discovered Tags ({selectedTags.length} / {availableTags.length})
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedTags(availableTags)}
                    className="text-[11px] text-amber-400 hover:underline"
                  >
                    Select All
                  </button>
                  <span className="text-slate-600">•</span>
                  <button
                    type="button"
                    onClick={() => setSelectedTags([])}
                    className="text-[11px] text-slate-400 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="max-h-36 overflow-y-auto grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-1.5 p-2 rounded-lg bg-[#0a0a14] border border-white/5">
                {availableTags.map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() =>
                        setSelectedTags((prev) =>
                          prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                        )
                      }
                      className={`flex items-center gap-1.5 px-2 py-1 rounded text-left text-xs font-mono truncate border transition-colors ${
                        isSelected
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold'
                          : 'bg-white/[0.02] text-slate-400 border-white/5 hover:text-white'
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
                Manual Tags (comma or space-separated)
              </label>
              <input
                type="text"
                placeholder="latest, 1.25, v2.0.0"
                value={manualTagsInput}
                onChange={(e) => setManualTagsInput(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs font-mono focus:border-amber-400 focus:outline-none"
              />
            </div>
          )}
        </div>
      )}

      {/* Advanced Execution Options */}
      <div className="p-4 rounded-xl bg-[#131326] border border-white/[0.08] flex items-center justify-between flex-wrap gap-4 text-xs">
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
          <span className="text-slate-400">Worker Concurrency:</span>
          <select
            value={concurrency}
            onChange={(e) => setConcurrency(parseInt(e.target.value))}
            className="px-2.5 py-1 rounded bg-[#0a0a14] border border-white/10 text-white text-xs font-mono"
          >
            <option value="1">1 Worker (Sequential)</option>
            <option value="2">2 Concurrent Workers</option>
            <option value="4">4 Concurrent Workers (Recommended)</option>
            <option value="8">8 Concurrent Workers (High Speed)</option>
          </select>
        </div>
      </div>

      {/* Execution Queue & Progress Section */}
      {activeItems.length > 0 && (
        <div className="p-4 rounded-xl bg-[#131326] border border-white/[0.08] space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-white">
                Transfer Queue ({completedCount} / {totalCount} Completed)
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

                      <span className="text-xs font-bold font-mono px-2 py-0.5 rounded bg-white/5 text-amber-300 border border-white/10 truncate">
                        {item.imageName ? `${item.imageName}:${item.tag}` : `:${item.tag}`}
                      </span>

                      <span className="text-[11px] font-mono text-slate-400 truncate max-w-xs">
                        &rarr; {item.destReference}
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
                      <div className="text-[11px] text-slate-400 break-all">
                        <strong>Source:</strong> {item.srcReference}
                      </div>
                      <div className="text-[11px] text-slate-400 break-all">
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
