import React, { useState } from 'react';
import {
  KeyRound,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  Import,
  Eye,
  EyeOff,
  Cloud,
  Globe,
  Lock,
  Sparkles,
  Server,
} from 'lucide-react';
import { RegistryCredential, RegistryPreset } from '../../../types';

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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    domain: '',
    username: '',
    password: '',
    insecure: false,
    isAnonymous: false,
  });

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

  const handleImportDocker = async () => {
    try {
      const res = await (window as any).skopeoApi.importDockerConfig();
      onRefresh();
      onShowToast(res.message, res.imported > 0);
    } catch (err: any) {
      onShowToast(err.message || 'Error importing Docker auth', false);
    }
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
            Store and manage credentials for Docker Hub, Oracle Cloud (OCIR), GitHub Packages, or use Anonymous mode for public registries.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleImportDocker}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-slate-200 hover:bg-white/10 hover:text-white transition-colors"
            title="Import ~/.docker/config.json"
          >
            <Import className="w-4 h-4 text-amber-400" />
            <span>Import ~/.docker/config.json</span>
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

      {/* Quick Presets Carousel */}
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
            Saved Registries ({credentials.length})
          </div>
        </div>

        {credentials.length === 0 ? (
          <div className="p-8 rounded-xl border border-dashed border-white/10 text-center text-slate-400 text-xs">
            No registries saved yet. Use the presets above or click "Add Custom Registry".
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
                        title="Edit registry"
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
    </div>
  );
};
