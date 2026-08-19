import React, { useState } from 'react';
import {
  Search,
  Layers,
  Cpu,
  Shield,
  FileCode,
  Tag,
  Info,
  CheckCircle2,
  Copy,
  ExternalLink,
  Trash2,
  AlertTriangle,
  RefreshCw,
  Monitor,
} from 'lucide-react';
import { ImageInspection, RegistryCredential } from '../../../types';

interface ManifestPlatform {
  mediaType?: string;
  digest: string;
  size?: number;
  platform?: {
    architecture: string;
    os: string;
    variant?: string;
    'os.version'?: string;
  };
}

interface Props {
  credentials: RegistryCredential[];
  onShowToast: (msg: string, success: boolean) => void;
}

export const ImageInspector: React.FC<Props> = ({
  credentials,
  onShowToast,
}) => {
  const [imageRef, setImageRef] = useState('');
  const [credId, setCredId] = useState('');
  const [insecure, setInsecure] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspection, setInspection] = useState<ImageInspection | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'layers' | 'env' | 'labels' | 'tags' | 'architectures' | 'raw'>('overview');
  const [tags, setTags] = useState<string[]>([]);
  const [isFetchingTags, setIsFetchingTags] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [tagFilter, setTagFilter] = useState('');
  const [platforms, setPlatforms] = useState<ManifestPlatform[]>([]);
  const [isFetchingPlatforms, setIsFetchingPlatforms] = useState(false);

  const handleInspect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageRef.trim()) {
      onShowToast('Please specify an image reference (e.g. docker://docker.io/library/alpine:latest)', false);
      return;
    }

    setIsInspecting(true);
    setInspection(null);
    setPlatforms([]);

    try {
      const fullRef = imageRef.includes('://') ? imageRef.trim() : `docker://${imageRef.trim()}`;
      const data = await (window as any).skopeoApi.inspectImage(
        fullRef,
        credId || undefined,
        insecure
      );
      setInspection(data);
      setActiveTab('overview');

      // Also fetch raw manifest for multi-arch detection
      try {
        const raw = await (window as any).skopeoApi.inspectRaw(
          fullRef,
          credId || undefined,
          insecure
        );
        if (raw && raw.manifests && Array.isArray(raw.manifests)) {
          setPlatforms(raw.manifests);
        }
      } catch {
        // Not a manifest list, single-arch image
      }

      onShowToast('Image inspection completed.', true);
    } catch (err: any) {
      onShowToast(err.message || 'Inspection failed', false);
    } finally {
      setIsInspecting(false);
    }
  };

  const handleFetchTags = async () => {
    if (!imageRef.trim()) return;
    setIsFetchingTags(true);
    try {
      const cleanRef = imageRef.trim().replace(/^([a-z-]+:\/\/)/, '');
      const repoBase = cleanRef.includes(':') ? cleanRef.split(':')[0] : cleanRef.split('@')[0];
      const fullRef = `docker://${repoBase}`;
      const result = await (window as any).skopeoApi.listTags(fullRef, credId || undefined, insecure);
      setTags(result);
      setActiveTab('tags');
      onShowToast(`Discovered ${result.length} tags`, true);
    } catch (err: any) {
      onShowToast(err.message || 'Failed to list tags', false);
    } finally {
      setIsFetchingTags(false);
    }
  };

  const handleDeleteImage = async () => {
    if (!imageRef.trim()) return;
    if (!confirm(`Are you sure you want to delete "${imageRef}" from the remote registry? This action cannot be undone.`)) return;

    setIsDeleting(true);
    try {
      const fullRef = imageRef.includes('://') ? imageRef.trim() : `docker://${imageRef.trim()}`;
      await (window as any).skopeoApi.deleteImage(fullRef, credId || undefined, insecure);
      onShowToast('Image deleted successfully from registry.', true);
    } catch (err: any) {
      onShowToast(err.message || 'Delete failed', false);
    } finally {
      setIsDeleting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    onShowToast('Copied to clipboard!', true);
  };

  const filteredTags = tagFilter
    ? tags.filter((t) => t.toLowerCase().includes(tagFilter.toLowerCase()))
    : tags;

  const hasResults = inspection || tags.length > 0;

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap pb-4 border-b border-white/[0.08]">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Search className="w-5 h-5 text-amber-400" />
            Image & Manifest Inspector
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Inspect remote container images without pulling them. View layers, architectures, digests, environment variables, labels, and tags.
          </p>
        </div>
      </div>

      {/* Query Form */}
      <form onSubmit={handleInspect} className="p-4 rounded-xl bg-[#131326] border border-white/[0.08] space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Image Reference
            </label>
            <input
              type="text"
              required
              placeholder="e.g. docker.io/library/nginx:latest, ghcr.io/org/app:v1, fra.ocir.io/myrepo:tag"
              value={imageRef}
              onChange={(e) => setImageRef(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs font-mono focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Registry Credential
            </label>
            <select
              value={credId}
              onChange={(e) => setCredId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs"
            >
              <option value="">(Custom / Anonymous / Public)</option>
              {credentials.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.domain}) {c.isAnonymous ? '• Anonymous' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
          <label className="flex items-center gap-2 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={insecure}
              onChange={(e) => setInsecure(e.target.checked)}
              className="rounded accent-amber-500"
            />
            <span className="text-slate-300">Allow Insecure TLS (--tls-verify=false)</span>
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleFetchTags}
              disabled={isFetchingTags || !imageRef.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 hover:text-white disabled:opacity-40 transition-colors"
            >
              <Tag className="w-3.5 h-3.5 text-amber-400" />
              <span>{isFetchingTags ? 'Listing...' : 'List Tags'}</span>
            </button>

            <button
              type="button"
              onClick={handleDeleteImage}
              disabled={isDeleting || !imageRef.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 disabled:opacity-40 transition-colors"
              title="Delete image from remote registry"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
            </button>

            <button
              type="submit"
              disabled={isInspecting || !imageRef.trim()}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-50 transition-colors shadow-[0_0_12px_rgba(251,191,36,0.25)]"
            >
              <Search className="w-4 h-4" />
              <span>{isInspecting ? 'Inspecting...' : 'Inspect Image'}</span>
            </button>
          </div>
        </div>
      </form>

      {/* Results Panel — shown when inspection OR tags available */}
      {hasResults && (
        <div className="p-5 rounded-xl bg-[#131326] border border-white/[0.08] space-y-4">
          {/* Header with image info and tabs */}
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 flex-wrap gap-2">
            <div>
              <h2 className="text-base font-bold text-white font-mono break-all">
                {inspection?.Name || imageRef}
              </h2>
              {inspection?.Digest && (
                <div className="flex items-center gap-2 text-xs font-mono text-slate-400 mt-1">
                  <span className="text-slate-500">Digest:</span>
                  <span className="text-amber-400">{inspection.Digest.substring(0, 32)}...</span>
                  <button
                    onClick={() => copyToClipboard(inspection.Digest || '')}
                    className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white"
                    title="Copy full digest"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 bg-[#0a0a14] p-1 rounded-lg border border-white/5 flex-wrap">
              {inspection && (
                <>
                  {(['overview', 'layers', 'env', 'labels'] as const).map((tab) => {
                    const labelMap: Record<string, string> = {
                      overview: 'Overview',
                      layers: `Layers (${inspection.Layers?.length || 0})`,
                      env: `Env (${inspection.Env?.length || 0})`,
                      labels: `Labels (${Object.keys(inspection.Labels || {}).length})`,
                    };
                    return (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                          activeTab === tab
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {labelMap[tab]}
                      </button>
                    );
                  })}
                </>
              )}

              <button
                onClick={() => setActiveTab('tags')}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                  activeTab === 'tags'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Tags ({tags.length})
              </button>

              {platforms.length > 0 && (
                <button
                  onClick={() => setActiveTab('architectures')}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                    activeTab === 'architectures'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Architectures ({platforms.length})
                </button>
              )}

              {inspection && (
                <button
                  onClick={() => setActiveTab('raw')}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                    activeTab === 'raw'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Raw JSON
                </button>
              )}
            </div>
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && inspection && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-[#0a0a14] border border-white/5">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Architecture / OS</div>
                  <div className="text-sm font-bold text-amber-300 mt-1 font-mono">
                    {inspection.Os || 'linux'} / {inspection.Architecture || 'amd64'}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#0a0a14] border border-white/5">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Total Layers</div>
                  <div className="text-sm font-bold text-white mt-1 font-mono">
                    {inspection.Layers?.length || 0}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#0a0a14] border border-white/5">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Created</div>
                  <div className="text-xs font-mono text-slate-300 mt-1 truncate">
                    {inspection.Created ? new Date(inspection.Created).toLocaleString() : 'N/A'}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#0a0a14] border border-white/5">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Docker Engine</div>
                  <div className="text-xs font-mono text-slate-300 mt-1">
                    {inspection.DockerVersion || 'OCI Compliant'}
                  </div>
                </div>
              </div>

              {inspection.ManifestType && (
                <div className="p-3 rounded-lg bg-[#0a0a14] border border-white/5">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Manifest Type</div>
                  <div className="text-xs font-mono text-amber-300 mt-1">{inspection.ManifestType}</div>
                </div>
              )}

              {/* Multi-arch badge */}
              {platforms.length > 0 && (
                <div className="p-3 rounded-lg bg-cyan-950/30 border border-cyan-500/20">
                  <div className="flex items-center gap-2 text-xs font-bold text-cyan-300">
                    <Monitor className="w-4 h-4" />
                    Multi-Architecture Image — {platforms.length} platforms available
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {platforms.map((p, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 border border-cyan-500/20 text-cyan-300"
                      >
                        {p.platform ? `${p.platform.os}/${p.platform.architecture}${p.platform.variant ? `/${p.platform.variant}` : ''}` : `manifest-${i}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {inspection.RepoTags && inspection.RepoTags.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Available Repository Tags ({inspection.RepoTags.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 rounded-lg bg-[#0a0a14] border border-white/5">
                    {inspection.RepoTags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded text-[11px] font-mono bg-white/5 border border-white/10 text-slate-300"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Layers Tab */}
          {activeTab === 'layers' && inspection && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Image Layer Digests
              </div>
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {(inspection.Layers || []).map((layer, index) => (
                  <div
                    key={index}
                    className="p-2.5 rounded-lg bg-[#0a0a14] border border-white/5 flex items-center justify-between text-xs font-mono"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-slate-500 w-6">#{index + 1}</span>
                      <span className="text-amber-300 truncate">{layer}</span>
                    </div>
                    <button
                      onClick={() => copyToClipboard(layer)}
                      className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white"
                      title="Copy Layer Digest"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Env Tab */}
          {activeTab === 'env' && inspection && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Environment Variables ({inspection.Env?.length || 0})
              </div>
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {(inspection.Env || []).length === 0 ? (
                  <div className="text-xs text-slate-500 italic p-3">No environment variables found.</div>
                ) : (
                  (inspection.Env || []).map((envVar, index) => {
                    const eqIdx = envVar.indexOf('=');
                    const key = eqIdx >= 0 ? envVar.substring(0, eqIdx) : envVar;
                    const val = eqIdx >= 0 ? envVar.substring(eqIdx + 1) : '';
                    return (
                      <div
                        key={index}
                        className="p-2.5 rounded-lg bg-[#0a0a14] border border-white/5 flex items-start justify-between text-xs font-mono gap-2"
                      >
                        <div className="flex-1 min-w-0">
                          <span className="text-cyan-400 font-bold">{key}</span>
                          <span className="text-slate-500">=</span>
                          <span className="text-slate-300 break-all">{val}</span>
                        </div>
                        <button
                          onClick={() => copyToClipboard(envVar)}
                          className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white flex-shrink-0"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Labels Tab */}
          {activeTab === 'labels' && inspection && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Image Labels ({Object.keys(inspection.Labels || {}).length})
              </div>
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {Object.keys(inspection.Labels || {}).length === 0 ? (
                  <div className="text-xs text-slate-500 italic p-3">No labels found.</div>
                ) : (
                  Object.entries(inspection.Labels || {}).map(([key, value]) => (
                    <div
                      key={key}
                      className="p-2.5 rounded-lg bg-[#0a0a14] border border-white/5 flex items-start justify-between text-xs font-mono gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-purple-400 font-bold break-all">{key}</div>
                        <div className="text-slate-300 break-all mt-0.5">{value}</div>
                      </div>
                      <button
                        onClick={() => copyToClipboard(`${key}=${value}`)}
                        className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white flex-shrink-0"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Tags Tab — always rendered when tags are available, even without inspection */}
          {activeTab === 'tags' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Repository Tags ({filteredTags.length}{tagFilter ? ` / ${tags.length}` : ''})
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Filter tags..."
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs font-mono w-48 focus:border-amber-400 focus:outline-none"
                  />
                  <button
                    onClick={handleFetchTags}
                    disabled={isFetchingTags}
                    className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white disabled:opacity-40"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isFetchingTags ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {tags.length === 0 ? (
                <div className="text-xs text-slate-500 italic p-3 text-center">
                  Click "List Tags" to discover all published tags for this repository.
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-64 overflow-y-auto p-2 rounded-lg bg-[#0a0a14] border border-white/5">
                  {filteredTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => copyToClipboard(tag)}
                      className="px-2 py-0.5 rounded text-[11px] font-mono bg-white/5 border border-white/10 text-slate-300 hover:bg-amber-500/10 hover:border-amber-500/30 hover:text-amber-300 transition-colors"
                      title={`Click to copy: ${tag}`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Architectures Tab */}
          {activeTab === 'architectures' && platforms.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Available Architectures & Platforms ({platforms.length})
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {platforms.map((manifest, index) => {
                  const p = manifest.platform;
                  const platformLabel = p
                    ? `${p.os}/${p.architecture}${p.variant ? '/' + p.variant : ''}`
                    : `unknown-${index}`;
                  const osVersion = p?.['os.version'];

                  return (
                    <div
                      key={index}
                      className="p-3 rounded-lg bg-[#0a0a14] border border-white/5 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Monitor className="w-4 h-4 text-cyan-400" />
                          <span className="text-sm font-bold font-mono text-white">
                            {platformLabel}
                          </span>
                          {osVersion && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400 font-mono">
                              {osVersion}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {manifest.size && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              {(manifest.size / 1024 / 1024).toFixed(1)} MB
                            </span>
                          )}
                          <button
                            onClick={() => copyToClipboard(manifest.digest)}
                            className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white"
                            title="Copy digest"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-[10px] font-mono text-slate-500">
                        <span className="text-amber-400 truncate">{manifest.digest}</span>
                      </div>

                      {manifest.mediaType && (
                        <div className="text-[10px] text-slate-500 font-mono">
                          {manifest.mediaType}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Raw JSON Tab */}
          {activeTab === 'raw' && inspection && (
            <pre className="p-4 rounded-lg bg-[#0a0a14] border border-white/5 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-96">
              {JSON.stringify(inspection.RawJSON || inspection, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
