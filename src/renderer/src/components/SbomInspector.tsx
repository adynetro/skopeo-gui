import React, { useState, useMemo, useEffect } from 'react';
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
  Layers,
  Database,
  Server,
} from 'lucide-react';
import {
  ImagePlatform,
  PackageVulnerability,
  RegistryCredential,
  ScannerEngineInfo,
  SbomInspection,
  SbomPackage,
  VulnerabilityDataSource,
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
          `Vulnerability scan complete (${result.scannerEngine}): Found ${count} vulnerabilities (${result.summary.critical} Critical, ${result.summary.high} High).`,
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

  const handleExportCycloneDx = () => {
    if (!inspection) return;
    const sanitized = (inspection.imageRef || 'image').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cycloneDxData = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      serialNumber: `urn:uuid:${Math.random().toString(36).substring(2, 10)}-${Date.now()}`,
      version: 1,
      metadata: {
        timestamp: new Date().toISOString(),
        tools: [
          {
            vendor: 'Skopeo GUI',
            name: 'Skopeo SBOM Engine',
            version: '1.1.1',
          },
        ],
        component: {
          type: 'container',
          name: inspection.imageRef,
          version: inspection.digest || 'latest',
          description: `Container image ${inspection.imageRef} (${inspection.os || 'linux'}/${inspection.architecture || 'amd64'})`,
        },
      },
      components: (inspection.packages || []).map((pkg, idx) => {
        let compType = 'library';
        if (pkg.type === 'os' || pkg.type === 'apk' || pkg.type === 'deb' || pkg.type === 'rpm') {
          compType = 'operating-system';
        } else if (pkg.type === 'runtime' || pkg.type === 'application') {
          compType = 'application';
        }

        return {
          'bom-ref': `pkg:${idx + 1}-${pkg.name}@${pkg.version}`,
          type: compType,
          name: pkg.name,
          version: pkg.version,
          purl: pkg.purl || `pkg:generic/${pkg.name}@${pkg.version}`,
          licenses:
            pkg.license && pkg.license !== 'Unknown' && pkg.license !== 'NOASSERTION'
              ? [{ license: { name: pkg.license } }]
              : undefined,
          supplier: pkg.supplier ? { name: pkg.supplier } : undefined,
        };
      }),
      vulnerabilities: inspection.vulnerabilityScan?.vulnerabilities?.map((v) => ({
        id: v.id,
        source: {
          name: v.id.startsWith('CVE-') ? 'NVD' : v.id.startsWith('GHSA-') ? 'GitHub' : 'OSV',
          url: v.referenceUrls?.[0],
        },
        ratings: [
          {
            severity: v.severity.toLowerCase(),
            score: v.score ? parseFloat(v.score) : undefined,
            method: v.score?.includes('CVSS:3') ? 'CVSSv31' : v.score?.includes('CVSS:2') ? 'CVSSv2' : 'other',
          },
        ],
        description: v.summary,
        detail: v.details,
        recommendation: v.fixedVersion ? `Upgrade to ${v.fixedVersion}` : undefined,
        affects: [{ ref: v.packageName }],
      })),
    };

    const blob = new Blob([JSON.stringify(cycloneDxData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cyclonedx-sbom-${sanitized}-${inspection.architecture || 'amd64'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast('CycloneDX v1.5 SBOM JSON downloaded! 📦', true);
  };

  const handleExportPdfReport = async () => {
    if (!inspection?.vulnerabilityScan) {
      onShowToast('Run vulnerability scan first before exporting PDF report.', false);
      return;
    }

    const scan = inspection.vulnerabilityScan;
    const sanitized = (inspection.imageRef || 'image').replace(/[^a-zA-Z0-9_-]/g, '_');
    const defaultFilename = `security-audit-${sanitized}-${inspection.architecture || 'amd64'}.pdf`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Container Security Audit Report - ${inspection.imageRef}</title>
        <style>
          @page { size: A4; margin: 12mm; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #1e293b;
            background: #ffffff;
            line-height: 1.35;
            font-size: 10px;
            margin: 0;
            padding: 0;
          }
          .header {
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 10px;
            margin-bottom: 14px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }
          .title { font-size: 16px; font-weight: 800; color: #0f172a; margin: 0; }
          .subtitle { font-size: 10px; color: #64748b; margin-top: 2px; }
          .badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: 700;
            font-size: 9px;
            text-transform: uppercase;
          }
          .badge-critical { background: #ffe4e6; color: #e11d48; border: 1px solid #fecdd3; }
          .badge-high { background: #ffedd5; color: #ea580c; border: 1px solid #fed7aa; }
          .badge-medium { background: #fef3c7; color: #d97706; border: 1px solid #fde68a; }
          .badge-low { background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; }
          
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
          .card {
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 6px 10px;
            background: #f8fafc;
          }
          .card-title { font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: #64748b; }
          .card-value { font-size: 16px; font-weight: 800; margin-top: 1px; }
          
          .meta-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 14px;
            font-size: 9.5px;
          }
          .meta-table th, .meta-table td {
            padding: 4px 6px;
            border: 1px solid #e2e8f0;
            text-align: left;
          }
          .meta-table th { background: #f1f5f9; color: #475569; font-weight: 600; width: 20%; }
          .meta-table td { font-family: monospace; }
          
          .table-title { font-size: 12px; font-weight: 700; margin: 14px 0 6px 0; color: #0f172a; }
          .vuln-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9px;
          }
          .vuln-table th, .vuln-table td {
            padding: 5px 6px;
            border: 1px solid #cbd5e1;
            text-align: left;
            vertical-align: top;
          }
          .vuln-table th {
            background: #0f172a;
            color: #ffffff;
            font-weight: 700;
            text-transform: uppercase;
            font-size: 8.5px;
            letter-spacing: 0.4px;
          }
          .vuln-table tr:nth-child(even) { background: #f8fafc; }
          .cve-id { font-family: monospace; font-weight: 700; color: #0f172a; }
          .pkg-name { font-family: monospace; color: #334155; }
          .score { font-weight: 700; color: #0f172a; font-family: monospace; }
          .fix { color: #16a34a; font-weight: 600; font-family: monospace; }
          
          .footer {
            margin-top: 20px;
            padding-top: 6px;
            border-top: 1px solid #e2e8f0;
            font-size: 8.5px;
            color: #94a3b8;
            display: flex;
            justify-content: space-between;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">Container Security Audit & Vulnerability Report</h1>
            <div class="subtitle">Generated by Skopeo GUI Security Inspector • Scanner Engine: ${scan.scannerEngine}</div>
          </div>
          <div style="text-align: right;">
            <span class="badge ${scan.summary.critical > 0 ? 'badge-critical' : scan.summary.high > 0 ? 'badge-high' : 'badge-low'}">
              ${scan.summary.critical > 0 ? 'CRITICAL RISK' : scan.summary.high > 0 ? 'HIGH RISK' : 'LOW / PASS'}
            </span>
            <div style="font-size: 8.5px; color: #64748b; margin-top: 3px;">${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</div>
          </div>
        </div>

        <table class="meta-table">
          <tr>
            <th>Image Reference</th>
            <td>${inspection.imageRef}</td>
            <th>Digest</th>
            <td>${inspection.digest || 'N/A'}</td>
          </tr>
          <tr>
            <th>Target Platform</th>
            <td>${inspection.os || 'linux'} / ${inspection.architecture || 'amd64'}</td>
            <th>Scanned Packages</th>
            <td>${scan.scannedPackagesCount} packages inspected (${inspection.format})</td>
          </tr>
          <tr>
            <th>Cosign Signature</th>
            <td>${inspection.hasCosignSignature ? '✓ Verified (' + (inspection.cosignSignatureTag || 'signed') + ')' : '✗ Not Signed'}</td>
            <th>SBOM Format</th>
            <td>${inspection.format} (${inspection.tool || 'Skopeo'})</td>
          </tr>
        </table>

        <div class="grid">
          <div class="card" style="border-left: 3px solid #e11d48;">
            <div class="card-title" style="color: #e11d48;">Critical</div>
            <div class="card-value" style="color: #e11d48;">${scan.summary.critical}</div>
          </div>
          <div class="card" style="border-left: 3px solid #ea580c;">
            <div class="card-title" style="color: #ea580c;">High</div>
            <div class="card-value" style="color: #ea580c;">${scan.summary.high}</div>
          </div>
          <div class="card" style="border-left: 3px solid #d97706;">
            <div class="card-title" style="color: #d97706;">Medium</div>
            <div class="card-value" style="color: #d97706;">${scan.summary.medium}</div>
          </div>
          <div class="card" style="border-left: 3px solid #0284c7;">
            <div class="card-title" style="color: #0284c7;">Low / Total</div>
            <div class="card-value" style="color: #0284c7;">${scan.summary.low} / ${scan.summary.total}</div>
          </div>
        </div>

        <div class="table-title">Identified Vulnerabilities (${scan.vulnerabilities.length})</div>
        <table class="vuln-table">
          <thead>
            <tr>
              <th style="width: 65px;">Severity</th>
              <th style="width: 110px;">Vulnerability ID</th>
              <th style="width: 120px;">Package & Version</th>
              <th style="width: 65px;">CVSS</th>
              <th style="width: 90px;">Fixed In</th>
              <th>Summary & Remediation</th>
            </tr>
          </thead>
          <tbody>
            ${scan.vulnerabilities
              .map(
                (v) => `
              <tr>
                <td><span class="badge badge-${v.severity.toLowerCase()}">${v.severity}</span></td>
                <td class="cve-id">${v.id}</td>
                <td class="pkg-name"><strong>${v.packageName}</strong><br><span style="color: #64748b;">${v.packageVersion}</span></td>
                <td class="score">${v.score || 'N/A'}</td>
                <td class="fix">${v.fixedVersion || 'Unfixed'}</td>
                <td>
                  <div style="font-weight: 600; color: #1e293b;">${v.summary}</div>
                  ${v.details ? `<div style="font-size: 8px; color: #64748b; margin-top: 2px;">${v.details.substring(0, 150)}...</div>` : ''}
                </td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>

        <div class="footer">
          <div>Skopeo GUI • Container Security Audit Report</div>
          <div>Confidential Security Assessment</div>
        </div>
      </body>
      </html>
    `;

    try {
      const res = await (window as any).skopeoApi.exportPdfReport(defaultFilename, htmlContent);
      if (res && res.success) {
        onShowToast(`Security Audit PDF Report saved to ${res.filePath}! 📕`, true);
      }
    } catch (err: any) {
      onShowToast(err.message || 'Failed to export PDF report', false);
    }
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
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleScanVulnerabilities}
              disabled={isScanningVulns || !inspection.packages || inspection.packages.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-gradient-to-r from-rose-500 to-amber-500 text-white hover:from-rose-600 hover:to-amber-600 disabled:opacity-50 transition-all shadow-[0_0_15px_rgba(244,63,94,0.3)] hover:scale-[1.02]"
            >
              {isScanningVulns ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Scanning Vulnerabilities...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  <span>Scan for Vulnerabilities</span>
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
                <div className="p-8 rounded-xl bg-[#0a0a14] border border-white/5 text-center space-y-5">
                  <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
                    <Bug className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white">Vulnerability Audit & Security Feeds</h3>
                    <p className="text-xs text-slate-400 max-w-lg mx-auto">
                      Scan all {inspection.packages.length} packages discovered in this image (including OS libraries and layer files) against multiple vulnerability datasources.
                    </p>
                  </div>

                  {/* Engine Feature Summary Card */}
                  <div className="max-w-md mx-auto p-3.5 rounded-lg bg-[#131326] border border-white/10 text-left space-y-1.5">
                    <div className="flex items-center gap-2 text-emerald-300 text-xs font-semibold">
                      <Shield className="w-4 h-4 text-emerald-400" />
                      <span>Built-in Multi-Datasource Security Engine</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Cross-references Red Hat Security Data, Debian Security Tracker, Ubuntu Security Notices, Alpine SecDB, NVD, and GitHub Advisory Database with precise CVSS v3.1 mathematical scoring.
                    </p>
                  </div>


                  <button
                    type="button"
                    onClick={handleScanVulnerabilities}
                    disabled={isScanningVulns}
                    className="px-6 py-2.5 rounded-lg text-xs font-bold bg-rose-500 text-white hover:bg-rose-600 transition-all shadow-[0_0_15px_rgba(244,63,94,0.3)] inline-flex items-center gap-2 hover:scale-[1.02]"
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
                  {/* Engine & Scope Info Banner */}
                  <div className="p-3.5 rounded-xl bg-[#131326] border border-white/10 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                        <Shield className="w-3.5 h-3.5 text-emerald-400" />
                        Engine: {inspection.vulnerabilityScan.scannerEngine}
                      </span>
                      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-slate-300 text-xs font-mono">
                        <Layers className="w-3.5 h-3.5 text-blue-400" />
                        {inspection.packages.length} Packages Inspected ({inspection.format === 'Layer-Inspection' ? 'Image Layers: APK/DPKG/RPM' : inspection.format})
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleScanVulnerabilities}
                        disabled={isScanningVulns}
                        className="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30 flex items-center gap-1.5 transition-all"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isScanningVulns ? 'animate-spin' : ''}`} />
                        <span>Re-scan</span>
                      </button>
                    </div>
                  </div>


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

                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Search CVE ID or package..."
                          value={vulnSearch}
                          onChange={(e) => setVulnSearch(e.target.value)}
                          className="pl-8 pr-3 py-1.5 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs w-52 focus:border-rose-400 focus:outline-none font-mono"
                        />
                      </div>

                      <button
                        onClick={handleExportPdfReport}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500 hover:text-white flex items-center gap-1.5 transition-all shadow-[0_0_10px_rgba(244,63,94,0.2)]"
                        title="Export Professional Security Audit PDF Report"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export PDF Report 📕</span>
                      </button>

                      <button
                        onClick={handleExportCycloneDx}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-slate-300 hover:text-white flex items-center gap-1"
                        title="Export CycloneDX v1.5 with Vulnerability Extensions (VEX)"
                      >
                        <Download className="w-3.5 h-3.5 text-amber-400" />
                        <span>CycloneDX JSON</span>
                      </button>

                      <button
                        onClick={handleExportVulnReport}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-slate-300 hover:text-white flex items-center gap-1"
                        title="Download Vulnerability JSON Report"
                      >
                        <Download className="w-3.5 h-3.5 text-blue-400" />
                        <span>JSON</span>
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
                                <span className="inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-amber-300">
                                  <span>CVSS:</span>
                                  <strong>{vuln.score}</strong>
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
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Filter by name, version, type..."
                      value={packageSearch}
                      onChange={(e) => setPackageSearch(e.target.value)}
                      className="pl-8 pr-3 py-1.5 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs w-52 focus:border-amber-400 focus:outline-none font-mono"
                    />
                  </div>

                  <button
                    onClick={handleExportCycloneDx}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-slate-300 hover:text-white flex items-center gap-1"
                    title="Export official CycloneDX v1.5 JSON SBOM"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-400" />
                    <span>Export CycloneDX</span>
                  </button>

                  <button
                    onClick={handleExportJson}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-slate-300 hover:text-white flex items-center gap-1"
                    title="Export Raw SBOM JSON"
                  >
                    <Download className="w-3.5 h-3.5 text-blue-400" />
                    <span>Export JSON</span>
                  </button>
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
