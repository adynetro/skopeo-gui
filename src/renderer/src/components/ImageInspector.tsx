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
} from 'lucide-react';
import { ImageInspection, RegistryCredential } from '../../../types';

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
  const [activeTab, setActiveTab] = useState<'overview' | 'layers' | 'raw'>('overview');

  const handleInspect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageRef.trim()) {
      onShowToast('Please specify an image reference (e.g. docker://docker.io/library/alpine:latest)', false);
      return;
    }

    setIsInspecting(true);
    setInspection(null);

    try {
      const fullRef = imageRef.includes('://') ? imageRef.trim() : `docker://${imageRef.trim()}`;
      const data = await (window as any).skopeoApi.inspectImage(
        fullRef,
        credId || undefined,
        insecure
      );
      setInspection(data);
      onShowToast('Image inspection completed.', true);
    } catch (err: any) {
      onShowToast(err.message || 'Inspection failed', false);
    } finally {
      setIsInspecting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    onShowToast('Copied to clipboard!', true);
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap pb-4 border-b border-white/[0.08]">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Search className="w-5 h-5 text-amber-400" />
            Image & Manifest Inspector
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Inspect remote container images without pulling them. View layers, architectures, digests, and environment variables.
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

        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center gap-2 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={insecure}
              onChange={(e) => setInsecure(e.target.checked)}
              className="rounded accent-amber-500"
            />
            <span className="text-slate-300">Allow Insecure TLS (--tls-verify=false)</span>
          </label>

          <button
            type="submit"
            disabled={isInspecting || !imageRef.trim()}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-50 transition-colors shadow-[0_0_12px_rgba(251,191,36,0.25)]"
          >
            <Search className="w-4 h-4" />
            <span>{isInspecting ? 'Inspecting...' : 'Inspect Image'}</span>
          </button>
        </div>
      </form>

      {/* Inspection Results */}
      {inspection && (
        <div className="p-5 rounded-xl bg-[#131326] border border-white/[0.08] space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 flex-wrap gap-2">
            <div>
              <h2 className="text-base font-bold text-white font-mono break-all">
                {inspection.Name || imageRef}
              </h2>
              {inspection.Digest && (
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

            <div className="flex items-center gap-1 bg-[#0a0a14] p-1 rounded-lg border border-white/5">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                  activeTab === 'overview'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('layers')}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                  activeTab === 'layers'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Layers ({inspection.Layers?.length || 0})
              </button>
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
            </div>
          </div>

          {activeTab === 'overview' && (
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

              {/* Tags */}
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

          {activeTab === 'layers' && (
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

          {activeTab === 'raw' && (
            <pre className="p-4 rounded-lg bg-[#0a0a14] border border-white/5 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-96">
              {JSON.stringify(inspection.RawJSON || inspection, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
