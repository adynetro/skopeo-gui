import React, { useState, useMemo } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Package,
  Search,
  FileCode,
  CheckCircle2,
  XCircle,
  Fingerprint,
  Bug,
  Copy,
  AlertTriangle
} from 'lucide-react';
import { RegistryCredential, SbomInspection, SbomPackage } from '../../../types';

interface Props {
  credentials: RegistryCredential[];
  onShowToast: (msg: string, success: boolean) => void;
}

export const SbomInspector: React.FC<Props> = ({ credentials, onShowToast }) => {
  const [imageRef, setImageRef] = useState('');
  const [credId, setCredId] = useState('');
  const [insecure, setInsecure] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspection, setInspection] = useState<SbomInspection | null>(null);
  const [activeTab, setActiveTab] = useState<'security' | 'packages' | 'raw'>('security');
  const [packageSearch, setPackageSearch] = useState('');

  const handleInspect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageRef.trim()) {
      onShowToast('Please specify an image reference', false);
      return;
    }

    setIsInspecting(true);
    setInspection(null);

    try {
      const fullRef = imageRef.includes('://') ? imageRef.trim() : `docker://${imageRef.trim()}`;
      const data = await (window as any).skopeoApi.inspectSbom(
        fullRef,
        credId || undefined,
        insecure
      );
      setInspection(data);
      onShowToast('SBOM inspection completed.', true);
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

  const filteredPackages = useMemo(() => {
    if (!inspection?.packages) return [];
    if (!packageSearch) return inspection.packages;
    
    const term = packageSearch.toLowerCase();
    return inspection.packages.filter(pkg => 
      pkg.name.toLowerCase().includes(term) ||
      pkg.version.toLowerCase().includes(term) ||
      pkg.type.toLowerCase().includes(term)
    );
  }, [inspection?.packages, packageSearch]);

  const getTypeBadgeColor = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('apk') || t.includes('deb') || t.includes('rpm')) return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    if (t.includes('npm') || t.includes('node')) return 'bg-green-500/20 text-green-300 border-green-500/30';
    if (t.includes('pypi') || t.includes('python')) return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
    if (t.includes('go') || t.includes('golang')) return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
    if (t.includes('os')) return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    if (t.includes('runtime')) return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    if (t.includes('library') || t.includes('cargo') || t.includes('rust')) return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
    return 'bg-white/10 text-slate-300 border-white/20';
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap pb-4 border-b border-white/[0.08]">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-400" />
            Security & SBOM Inspector
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Discover Software Bill of Materials, attestations, and signatures for container images.
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
              placeholder="e.g. docker.io/library/nginx:latest"
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
            <span>{isInspecting ? 'Inspecting...' : 'Inspect SBOM'}</span>
          </button>
        </div>
      </form>

      {/* Inspection Results */}
      {inspection && (
        <div className="p-5 rounded-xl bg-[#131326] border border-white/[0.08] space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 flex-wrap gap-2">
            <div>
              <h2 className="text-base font-bold text-white font-mono break-all">
                {inspection.imageRef}
              </h2>
            </div>

            <div className="flex items-center gap-1 bg-[#0a0a14] p-1 rounded-lg border border-white/5">
              <button
                onClick={() => setActiveTab('security')}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                  activeTab === 'security'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Security
              </button>
              <button
                onClick={() => setActiveTab('packages')}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                  activeTab === 'packages'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Packages ({inspection.packages?.length || 0})
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

          {activeTab === 'security' && (
            <div className="space-y-4">
              {inspection.error && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-start gap-3 text-rose-400">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-bold">Error Extracting SBOM</div>
                    <div className="text-xs mt-1 font-mono">{inspection.error}</div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-[#0a0a14] border border-white/5">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Format</div>
                  <div className="text-sm font-bold text-amber-300 mt-1 font-mono">
                    {inspection.format || 'None'}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#0a0a14] border border-white/5">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Spec Version</div>
                  <div className="text-sm font-bold text-white mt-1 font-mono">
                    {inspection.specVersion || 'N/A'}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#0a0a14] border border-white/5">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Generation Tool</div>
                  <div className="text-sm font-mono text-slate-300 mt-1 truncate">
                    {inspection.tool || 'N/A'}
                  </div>
                </div>
                
                <div className="p-3 rounded-lg bg-[#0a0a14] border border-white/5">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Digest</div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="text-xs font-mono text-amber-400 truncate flex-1">
                      {inspection.digest ? `${inspection.digest.substring(0, 24)}...` : 'N/A'}
                    </div>
                    {inspection.digest && (
                      <button
                        onClick={() => copyToClipboard(inspection.digest || '')}
                        className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white"
                        title="Copy full digest"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {inspection.creationTimestamp && (
                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <span className="font-bold uppercase tracking-wider text-[10px]">Created:</span>
                  <span>{new Date(inspection.creationTimestamp).toLocaleString()}</span>
                </div>
              )}

              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 mt-4">
                  Security Badges
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="flex flex-col p-3 rounded-lg bg-[#0a0a14] border border-white/5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                        <Fingerprint className="w-4 h-4 text-slate-400" />
                        Cosign Signature
                      </span>
                      {inspection.hasCosignSignature ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400" />
                      )}
                    </div>
                    {inspection.cosignSignatureTag && (
                      <span className="text-[10px] font-mono text-slate-400 bg-white/5 px-1.5 py-0.5 rounded border border-white/5 truncate">
                        {inspection.cosignSignatureTag}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col p-3 rounded-lg bg-[#0a0a14] border border-white/5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                        <Package className="w-4 h-4 text-slate-400" />
                        SBOM Artifact
                      </span>
                      {inspection.hasSbomArtifact ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400" />
                      )}
                    </div>
                    {inspection.sbomArtifactTag && (
                      <span className="text-[10px] font-mono text-slate-400 bg-white/5 px-1.5 py-0.5 rounded border border-white/5 truncate">
                        {inspection.sbomArtifactTag}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col p-3 rounded-lg bg-[#0a0a14] border border-white/5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-slate-400" />
                        Attestation
                      </span>
                      {inspection.hasAttestation ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-400" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'packages' && (
             <div className="space-y-4">
               <div className="flex items-center justify-between flex-wrap gap-3">
                 <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                   Discovered Packages ({inspection.packages?.length || 0})
                 </div>
                 <div className="relative">
                   <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                   <input
                     type="text"
                     placeholder="Filter packages..."
                     value={packageSearch}
                     onChange={(e) => setPackageSearch(e.target.value)}
                     className="pl-8 pr-3 py-1.5 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs w-64 focus:border-amber-400 focus:outline-none"
                   />
                 </div>
               </div>

               <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                 {filteredPackages.length === 0 ? (
                   <div className="text-center p-8 text-slate-500 text-xs">
                     No packages found.
                   </div>
                 ) : (
                   filteredPackages.map((pkg, idx) => (
                     <div key={idx} className="p-3 rounded-lg bg-[#0a0a14] border border-white/5 flex flex-col gap-2">
                       <div className="flex items-start justify-between gap-3">
                         <div className="flex items-center gap-2 overflow-hidden flex-1">
                           <Bug className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                           <span className="text-sm font-semibold text-white truncate" title={pkg.name}>
                             {pkg.name}
                           </span>
                           <span className="text-xs font-mono text-slate-400 shrink-0">
                             v{pkg.version}
                           </span>
                         </div>
                         <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase shrink-0 ${getTypeBadgeColor(pkg.type)}`}>
                           {pkg.type}
                         </span>
                       </div>
                       
                       <div className="flex items-center gap-4 text-[10px] text-slate-500">
                         {pkg.license && (
                           <span className="flex items-center gap-1" title="License">
                             <FileCode className="w-3 h-3" />
                             {pkg.license}
                           </span>
                         )}
                         {pkg.supplier && (
                           <span className="truncate">Supplier: {pkg.supplier}</span>
                         )}
                       </div>
                       
                       {pkg.purl && (
                         <div className="text-[10px] font-mono text-slate-600 truncate mt-1" title={pkg.purl}>
                           {pkg.purl}
                         </div>
                       )}
                     </div>
                   ))
                 )}
               </div>
             </div>
          )}

          {activeTab === 'raw' && (
            <pre className="p-4 rounded-lg bg-[#0a0a14] border border-white/5 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-96">
              {JSON.stringify(inspection.rawJSON || inspection, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
