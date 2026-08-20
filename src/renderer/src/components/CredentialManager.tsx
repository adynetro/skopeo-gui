import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  Import,
  Download,
  Copy,
  FileText,
  Terminal,
  HelpCircle,
  FolderOpen,
  ClipboardPaste,
  Sparkles,
  Server,
  Globe,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  FileCode,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  DockerConfigInfo,
  DockerExportResult,
  DockerImportResult,
  RegistryCredential,
  RegistryPreset
} from '../../../types';

interface Props {
  credentials: RegistryCredential[];
  onRefresh: () => void;
  onShowToast: (msg: string, success: boolean) => void;
}

const PRESETS: RegistryPreset[] = [
  {
    name: 'Oracle Cloud Container Registry (OCIR)',
    domain: 'fra.ocir.io',
    description: 'Frankfurt / Europe Region (*.ocir.io)',
    defaultInsecure: false,
    defaultAnonymous: false,
    helpText: 'Username format: <tenancy-namespace>/oracleidentitycloudservice/<user-email> or <tenancy-namespace>/<username>. Password is an OCI Auth Token generated from User Settings.',
    docUrl: 'https://docs.oracle.com/en-us/iaas/Content/Registry/Concepts/registryoverview.htm',
  },
  {
    name: 'Docker Hub',
    domain: 'docker.io',
    description: 'Official Docker Hub Registry',
    defaultInsecure: false,
    defaultAnonymous: false,
    helpText: 'Username is your Docker ID. Password can be an Access Token or account password.',
  },
  {
    name: 'GitHub Packages (GHCR)',
    domain: 'ghcr.io',
    description: 'GitHub Container Registry',
    defaultInsecure: false,
    defaultAnonymous: false,
    helpText: 'Username is your GitHub username. Password must be a Personal Access Token (classic) with "read:packages" / "write:packages".',
  },
  {
    name: 'Quay.io',
    domain: 'quay.io',
    description: 'Red Hat Quay Container Registry',
    defaultInsecure: false,
    defaultAnonymous: true,
    helpText: 'Public images work without credentials. Private repos require username and robot token or password.',
  },
  {
    name: 'AWS Elastic Container Registry (ECR)',
    domain: '123456789012.dkr.ecr.eu-central-1.amazonaws.com',
    description: 'Amazon AWS ECR',
    defaultInsecure: false,
    defaultAnonymous: false,
    helpText: 'Username is usually "AWS". Password is the base64 auth token from "aws ecr get-login-password".',
  },
  {
    name: 'Local / Self-Hosted Insecure Registry',
    domain: 'localhost:5000',
    description: 'Local development or private HTTP registry',
    defaultInsecure: true,
    defaultAnonymous: true,
    helpText: 'Bypasses TLS verification for HTTP or self-signed certs.',
  },
];

export const CredentialManager: React.FC<Props> = ({
  credentials,
  onRefresh,
  onShowToast,
}) => {
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isImportResultModalOpen, setIsImportResultModalOpen] = useState(false);
  const [showDockerGuide, setShowDockerGuide] = useState(false);

  // Form & testing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [pasteContent, setPasteContent] = useState('');

  // Docker config detection & export data
  const [dockerInfo, setDockerInfo] = useState<DockerConfigInfo | null>(null);
  const [importResult, setImportResult] = useState<DockerImportResult | null>(null);
  const [exportData, setExportData] = useState<DockerExportResult | null>(null);
  const [exportTab, setExportTab] = useState<'docker' | 'k8s' | 'base64'>('docker');

  const [formData, setFormData] = useState({
    name: '',
    domain: '',
    username: '',
    password: '',
    insecure: false,
    isAnonymous: false,
  });

  const loadDockerInfo = async () => {
    try {
      const info = await (window as any).skopeoApi.getDockerConfigInfo();
      setDockerInfo(info);
    } catch {
      // Ignore background info failure
    }
  };

  useEffect(() => {
    loadDockerInfo();
  }, []);

  const handleOpenAdd = (preset?: RegistryPreset) => {
    setEditingId(null);
    setTestResult(null);
    setShowPassword(false);
    if (preset) {
      setFormData({
        name: preset.name,
        domain: preset.domain,
        username: '',
        password: '',
        insecure: preset.defaultInsecure,
        isAnonymous: preset.defaultAnonymous,
      });
    } else {
      setFormData({
        name: '',
        domain: '',
        username: '',
        password: '',
        insecure: false,
        isAnonymous: false,
      });
    }
    setIsModalOpen(true);
  };

  const handleOpenEdit = (cred: RegistryCredential) => {
    setEditingId(cred.id);
    setTestResult(null);
    setShowPassword(false);
    setFormData({
      name: cred.name,
      domain: cred.domain,
      username: cred.username || '',
      password: cred.password || '',
      insecure: cred.insecure,
      isAnonymous: cred.isAnonymous,
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.domain.trim()) {
      onShowToast('Name and Registry Domain are required.', false);
      return;
    }

    try {
      await (window as any).skopeoApi.saveCredential({
        id: editingId || undefined,
        name: formData.name.trim(),
        domain: formData.domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, ''),
        username: formData.isAnonymous ? '' : formData.username.trim(),
        password: formData.isAnonymous ? '' : formData.password,
        insecure: formData.insecure,
        isAnonymous: formData.isAnonymous,
      });

      setIsModalOpen(false);
      onRefresh();
      onShowToast(editingId ? 'Registry credential updated.' : 'Registry credential added.', true);
    } catch (err: any) {
      onShowToast(err.message || 'Failed to save credential', false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove "${name}" from your vault?`)) return;
    try {
      await (window as any).skopeoApi.deleteCredential(id);
      onRefresh();
      onShowToast('Registry deleted from vault.', true);
    } catch (err: any) {
      onShowToast(err.message || 'Failed to delete credential', false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await (window as any).skopeoApi.testCredential({
        id: 'test',
        name: formData.name,
        domain: formData.domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, ''),
        username: formData.username.trim(),
        password: formData.password,
        insecure: formData.insecure,
        isAnonymous: formData.isAnonymous,
        createdAt: '',
        updatedAt: '',
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Test failed' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleImportDockerDesktop = async () => {
    setIsImporting(true);
    try {
      const res: DockerImportResult = await (window as any).skopeoApi.importDockerConfig();
      setImportResult(res);
      setIsImportResultModalOpen(true);
      onRefresh();
      loadDockerInfo();
      onShowToast(res.message, res.success);
    } catch (err: any) {
      onShowToast(err.message || 'Error importing Docker auth', false);
    } finally {
      setIsImporting(false);
    }
  };

  const handlePickAndImportFile = async () => {
    try {
      const res: DockerImportResult | null = await (window as any).skopeoApi.pickAndImportDockerFile();
      if (res) {
        setImportResult(res);
        setIsImportResultModalOpen(true);
        onRefresh();
        loadDockerInfo();
        onShowToast(res.message, res.success);
      }
    } catch (err: any) {
      onShowToast(err.message || 'Error importing custom Docker file', false);
    }
  };

  const handleImportPastedJson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pasteContent.trim()) {
      onShowToast('Please paste a valid dockerconfig.json or secret payload', false);
      return;
    }

    try {
      const res: DockerImportResult = await (window as any).skopeoApi.importRawDockerConfig(pasteContent);
      setIsPasteModalOpen(false);
      setPasteContent('');
      setImportResult(res);
      setIsImportResultModalOpen(true);
      onRefresh();
      onShowToast(res.message, res.success);
    } catch (err: any) {
      onShowToast(err.message || 'Failed to import JSON', false);
    }
  };

  const handleOpenExport = async () => {
    try {
      const data: DockerExportResult = await (window as any).skopeoApi.exportDockerConfigJson();
      setExportData(data);
      setIsExportModalOpen(true);
    } catch (err: any) {
      onShowToast(err.message || 'Failed to generate export data', false);
    }
  };

  const handleSaveExportFile = async () => {
    try {
      const res = await (window as any).skopeoApi.exportDockerConfigFile();
      if (res && res.success) {
        onShowToast(`Successfully exported ${res.registriesCount} credentials to ${res.filePath}`, true);
      }
    } catch (err: any) {
      onShowToast(err.message || 'Failed to save file', false);
    }
  };

  const copyToClipboard = (text: string, label = 'Copied to clipboard!') => {
    navigator.clipboard.writeText(text);
    onShowToast(label, true);
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap pb-4 border-b border-white/[0.08]">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-amber-400" />
            Registry Credential Vault
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Securely store, manage, and import registry credentials from macOS Keychain, Docker Desktop, or Kubernetes secrets.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleOpenExport}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 hover:text-white transition-colors"
            title="Export vault to dockerconfig.json or Kubernetes secret"
          >
            <Download className="w-4 h-4 text-cyan-400" />
            <span>Export dockerconfig.json</span>
          </button>

          <button
            onClick={() => handleOpenAdd()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 transition-colors shadow-[0_0_15px_rgba(251,191,36,0.25)]"
          >
            <Plus className="w-4 h-4" />
            <span>Add Custom Registry</span>
          </button>
        </div>
      </div>

      {/* Docker Config & macOS Keychain Integration Card */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-[#14182b] to-[#121226] border border-cyan-500/20 shadow-lg space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  macOS Docker Desktop & Keychain Integration
                </h3>
                {dockerInfo?.exists ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3" />
                    Detected: {dockerInfo.registriesCount} Registries
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-950/60 border border-amber-500/40 text-amber-300 px-2 py-0.5 rounded-full">
                    No config detected
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                {dockerInfo?.path || '~/.docker/config.json'} {dockerInfo?.credsStore ? `• Store: ${dockerInfo.credsStore} helper` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleImportDockerDesktop}
              disabled={isImporting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-500 text-black hover:bg-cyan-400 disabled:opacity-50 transition-colors shadow-[0_0_12px_rgba(6,182,212,0.25)]"
              title="Import all logins stored in macOS Keychain via Docker Desktop"
            >
              {isImporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Import className="w-3.5 h-3.5" />}
              <span>{isImporting ? 'Querying Keychain...' : 'Import from Docker Desktop'}</span>
            </button>

            <button
              onClick={handlePickAndImportFile}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 hover:text-white transition-colors"
              title="Select custom config.json or .dockerconfigjson file from disk"
            >
              <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
              <span>Import File</span>
            </button>

            <button
              onClick={() => setIsPasteModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 hover:text-white transition-colors"
              title="Paste .dockerconfigjson JSON directly"
            >
              <ClipboardPaste className="w-3.5 h-3.5 text-purple-400" />
              <span>Paste JSON</span>
            </button>

            <button
              onClick={() => setShowDockerGuide(!showDockerGuide)}
              className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-colors"
              title="How to get dockerconfig.json on Mac"
            >
              {showDockerGuide ? <ChevronUp className="w-4 h-4" /> : <HelpCircle className="w-4 h-4 text-cyan-300" />}
            </button>
          </div>
        </div>

        {/* Expandable macOS Docker & dockerconfig.json Guide */}
        {showDockerGuide && (
          <div className="pt-3 border-t border-white/10 text-xs space-y-3">
            <div className="p-3 rounded-lg bg-[#0a0a14] border border-cyan-500/20 text-slate-300 space-y-2">
              <div className="font-bold text-cyan-300 flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4" />
                How Docker Credentials & dockerconfig.json Work on macOS:
              </div>
              <ul className="list-disc list-inside space-y-1.5 text-slate-300 pl-1 text-[11px] leading-relaxed">
                <li>
                  <strong className="text-white">Default Location on Mac:</strong> Docker stores its configuration at{' '}
                  <code className="text-amber-300 bg-black/40 px-1 py-0.5 rounded font-mono">~/.docker/config.json</code> (or <code className="text-amber-300 bg-black/40 px-1 py-0.5 rounded font-mono">$DOCKER_CONFIG/config.json</code>).
                </li>
                <li>
                  <strong className="text-white">Why are passwords empty in config.json?</strong> On macOS, Docker Desktop uses the credential helper{' '}
                  <code className="text-cyan-300 bg-black/40 px-1 py-0.5 rounded font-mono">"credsStore": "desktop"</code>. Real passwords are encrypted in your{' '}
                  <strong className="text-white">macOS Keychain</strong>, not in plaintext inside config.json.
                </li>
                <li>
                  <strong className="text-white">How this app extracts them:</strong> Skopeo GUI uses the official Docker helper protocol (calling{' '}
                  <code className="text-emerald-300 bg-black/40 px-1 py-0.5 rounded font-mono">docker-credential-desktop</code>) to securely query and decrypt credentials for all your registries directly into this vault.
                </li>
                <li>
                  <strong className="text-white">Kubernetes / OpenShift Extraction:</strong> If you have an image pull secret in Kubernetes, you can extract it anytime via:
                  <div className="mt-1 p-2 rounded bg-black/60 font-mono text-emerald-400 text-[10px] flex items-center justify-between">
                    <span>kubectl get secret my-pull-secret -o jsonpath='{`{.data.\\.dockerconfigjson}`}' | base64 -d &gt; dockerconfig.json</span>
                    <button
                      onClick={() => copyToClipboard("kubectl get secret my-pull-secret -o jsonpath='{.data.\\.dockerconfigjson}' | base64 -d > dockerconfig.json")}
                      className="text-slate-400 hover:text-white p-1"
                      title="Copy command"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Quick Presets */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          Quick Add from Provider Presets
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {PRESETS.map((preset, i) => (
            <div
              key={i}
              onClick={() => handleOpenAdd(preset)}
              className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-amber-500/30 hover:bg-amber-500/[0.04] transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">
                    {preset.name}
                  </span>
                  <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-400 transition-colors" />
                </div>
                <div className="text-[11px] font-mono text-amber-400/80 mb-1">{preset.domain}</div>
                <p className="text-[11px] text-slate-400 line-clamp-2">{preset.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Vault List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Saved Registries in Vault ({credentials.length})
          </div>
        </div>

        {credentials.length === 0 ? (
          <div className="p-8 rounded-xl border border-dashed border-white/10 text-center text-slate-400 text-xs space-y-3">
            <p>No registries saved in your vault yet.</p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={handleImportDockerDesktop}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-500 text-black hover:bg-cyan-400"
              >
                Import from Docker Desktop
              </button>
              <button
                onClick={() => handleOpenAdd()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-white hover:bg-white/10"
              >
                Add Manually
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {credentials.map((cred) => (
              <div
                key={cred.id}
                className="p-4 rounded-xl bg-[#131326] border border-white/[0.08] hover:border-white/20 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Server className="w-4 h-4 text-amber-400" />
                        {cred.name}
                      </h3>
                      <div className="text-xs font-mono text-amber-400/90 mt-0.5">{cred.domain}</div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(cred)}
                        className="p-1.5 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                        title="Edit registry credentials"
                      >
                        <Lock className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(cred.id, cred.name)}
                        className="p-1.5 rounded-md hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                        title="Delete registry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 my-2">
                    {cred.isAnonymous ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-blue-950/50 border border-blue-500/30 text-blue-300 px-2 py-0.5 rounded-md">
                        <Globe className="w-3 h-3" />
                        Unauthenticated / Anonymous
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-950/50 border border-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded-md">
                        <ShieldCheck className="w-3 h-3" />
                        Auth: {cred.username}
                      </span>
                    )}

                    {cred.insecure && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-950/50 border border-amber-500/30 text-amber-300 px-2 py-0.5 rounded-md">
                        <ShieldAlert className="w-3 h-3" />
                        Insecure TLS
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Add/Edit Registry */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121226] border border-amber-500/30 rounded-2xl w-full max-w-lg shadow-[0_10px_40px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-400" />
                {editingId ? 'Edit Registry Credentials' : 'Add Registry Credentials'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Friendly Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. My Oracle Cloud Frankfurt Registry"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Registry Domain / Host
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. fra.ocir.io, docker.io, ghcr.io"
                  value={formData.domain}
                  onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs font-mono focus:border-amber-400 focus:outline-none"
                />
              </div>

              {/* Anonymous Checkbox */}
              <div className="p-3 rounded-lg bg-white/[0.02] border border-white/10 space-y-2">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isAnonymous}
                    onChange={(e) => setFormData({ ...formData, isAnonymous: e.target.checked })}
                    className="rounded accent-amber-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-white">Unauthenticated / Anonymous Access</span>
                    <p className="text-[11px] text-slate-400">
                      Enable for public registries or open mirrors that do not require login credentials.
                    </p>
                  </div>
                </label>
              </div>

              {!formData.isAnonymous && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Username / Namespace
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. dockeruser or admin"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs font-mono focus:border-amber-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-300">
                        Password / Auth Token
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1"
                      >
                        {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••••••••••"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs font-mono focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                </>
              )}

              {/* Insecure TLS */}
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={formData.insecure}
                  onChange={(e) => setFormData({ ...formData, insecure: e.target.checked })}
                  className="rounded accent-amber-500"
                />
                <span className="text-xs text-slate-300">
                  Allow Insecure TLS (<code className="text-amber-400 text-[11px]">--tls-verify=false</code>)
                </span>
              </label>

              {/* Test Result Message */}
              {testResult && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                    testResult.success
                      ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="break-all">{testResult.message}</div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-white/10">
                <button
                  type="button"
                  disabled={isTesting || !formData.domain}
                  onClick={handleTestConnection}
                  className="px-3 py-2 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 disabled:opacity-50"
                >
                  {isTesting ? 'Testing connection...' : 'Test Connection'}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-lg text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 transition-colors shadow-[0_0_12px_rgba(251,191,36,0.25)]"
                  >
                    Save to Vault
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Paste Raw JSON / Secret */}
      {isPasteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121226] border border-purple-500/30 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <ClipboardPaste className="w-4 h-4 text-purple-400" />
                Import from Raw dockerconfig.json
              </h2>
              <button onClick={() => setIsPasteModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleImportPastedJson} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Paste JSON or Base64 .dockerconfigjson Content
                </label>
                <textarea
                  rows={8}
                  required
                  placeholder={`{\n  "auths": {\n    "quay.io": {\n      "auth": "dXNlcjpwYXNz"\n    }\n  }\n}`}
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                  className="w-full p-3 rounded-lg bg-[#0a0a14] border border-white/10 text-emerald-300 text-xs font-mono focus:border-purple-400 focus:outline-none"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Accepts standard Docker config JSON, OCI auth JSON, or base64-encoded Kubernetes ImagePullSecret payloads.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsPasteModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg text-xs font-bold bg-purple-500 text-white hover:bg-purple-400 transition-colors"
                >
                  Parse & Import
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Import Results Breakdown */}
      {isImportResultModalOpen && importResult && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121226] border border-cyan-500/30 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Import className="w-4 h-4 text-cyan-400" />
                Docker Config Import Summary
              </h2>
              <button onClick={() => setIsImportResultModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div
                className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                  importResult.success
                    ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                    : 'bg-amber-950/40 border-amber-500/30 text-amber-300'
                }`}
              >
                {importResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0" />
                )}
                <span>{importResult.message}</span>
              </div>

              {importResult.details && importResult.details.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Imported Registries ({importResult.details.length})
                  </div>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {importResult.details.map((d, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg bg-[#0a0a14] border border-white/5 flex items-center justify-between text-xs font-mono"
                      >
                        <div>
                          <div className="font-bold text-white">{d.domain}</div>
                          <div className="text-[11px] text-slate-400">User: {d.username} • {d.source}</div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            d.status === 'added'
                              ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300'
                              : 'bg-cyan-950/60 border border-cyan-500/40 text-cyan-300'
                          }`}
                        >
                          {d.status === 'added' ? 'Added' : 'Updated'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-4 border-t border-white/10">
                <button
                  onClick={() => setIsImportResultModalOpen(false)}
                  className="px-5 py-2 rounded-lg text-xs font-bold bg-cyan-500 text-black hover:bg-cyan-400"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Export dockerconfig.json & Kubernetes Secret */}
      {isExportModalOpen && exportData && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121226] border border-cyan-500/30 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Download className="w-4 h-4 text-cyan-400" />
                  Export Registry Vault
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Export {exportData.registriesCount} registry credentials for use with Docker CLI, Skopeo, or Kubernetes.
                </p>
              </div>
              <button onClick={() => setIsExportModalOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Tab Selector */}
              <div className="flex items-center gap-2 bg-[#0a0a14] p-1 rounded-lg border border-white/5">
                <button
                  onClick={() => setExportTab('docker')}
                  className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    exportTab === 'docker'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Standard dockerconfig.json
                </button>
                <button
                  onClick={() => setExportTab('k8s')}
                  className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    exportTab === 'k8s'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Kubernetes Secret YAML
                </button>
                <button
                  onClick={() => setExportTab('base64')}
                  className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    exportTab === 'base64'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Base64 Secret Token
                </button>
              </div>

              {/* Code Preview */}
              <div className="relative">
                <pre className="p-4 rounded-lg bg-[#0a0a14] border border-white/10 text-emerald-400 text-xs font-mono overflow-x-auto max-h-72">
                  {exportTab === 'docker' && exportData.json}
                  {exportTab === 'k8s' && exportData.k8sSecretYaml}
                  {exportTab === 'base64' && exportData.base64DockerConfig}
                </pre>
                <button
                  onClick={() => {
                    const text = exportTab === 'docker'
                      ? exportData.json
                      : exportTab === 'k8s'
                      ? exportData.k8sSecretYaml
                      : exportData.base64DockerConfig;
                    copyToClipboard(text);
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors"
                  title="Copy to clipboard"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-white/10">
                <button
                  onClick={handleSaveExportFile}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-cyan-500 text-black hover:bg-cyan-400 transition-colors shadow-[0_0_12px_rgba(6,182,212,0.25)]"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save to File (dockerconfig.json)</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsExportModalOpen(false)}
                    className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:text-white"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

