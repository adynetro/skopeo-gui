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
  ExternalLink,
  Zap,
  Activity,
  Check,
} from 'lucide-react';
import {
  ImagePlatform,
  PackageVulnerability,
  RegistryCredential,
  SbomInspection,
  SbomPackage,
  VulnerabilityScanResult,
} from '../../../types';

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
  const [isScanningVulns, setIsScanningVulns] = useState(false);
  const [inspection, setInspection] = useState<SbomInspection | null>(null);
  const [activeTab, setActiveTab] = useState<'security' | 'vulnerabilities' | 'packages' | 'platforms' | 'raw'>('security');
  const [packageSearch, setPackageSearch] = useState('');
  const [vulnSearch, setVulnSearch] = useState('');
  const [vulnSeverityFilter, setVulnSeverityFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');

  const currentPreset = PLATFORM_PRESETS[selectedPlatformIndex];

  const doInspect = async (targetRef: string, platformOverride?: { os: string; arch: string; variant?: string }) => {
    setIsInspecting(true);
    try {
      const fullRef = targetRef.includes('://') ? targetRef.trim() : `docker://${targetRef.trim()}`;
      const platformToUse =
        platformOverride !== undefined
          ? platformOverride.os && platformOverride.arch
            ? platformOverride
            : undefined
          : currentPreset.os && currentPreset.arch
          ? { os: currentPreset.os, arch: currentPreset.arch, variant: currentPreset.variant }
          : undefined;

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
    const foundIdx = PLATFORM_PRESETS.findIndex((pr) => pr.os === p.os && pr.arch === p.architecture);
    if (foundIdx >= 0) {
      setSelectedPlatformIndex(foundIdx);
    }
    await doInspect(imageRef, { os: p.os, arch: p.architecture, variant: p.variant });
  };

  const handleScanVulnerabilities = async () => {
    if (!inspection || !inspection.packages || inspection.packages.length === 0) {
      onShowToast('No packages discovered to scan. Run SBOM inspection first.', false);
      return;
    }

    setIsScanningVulns(true);
    try {
      const result: VulnerabilityScanResult = await (window as any).skopeoApi.scanSbomVulnerabilities(
        inspection.imageRef,
        inspection.packages
      );
      setInspection((prev) => (prev ? { ...prev, vulnerabilityScan: result } : prev));
      setActiveTab('vulnerabilities');

      const count = result.summary.total;
      if (count === 0) {
        onShowToast('Vulnerability scan complete: No known CVEs found! 🎉', true);
      } else {
        onShowToast(
          `Vulnerability scan complete: Found ${count} vulnerabilities (${result.summary.critical} Critical, ${result.summary.high} High).`,
          result.summary.critical === 0
        );
      }
    } catch (err: any) {
      onShowToast(err.message || 'Vulnerability scan failed', false);
    } finally {
      setIsScanningVulns(false);
    }
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

  const handleExportVulnReport = () => {
    if (!inspection?.vulnerabilityScan) return;
    const blob = new Blob([JSON.stringify(inspection.vulnerabilityScan, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const sanitized = (inspection.imageRef || 'image').replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `vulnerabilities-${sanitized}-${inspection.architecture || 'amd64'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast('Vulnerability Report JSON downloaded!', true);
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

  const filteredVulns = useMemo(() => {
    if (!inspection?.vulnerabilityScan?.vulnerabilities) return [];
    let list = inspection.vulnerabilityScan.vulnerabilities;

    if (vulnSeverityFilter !== 'ALL') {
      list = list.filter((v) => v.severity === vulnSeverityFilter);
    }

    if (vulnSearch.trim()) {
      const term = vulnSearch.toLowerCase();
      list = list.filter(
        (v) =>
          v.id.toLowerCase().includes(term) ||
          v.packageName.toLowerCase().includes(term) ||
          v.summary.toLowerCase().includes(term) ||
          v.aliases.some((a) => a.toLowerCase().includes(term))
      );
    }

    return list;
  }, [inspection?.vulnerabilityScan?.vulnerabilities, vulnSeverityFilter, vulnSearch]);

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

  const getSeverityBadgeColor = (severity: PackageVulnerability['severity']) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold';
      case 'HIGH':
        return 'bg-orange-500/20 text-orange-300 border-orange-500/40 font-bold';
      case 'MEDIUM':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'LOW':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/40';
      default:
        return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
    }
  };

  const vulnSummary = inspection?.vulnerabilityScan?.summary;

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap pb-4 border-b border-white/[0.08]">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-amber-400" />
            Security, SBOM & Vulnerability Scanner
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Discover Software Bill of Materials (SPDX / CycloneDX), scan packages for known CVEs via Google/OpenSSF OSV database, and verify Cosign signatures across platforms.
          </p>
        </div>

        {inspection && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleScanVulnerabilities}
              disabled={isScanningVulns || !inspection.packages || inspection.packages.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-rose-500 to-amber-500 text-white hover:from-rose-600 hover:to-amber-600 disabled:opacity-50 transition-all shadow-[0_0_15px_rgba(244,63,94,0.3)] hover:scale-[1.02]"
            >
              {isScanningVulns ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Scanning CVEs...</span>
                </>
              ) : (
                <>
                  <Bug className="w-4 h-4" />
                  <span>
                    {inspection.vulnerabilityScan ? 'Re-scan Vulnerabilities' : 'Scan Vulnerabilities (CVEs)'}
                  </span>
                </>
              )}
            </button>
          </div>
        )}
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
                <span>Inspect SBOM & Security</span>
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
              Click any platform to inspect its specific SBOM & vulnerabilities
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
                onClick={() => setActiveTab('vulnerabilities')}
                className={`px-3 py-1 rounded text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  activeTab === 'vulnerabilities'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Bug className="w-3.5 h-3.5 text-rose-400" />
                <span>Vulnerabilities</span>
                {vulnSummary && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold font-mono ${
                      vulnSummary.critical > 0
                        ? 'bg-rose-500/30 text-rose-300 border border-rose-500/40'
                        : vulnSummary.total > 0
                        ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40'
                        : 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
                    }`}
                  >
                    {vulnSummary.total}
                  </span>
                )}
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
                <span>Export SBOM</span>
              </button>
            </div>
          </div>

          {/* TAB 1: Security & Supply Chain */}
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

              {/* Vulnerability CTA Box if not yet scanned */}
              {!inspection.vulnerabilityScan && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-rose-950/40 via-[#16162c] to-amber-950/30 border border-rose-500/30 flex items-center justify-between flex-wrap gap-4">
                  <div className="space-y-1 max-w-xl">
                    <div className="text-sm font-bold text-white flex items-center gap-2">
                      <Bug className="w-4 h-4 text-rose-400" />
                      <span>Security Vulnerability & CVE Scanner</span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Scan all {inspection.packages.length} discovered packages against Google OSV.dev (NVD, GitHub Security Advisories, Debian/Alpine trackers) for known CVEs.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleScanVulnerabilities}
                    disabled={isScanningVulns}
                    className="px-4 py-2 rounded-lg text-xs font-bold bg-rose-500 text-white hover:bg-rose-600 transition-all shadow-[0_0_15px_rgba(244,63,94,0.3)] flex items-center gap-1.5"
                  >
                    {isScanningVulns ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Scanning...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        <span>Run CVE Vulnerability Scan</span>
                      </>
                    )}
                  </button>
                </div>
              )}

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

          {/* TAB 2: Vulnerability Scanner */}
          {activeTab === 'vulnerabilities' && (
            <div className="space-y-4">
              {!inspection.vulnerabilityScan ? (
                <div className="p-8 rounded-xl bg-[#0a0a14] border border-white/5 text-center space-y-4">
                  <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
                    <Bug className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white">Vulnerability Scan Not Yet Run</h3>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      Scan all {inspection.packages.length} discovered SBOM packages against the Google/OpenSSF OSV database to detect CVEs, CVSS scores, and remediation fixed versions.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleScanVulnerabilities}
                    disabled={isScanningVulns}
                    className="px-5 py-2.5 rounded-lg text-xs font-bold bg-rose-500 text-white hover:bg-rose-600 transition-all shadow-[0_0_15px_rgba(244,63,94,0.3)] inline-flex items-center gap-2"
                  >
                    {isScanningVulns ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Scanning Packages...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4" />
                        <span>Start Vulnerability Scan</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Severity Breakdown Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div
                      onClick={() => setVulnSeverityFilter(vulnSeverityFilter === 'CRITICAL' ? 'ALL' : 'CRITICAL')}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        vulnSeverityFilter === 'CRITICAL'
                          ? 'bg-rose-950/60 border-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                          : 'bg-[#0a0a14] border-rose-500/30 hover:border-rose-500/60'
                      }`}
                    >
                      <div className="text-[10px] text-rose-400 uppercase font-bold">Critical</div>
                      <div className="text-xl font-extrabold text-rose-400 mt-0.5 font-mono">
                        {vulnSummary?.critical || 0}
                      </div>
                    </div>

                    <div
                      onClick={() => setVulnSeverityFilter(vulnSeverityFilter === 'HIGH' ? 'ALL' : 'HIGH')}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        vulnSeverityFilter === 'HIGH'
                          ? 'bg-orange-950/60 border-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.3)]'
                          : 'bg-[#0a0a14] border-orange-500/30 hover:border-orange-500/60'
                      }`}
                    >
                      <div className="text-[10px] text-orange-400 uppercase font-bold">High</div>
                      <div className="text-xl font-extrabold text-orange-400 mt-0.5 font-mono">
                        {vulnSummary?.high || 0}
                      </div>
                    </div>

                    <div
                      onClick={() => setVulnSeverityFilter(vulnSeverityFilter === 'MEDIUM' ? 'ALL' : 'MEDIUM')}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        vulnSeverityFilter === 'MEDIUM'
                          ? 'bg-amber-950/60 border-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                          : 'bg-[#0a0a14] border-amber-500/30 hover:border-amber-500/60'
                      }`}
                    >
                      <div className="text-[10px] text-amber-400 uppercase font-bold">Medium</div>
                      <div className="text-xl font-extrabold text-amber-400 mt-0.5 font-mono">
                        {vulnSummary?.medium || 0}
                      </div>
                    </div>

                    <div
                      onClick={() => setVulnSeverityFilter(vulnSeverityFilter === 'LOW' ? 'ALL' : 'LOW')}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        vulnSeverityFilter === 'LOW'
                          ? 'bg-blue-950/60 border-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.3)]'
                          : 'bg-[#0a0a14] border-blue-500/30 hover:border-blue-500/60'
                      }`}
                    >
                      <div className="text-[10px] text-blue-400 uppercase font-bold">Low</div>
                      <div className="text-xl font-extrabold text-blue-400 mt-0.5 font-mono">
                        {vulnSummary?.low || 0}
                      </div>
                    </div>

                    <div
                      onClick={() => setVulnSeverityFilter('ALL')}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        vulnSeverityFilter === 'ALL'
                          ? 'bg-white/10 border-white/30'
                          : 'bg-[#0a0a14] border-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Total Vulnerabilities</div>
                      <div className="text-xl font-extrabold text-white mt-0.5 font-mono">
                        {vulnSummary?.total || 0}
                      </div>
                    </div>
                  </div>

                  {/* Filter & Search Bar */}
                  <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 font-bold uppercase">Filter:</span>
                      {(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((sev) => (
                        <button
                          key={sev}
                          onClick={() => setVulnSeverityFilter(sev)}
                          className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                            vulnSeverityFilter === sev
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-white/5 text-slate-400 hover:text-white border border-white/5'
                          }`}
                        >
                          {sev}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Search CVE ID or package..."
                          value={vulnSearch}
                          onChange={(e) => setVulnSearch(e.target.value)}
                          className="pl-8 pr-3 py-1.5 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs w-64 focus:border-rose-400 focus:outline-none font-mono"
                        />
                      </div>

                      <button
                        onClick={handleExportVulnReport}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-slate-300 hover:text-white flex items-center gap-1"
                        title="Download Vulnerability JSON Report"
                      >
                        <Download className="w-3.5 h-3.5 text-rose-400" />
                        <span>Export Report</span>
                      </button>
                    </div>
                  </div>

                  {/* Vulnerability Items List */}
                  <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                    {filteredVulns.length === 0 ? (
                      <div className="text-center p-8 rounded-lg bg-[#0a0a14] border border-white/5 text-slate-400 text-xs">
                        {vulnSummary?.total === 0
                          ? '🎉 No known vulnerabilities detected for this image!'
                          : `No vulnerabilities matching current filter (${vulnSeverityFilter}).`}
                      </div>
                    ) : (
                      filteredVulns.map((vuln, idx) => (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl bg-[#0a0a14] border border-white/5 hover:border-white/15 transition-all space-y-2"
                        >
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] uppercase border ${getSeverityBadgeColor(
                                  vuln.severity
                                )}`}
                              >
                                {vuln.severity}
                              </span>

                              <span className="text-sm font-bold font-mono text-white flex items-center gap-1">
                                {vuln.id}
                              </span>

                              <button
                                onClick={() => copyToClipboard(vuln.id)}
                                className="p-1 hover:bg-white/10 rounded text-slate-500 hover:text-white"
                                title="Copy CVE ID"
                              >
                                <Copy className="w-3 h-3" />
                              </button>

                              <span className="text-xs text-slate-400">
                                in <strong className="text-slate-200 font-mono">{vuln.packageName}</strong> (v{vuln.packageVersion})
                              </span>
                            </div>

                            {vuln.fixedVersion && (
                              <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-[11px] font-mono font-bold">
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Fixed: {vuln.fixedVersion}</span>
                              </div>
                            )}
                          </div>

                          <p className="text-xs text-slate-300 leading-relaxed">{vuln.summary}</p>

                          <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-white/5 text-[11px] text-slate-500">
                            <div className="flex items-center gap-2 flex-wrap">
                              {vuln.aliases.length > 1 && (
                                <span className="font-mono text-[10px] text-slate-500">
                                  Aliases: {vuln.aliases.slice(0, 3).join(', ')}
                                </span>
                              )}
                              {vuln.score && (
                                <span className="font-mono text-[10px] text-amber-400/80">
                                  Vector: {vuln.score}
                                </span>
                              )}
                            </div>

                            {vuln.referenceUrls && vuln.referenceUrls.length > 0 && (
                              <div className="flex items-center gap-2">
                                <a
                                  href={vuln.referenceUrls[0]}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-cyan-400 hover:underline flex items-center gap-1 text-[11px]"
                                >
                                  <span>Advisory</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Packages */}
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

          {/* TAB 4: Platforms */}
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

          {/* TAB 5: Raw JSON */}
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
