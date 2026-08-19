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
  AlertTriangle,
  Monitor,
  Download,
  RefreshCw,
  Layers,
} from 'lucide-react';
import { ImagePlatform, RegistryCredential, SbomInspection, SbomPackage } from '../../../types';

interface Props {
  credentials: RegistryCredential[];
  onShowToast: (msg: string, success: boolean) => void;
}

const PLATFORM_PRESETS = [
  { label: 'linux/amd64 (Linux x86_64 / Servers)', os: 'linux', arch: 'amd64' },
  { label: 'linux/arm64 (Apple Silicon Mac / ARM64)', os: 'linux', arch: 'arm64' },
  { label: 'linux/arm/v7 (ARM 32-bit / IoT)', os: 'linux', arch: 'arm', variant: 'v7' },
  { label: 'linux/ppc64le (PowerPC 64-bit)', os: 'linux', arch: 'ppc64le' },
  { label: 'linux/s390x (IBM Z / Mainframe)', os: 'linux', arch: 's390x' },
  { label: 'linux/riscv64 (RISC-V 64-bit)', os: 'linux', arch: 'riscv64' },
  { label: 'windows/amd64 (Windows Container)', os: 'windows', arch: 'amd64' },
  { label: '(Auto / Host Native)', os: '', arch: '' },
];

export const SbomInspector: React.FC<Props> = ({ credentials, onShowToast }) => {
  const [imageRef, setImageRef] = useState('');
  const [credId, setCredId] = useState('');
  const [insecure, setInsecure] = useState(false);
  const [selectedPlatformIndex, setSelectedPlatformIndex] = useState(0); // default to linux/amd64
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspection, setInspection] = useState<SbomInspection | null>(null);
  const [activeTab, setActiveTab] = useState<'security' | 'packages' | 'platforms' | 'raw'>('security');
  const [packageSearch, setPackageSearch] = useState('');

  const currentPreset = PLATFORM_PRESETS[selectedPlatformIndex];

  const doInspect = async (targetRef: string, platformOverride?: { os: string; arch: string; variant?: string }) => {
    setIsInspecting(true);
    try {
      const fullRef = targetRef.includes('://') ? targetRef.trim() : `docker://${targetRef.trim()}`;
      const platformToUse = platformOverride !== undefined
        ? (platformOverride.os && platformOverride.arch ? platformOverride : undefined)
        : (currentPreset.os && currentPreset.arch ? { os: currentPreset.os, arch: currentPreset.arch, variant: currentPreset.variant } : undefined);

      const data = await (window as any).skopeoApi.inspectSbom(
        fullRef,
        credId || undefined,
        insecure,
        platformToUse
      );
      setInspection(data);
      onShowToast(`SBOM inspection completed for ${data.os || 'linux'}/${data.architecture || 'amd64'}.`, true);
    } catch (err: any) {
      onShowToast(err.message || 'SBOM Inspection failed', false);
    } finally {
      setIsInspecting(false);
    }
  };

  const handleInspect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageRef.trim()) {
      onShowToast('Please specify an image reference', false);
      return;
    }
    await doInspect(imageRef);
  };

  const handleSwitchPlatform = async (p: ImagePlatform) => {
    // Find preset index if match
    const foundIdx = PLATFORM_PRESETS.findIndex((pr) => pr.os === p.os && pr.arch === p.architecture);
    if (foundIdx >= 0) {
      setSelectedPlatformIndex(foundIdx);
    }
    await doInspect(imageRef, { os: p.os, arch: p.architecture, variant: p.variant });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    onShowToast('Copied to clipboard!', true);
  };

  const handleExportJson = () => {
    if (!inspection) return;
    const blob = new Blob([JSON.stringify(inspection.rawJSON || inspection, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const sanitized = (inspection.imageRef || 'image').replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `sbom-${sanitized}-${inspection.architecture || 'amd64'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast('SBOM JSON downloaded!', true);
  };

  const filteredPackages = useMemo(() => {
    if (!inspection?.packages) return [];
    if (!packageSearch) return inspection.packages;

    const term = packageSearch.toLowerCase();
    return inspection.packages.filter(
      (pkg) =>
        pkg.name.toLowerCase().includes(term) ||
        pkg.version.toLowerCase().includes(term) ||
        pkg.type.toLowerCase().includes(term) ||
        (pkg.license && pkg.license.toLowerCase().includes(term))
    );
  }, [inspection?.packages, packageSearch]);

  const getTypeBadgeColor = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('apk') || t.includes('deb') || t.includes('rpm'))
      return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    if (t.includes('npm') || t.includes('node'))
      return 'bg-green-500/20 text-green-300 border-green-500/30';
    if (t.includes('pypi') || t.includes('python'))
      return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
    if (t.includes('go') || t.includes('golang'))
      return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
    if (t.includes('os'))
      return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    if (t.includes('runtime'))
      return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    if (t.includes('library') || t.includes('cargo') || t.includes('rust'))
      return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
    return 'bg-white/10 text-slate-300 border-white/20';
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap pb-4 border-b border-white/[0.08]">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-400" />
            Security & SBOM Inspector
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Discover Software Bill of Materials (SPDX / CycloneDX), supply-chain packages, Cosign signatures, and attestations across all multi-arch platforms.
          </p>
        </div>
      </div>

      {/* Query Form with Target Platform Selector */}
      <form onSubmit={handleInspect} className="p-4 rounded-xl bg-[#131326] border border-white/[0.08] space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Image Reference
            </label>
            <input
              type="text"
              required
              placeholder="e.g. docker.io/library/nginx:latest, ghcr.io/org/app:v1"
              value={imageRef}
              onChange={(e) => setImageRef(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs font-mono focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Target Platform Architecture
            </label>
            <select
              value={selectedPlatformIndex}
              onChange={(e) => setSelectedPlatformIndex(parseInt(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-amber-300 text-xs font-mono focus:border-amber-400 focus:outline-none"
            >
              {PLATFORM_PRESETS.map((p, idx) => (
                <option key={idx} value={idx}>
                  {p.label}
                </option>
              ))}
            </select>
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

          <button
            type="submit"
            disabled={isInspecting || !imageRef.trim()}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-50 transition-colors shadow-[0_0_12px_rgba(251,191,36,0.25)]"
          >
            {isInspecting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Inspecting...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Inspect SBOM</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Multi-Arch Platform Switcher Banner */}
      {inspection && inspection.availablePlatforms && inspection.availablePlatforms.length > 0 && (
        <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-500/20 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-cyan-300">
              <Monitor className="w-4 h-4" />
              <span>Multi-Architecture Image — {inspection.availablePlatforms.length} Platforms Available:</span>
            </div>
            <span className="text-[11px] text-slate-400">
              Click any platform to inspect its specific SBOM & layers
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {inspection.availablePlatforms.map((plat, idx) => {
              const platStr = `${plat.os}/${plat.architecture}${plat.variant ? `/${plat.variant}` : ''}`;
              const isCurrent =
                inspection.os === plat.os && inspection.architecture === plat.architecture;
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={isInspecting || isCurrent}
                  onClick={() => handleSwitchPlatform(plat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 border ${
                    isCurrent
                      ? 'bg-cyan-500 text-black border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                      : 'bg-[#0a0a14] text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/20 hover:border-cyan-400'
                  }`}
                >
                  <Monitor className="w-3 h-3" />
                  <span>{platStr}</span>
                  {isCurrent && <span className="text-[10px] font-bold">(Active)</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Inspection Results */}
      {inspection && (
        <div className="p-5 rounded-xl bg-[#131326] border border-white/[0.08] space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 flex-wrap gap-2">
            <div>
              <h2 className="text-base font-bold text-white font-mono break-all flex items-center gap-2">
                <span>{inspection.imageRef}</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  {inspection.os || 'linux'}/{inspection.architecture || 'amd64'}
                </span>
              </h2>
            </div>

            <div className="flex items-center gap-1 bg-[#0a0a14] p-1 rounded-lg border border-white/5 flex-wrap">
              <button
                onClick={() => setActiveTab('security')}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                  activeTab === 'security'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Security & Supply Chain
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
              {inspection.availablePlatforms && inspection.availablePlatforms.length > 0 && (
                <button
                  onClick={() => setActiveTab('platforms')}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                    activeTab === 'platforms'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Platforms ({inspection.availablePlatforms.length})
                </button>
              )}
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

              <button
                onClick={handleExportJson}
                className="px-2.5 py-1 rounded text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/10 flex items-center gap-1 border border-white/10 ml-1"
                title="Download SBOM JSON"
              >
                <Download className="w-3.5 h-3.5 text-amber-400" />
                <span>Export</span>
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

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-[#0a0a14] border border-white/5">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">Target Platform</div>
                  <div className="text-sm font-bold text-cyan-300 mt-1 font-mono flex items-center gap-1.5">
                    <Monitor className="w-4 h-4 text-cyan-400" />
                    <span>{inspection.os || 'linux'} / {inspection.architecture || 'amd64'}</span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#0a0a14] border border-white/5">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">SBOM Format</div>
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
                  <div className="text-xs font-mono text-slate-300 mt-1 truncate" title={inspection.tool}>
                    {inspection.tool || 'N/A'}
                  </div>
                </div>
              </div>

              {inspection.digest && (
                <div className="p-3 rounded-lg bg-[#0a0a14] border border-white/5 flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Image Digest</div>
                    <div className="text-xs font-mono text-amber-400 truncate mt-0.5">
                      {inspection.digest}
                    </div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(inspection.digest || '')}
                    className="p-1.5 hover:bg-white/10 rounded text-slate-400 hover:text-white ml-2 flex-shrink-0"
                    title="Copy full digest"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {inspection.creationTimestamp && (
                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <span className="font-bold uppercase tracking-wider text-[10px]">Created:</span>
                  <span>{new Date(inspection.creationTimestamp).toLocaleString()}</span>
                </div>
              )}

              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 mt-4">
                  Supply Chain Security Badges
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
                        SBOM Artifact (.sbom)
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
                        Attestation (.att)
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
                  Discovered Packages ({inspection.packages?.length || 0}) for {inspection.os || 'linux'}/{inspection.architecture || 'amd64'}
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filter by name, version, type..."
                    value={packageSearch}
                    onChange={(e) => setPackageSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs w-64 focus:border-amber-400 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                {filteredPackages.length === 0 ? (
                  <div className="text-center p-8 text-slate-500 text-xs">
                    No packages found matching "{packageSearch}".
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
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase shrink-0 ${getTypeBadgeColor(
                            pkg.type
                          )}`}
                        >
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

          {activeTab === 'platforms' && inspection.availablePlatforms && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Available Architectures in Image Index ({inspection.availablePlatforms.length})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {inspection.availablePlatforms.map((p, i) => {
                  const platLabel = `${p.os}/${p.architecture}${p.variant ? `/${p.variant}` : ''}`;
                  const isCurrent =
                    inspection.os === p.os && inspection.architecture === p.architecture;
                  return (
                    <div
                      key={i}
                      className={`p-3 rounded-lg border flex items-center justify-between ${
                        isCurrent
                          ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300'
                          : 'bg-[#0a0a14] border-white/5 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Monitor className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs font-bold font-mono">{platLabel}</span>
                        {isCurrent && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                            Currently Active
                          </span>
                        )}
                      </div>
                      {!isCurrent && (
                        <button
                          type="button"
                          onClick={() => handleSwitchPlatform(p)}
                          className="px-2.5 py-1 rounded text-[11px] font-bold bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20"
                        >
                          Inspect This Platform
                        </button>
                      )}
                    </div>
                  );
                })}
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
