import React, { useState, useEffect } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  FileCheck,
  PenTool,
  Copy,
  Download,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ExternalLink,
  AlertTriangle,
  Lock,
  Eye,
  EyeOff,
  Check,
  Zap,
  Monitor,
} from 'lucide-react';
import { CosignKeyPair, CosignSignResult, CosignVerificationResult, RegistryCredential } from '../../../types';

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
  { label: '(Multi-Arch Root Index / Auto)', os: '', arch: '' },
];

export const CosignManager: React.FC<Props> = ({ credentials, onShowToast }) => {
  const [activeSubTab, setActiveSubTab] = useState<'verify' | 'sign' | 'keys'>('verify');
  const [keys, setKeys] = useState<CosignKeyPair[]>([]);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);

  // Verification state
  const [verifyImageRef, setVerifyImageRef] = useState('');
  const [verifyCredId, setVerifyCredId] = useState('');
  const [verifyInsecure, setVerifyInsecure] = useState(false);
  const [verifyPlatformIndex, setVerifyPlatformIndex] = useState(0); // default linux/amd64
  const [verifyKeyMode, setVerifyKeyMode] = useState<'vault' | 'custom' | 'keyless'>('vault');
  const [selectedVerifyKeyId, setSelectedVerifyKeyId] = useState('');
  const [customPublicKey, setCustomPublicKey] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<CosignVerificationResult | null>(null);

  // Signing state
  const [signImageRef, setSignImageRef] = useState('');
  const [signCredId, setSignCredId] = useState('');
  const [signInsecure, setSignInsecure] = useState(false);
  const [signPlatformIndex, setSignPlatformIndex] = useState(0); // default linux/amd64
  const [signKeyMode, setSignKeyMode] = useState<'vault' | 'custom'>('vault');
  const [selectedSignKeyId, setSelectedSignKeyId] = useState('');
  const [customPrivateKey, setCustomPrivateKey] = useState('');
  const [annotations, setAnnotations] = useState<{ key: string; value: string }[]>([
    { key: 'org.opencontainers.image.source', value: 'Skopeo GUI' },
  ]);
  const [isSigning, setIsSigning] = useState(false);
  const [signResult, setSignResult] = useState<CosignSignResult | null>(null);

  // Key Generation state
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyAlgorithm, setNewKeyAlgorithm] = useState<'ECDSA_P256' | 'ED25519'>('ECDSA_P256');
  const [showGenerateModal, setShowGenerateModal] = useState(false);

  const loadKeys = async () => {
    setIsLoadingKeys(true);
    try {
      if ((window as any).skopeoApi?.getCosignKeys) {
        const list = await (window as any).skopeoApi.getCosignKeys();
        setKeys(list);
        if (list.length > 0) {
          if (!selectedVerifyKeyId) setSelectedVerifyKeyId(list[0].id);
          if (!selectedSignKeyId) setSelectedSignKeyId(list[0].id);
        }
      }
    } catch (err: any) {
      console.error('Failed to load Cosign keys:', err);
    } finally {
      setIsLoadingKeys(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyImageRef.trim()) {
      onShowToast('Please enter an image reference to verify.', false);
      return;
    }

    setIsVerifying(true);
    setVerificationResult(null);

    let pubKeyToUse: string | undefined = undefined;
    if (verifyKeyMode === 'vault') {
      const selected = keys.find((k) => k.id === selectedVerifyKeyId);
      pubKeyToUse = selected?.publicKey;
    } else if (verifyKeyMode === 'custom') {
      pubKeyToUse = customPublicKey;
    }

    const currentPreset = PLATFORM_PRESETS[verifyPlatformIndex];
    const platformToUse = currentPreset.os && currentPreset.arch
      ? { os: currentPreset.os, arch: currentPreset.arch, variant: currentPreset.variant }
      : undefined;

    try {
      const result: CosignVerificationResult = await (window as any).skopeoApi.verifyCosignSignature(
        verifyImageRef.trim(),
        pubKeyToUse,
        verifyCredId || undefined,
        verifyInsecure,
        platformToUse
      );
      setVerificationResult(result);
      if (result.verified) {
        onShowToast(`Cosign signature verified for ${result.os || 'linux'}/${result.architecture || 'amd64'}! 🛡️`, true);
      } else {
        onShowToast(result.error || 'Verification failed.', false);
      }
    } catch (err: any) {
      onShowToast(err.message || 'Verification error', false);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signImageRef.trim()) {
      onShowToast('Please enter an image reference to sign.', false);
      return;
    }

    let privKeyToUse = '';
    if (signKeyMode === 'vault') {
      const selected = keys.find((k) => k.id === selectedSignKeyId);
      privKeyToUse = selected?.privateKey || '';
    } else {
      privKeyToUse = customPrivateKey;
    }

    if (!privKeyToUse.trim()) {
      onShowToast('Private key is required to sign images.', false);
      return;
    }

    setIsSigning(true);
    setSignResult(null);

    const annotationMap: Record<string, string> = {};
    annotations.forEach((a) => {
      if (a.key.trim()) {
        annotationMap[a.key.trim()] = a.value.trim();
      }
    });

    const currentPreset = PLATFORM_PRESETS[signPlatformIndex];
    const platformToUse = currentPreset.os && currentPreset.arch
      ? { os: currentPreset.os, arch: currentPreset.arch, variant: currentPreset.variant }
      : undefined;

    try {
      const result: CosignSignResult = await (window as any).skopeoApi.signCosignImage(
        signImageRef.trim(),
        privKeyToUse,
        annotationMap,
        signCredId || undefined,
        signInsecure,
        platformToUse
      );
      setSignResult(result);
      onShowToast(`Image signed for ${result.os || 'linux'}/${result.architecture || 'amd64'}! Tag: ${result.signatureTag}`, true);
    } catch (err: any) {
      onShowToast(err.message || 'Signing failed.', false);
    } finally {
      setIsSigning(false);
    }
  };

  const handleGenerateKey = async () => {
    setIsGeneratingKey(true);
    try {
      const created = await (window as any).skopeoApi.generateCosignKeyPair(
        newKeyName || undefined,
        newKeyAlgorithm
      );
      await loadKeys();
      setShowGenerateModal(false);
      setNewKeyName('');
      onShowToast(`New Cosign key pair "${created.name}" generated in vault!`, true);
    } catch (err: any) {
      onShowToast(err.message || 'Failed to generate key pair', false);
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const handleDeleteKey = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete Cosign key "${name}" from your vault?`)) return;
    try {
      await (window as any).skopeoApi.deleteCosignKey(id);
      await loadKeys();
      onShowToast('Key deleted from vault.', true);
    } catch (err: any) {
      onShowToast(err.message || 'Failed to delete key', false);
    }
  };

  const copyToClipboard = (text: string, msg: string = 'Copied to clipboard!') => {
    navigator.clipboard.writeText(text);
    onShowToast(msg, true);
  };

  const downloadFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast(`Downloaded ${filename}`, true);
  };

  const addAnnotationRow = () => {
    setAnnotations([...annotations, { key: '', value: '' }]);
  };

  const updateAnnotationRow = (index: number, field: 'key' | 'value', val: string) => {
    const updated = [...annotations];
    updated[index][field] = val;
    setAnnotations(updated);
  };

  const removeAnnotationRow = (index: number) => {
    setAnnotations(annotations.filter((_, i) => i !== index));
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap pb-4 border-b border-white/[0.08]">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-amber-400" />
            Cosign & Image Signing
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Native container image signing, cryptographic signature verification, and multi-architecture key management compatible with Sigstore Cosign standards.
          </p>
        </div>

        <div className="flex items-center gap-1 bg-[#131326] p-1 rounded-xl border border-white/10">
          <button
            onClick={() => setActiveSubTab('verify')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeSubTab === 'verify'
                ? 'bg-amber-500 text-black font-bold shadow-[0_0_10px_rgba(251,191,36,0.3)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Verify Signature</span>
          </button>

          <button
            onClick={() => setActiveSubTab('sign')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeSubTab === 'sign'
                ? 'bg-amber-500 text-black font-bold shadow-[0_0_10px_rgba(251,191,36,0.3)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <PenTool className="w-4 h-4" />
            <span>Sign Image</span>
          </button>

          <button
            onClick={() => setActiveSubTab('keys')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeSubTab === 'keys'
                ? 'bg-amber-500 text-black font-bold shadow-[0_0_10px_rgba(251,191,36,0.3)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>Key Vault ({keys.length})</span>
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: VERIFY SIGNATURE */}
      {activeSubTab === 'verify' && (
        <div className="space-y-6">
          <form onSubmit={handleVerify} className="p-5 rounded-xl bg-[#131326] border border-white/[0.08] space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Verify Remote Image Signature</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Image Reference
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. docker.io/library/nginx:latest, ghcr.io/org/app:v1, quay.io/myorg/app:tag"
                  value={verifyImageRef}
                  onChange={(e) => setVerifyImageRef(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs font-mono focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Target Architecture
                </label>
                <select
                  value={verifyPlatformIndex}
                  onChange={(e) => setVerifyPlatformIndex(parseInt(e.target.value))}
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
                  value={verifyCredId}
                  onChange={(e) => setVerifyCredId(e.target.value)}
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

            {/* Verification Key Selection Mode */}
            <div className="space-y-2 pt-1">
              <label className="block text-[11px] font-semibold text-slate-300">
                Verification Key Mode
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setVerifyKeyMode('vault')}
                  className={`p-2.5 rounded-lg border text-left text-xs transition-all ${
                    verifyKeyMode === 'vault'
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 font-semibold'
                      : 'bg-[#0a0a14] border-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="font-bold flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>From Key Vault</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Use stored public key</div>
                </button>

                <button
                  type="button"
                  onClick={() => setVerifyKeyMode('custom')}
                  className={`p-2.5 rounded-lg border text-left text-xs transition-all ${
                    verifyKeyMode === 'custom'
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 font-semibold'
                      : 'bg-[#0a0a14] border-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="font-bold flex items-center gap-1.5">
                    <Copy className="w-3.5 h-3.5" />
                    <span>Paste Custom Key</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Custom PEM public key</div>
                </button>

                <button
                  type="button"
                  onClick={() => setVerifyKeyMode('keyless')}
                  className={`p-2.5 rounded-lg border text-left text-xs transition-all ${
                    verifyKeyMode === 'keyless'
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 font-semibold'
                      : 'bg-[#0a0a14] border-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Structural / Keyless</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Verify signature payload & claims</div>
                </button>
              </div>

              {verifyKeyMode === 'vault' && (
                <div className="pt-1">
                  <select
                    value={selectedVerifyKeyId}
                    onChange={(e) => setSelectedVerifyKeyId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs font-mono"
                  >
                    {keys.length === 0 ? (
                      <option value="">No keys in vault. Generate a key in Key Vault tab.</option>
                    ) : (
                      keys.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.name} ({k.algorithm})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}

              {verifyKeyMode === 'custom' && (
                <div className="pt-1">
                  <textarea
                    rows={3}
                    placeholder="-----BEGIN PUBLIC KEY-----&#10;...&#10;-----END PUBLIC KEY-----"
                    value={customPublicKey}
                    onChange={(e) => setCustomPublicKey(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs font-mono focus:border-amber-400 focus:outline-none"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={verifyInsecure}
                  onChange={(e) => setVerifyInsecure(e.target.checked)}
                  className="rounded accent-amber-500"
                />
                <span className="text-slate-300">Allow Insecure TLS (--tls-verify=false)</span>
              </label>

              <button
                type="submit"
                disabled={isVerifying || !verifyImageRef.trim()}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-50 transition-all shadow-[0_0_12px_rgba(251,191,36,0.25)]"
              >
                {isVerifying ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Verify Signature</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Verification Result Card */}
          {verificationResult && (
            <div className="p-5 rounded-xl bg-[#131326] border border-white/[0.08] space-y-4">
              <div
                className={`p-4 rounded-xl border flex items-start gap-3.5 ${
                  verificationResult.verified
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                    : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                }`}
              >
                {verificationResult.verified ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="text-base font-bold flex items-center gap-2">
                    <span>
                      {verificationResult.verified
                        ? 'Cosign Signature Valid & Verified'
                        : 'Verification Failed'}
                    </span>
                    {verificationResult.architecture && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        {verificationResult.os || 'linux'}/{verificationResult.architecture}
                      </span>
                    )}
                  </div>
                  <div className="text-xs opacity-90 font-mono break-all">
                    {verificationResult.verified
                      ? `Image digest matches the signed Cosign payload: ${verificationResult.digest}`
                      : verificationResult.error}
                  </div>
                </div>
              </div>

              {/* Details grid */}
              {verificationResult.payload && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-lg bg-[#0a0a14] border border-white/5">
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Target Platform</div>
                      <div className="text-xs font-mono text-cyan-300 mt-1 flex items-center gap-1">
                        <Monitor className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{verificationResult.os || 'linux'} / {verificationResult.architecture || 'amd64'}</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-[#0a0a14] border border-white/5">
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Signature Tag</div>
                      <div className="text-xs font-mono text-amber-300 mt-1 truncate">
                        {verificationResult.signatureTag}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-[#0a0a14] border border-white/5">
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Signed At</div>
                      <div className="text-xs font-mono text-slate-300 mt-1">
                        {verificationResult.signedAt ? new Date(verificationResult.signedAt).toLocaleString() : 'N/A'}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-[#0a0a14] border border-white/5">
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Algorithm / Type</div>
                      <div className="text-xs font-mono text-cyan-300 mt-1">
                        {verificationResult.algorithm || 'ECDSA P-256'}
                      </div>
                    </div>
                  </div>

                  {/* Certificate / Identity Details if available */}
                  {verificationResult.certificateDetails && (
                    <div className="p-3.5 rounded-lg bg-[#0a0a14] border border-white/5 space-y-1.5 text-xs">
                      <div className="text-[10px] text-slate-400 uppercase font-bold">X.509 Certificate Chain Details</div>
                      <div className="text-slate-300">
                        <strong className="text-slate-400">Subject:</strong> {verificationResult.certificateDetails.subject || 'N/A'}
                      </div>
                      <div className="text-slate-300">
                        <strong className="text-slate-400">Issuer:</strong> {verificationResult.certificateDetails.issuer || 'N/A'}
                      </div>
                      {verificationResult.certificateDetails.sanList && (
                        <div className="text-slate-300">
                          <strong className="text-slate-400">SANs:</strong> {verificationResult.certificateDetails.sanList.join(', ')}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Claims / Payload Viewer */}
                  <div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Decoded Cosign SimpleSigning Payload
                    </div>
                    <pre className="p-4 rounded-lg bg-[#0a0a14] border border-white/5 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-64">
                      {JSON.stringify(verificationResult.payload, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 2: SIGN IMAGE */}
      {activeSubTab === 'sign' && (
        <div className="space-y-6">
          <form onSubmit={handleSign} className="p-5 rounded-xl bg-[#131326] border border-white/[0.08] space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <PenTool className="w-4 h-4 text-amber-400" />
              <span>Sign Container Image & Push Signature</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Image Reference to Sign
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. docker.io/myorg/myapp:v1.0.0, docker.io/myorg/myrepo:tag"
                  value={signImageRef}
                  onChange={(e) => setSignImageRef(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs font-mono focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Target Architecture
                </label>
                <select
                  value={signPlatformIndex}
                  onChange={(e) => setSignPlatformIndex(parseInt(e.target.value))}
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
                  Registry Credential (with write access)
                </label>
                <select
                  value={signCredId}
                  onChange={(e) => setSignCredId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs"
                >
                  <option value="">(Custom / Anonymous / Default)</option>
                  {credentials.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.domain})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Signing Key Selection */}
            <div className="space-y-2 pt-1">
              <label className="block text-[11px] font-semibold text-slate-300">
                Signing Private Key
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSignKeyMode('vault')}
                  className={`p-2.5 rounded-lg border text-left text-xs transition-all ${
                    signKeyMode === 'vault'
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 font-semibold'
                      : 'bg-[#0a0a14] border-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="font-bold flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>From Key Vault</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Use stored private key</div>
                </button>

                <button
                  type="button"
                  onClick={() => setSignKeyMode('custom')}
                  className={`p-2.5 rounded-lg border text-left text-xs transition-all ${
                    signKeyMode === 'custom'
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 font-semibold'
                      : 'bg-[#0a0a14] border-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="font-bold flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Paste Custom Key</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Paste PEM private key</div>
                </button>
              </div>

              {signKeyMode === 'vault' && (
                <div className="pt-1">
                  <select
                    value={selectedSignKeyId}
                    onChange={(e) => setSelectedSignKeyId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs font-mono"
                  >
                    {keys.length === 0 ? (
                      <option value="">No keys in vault. Generate one in Key Vault tab first.</option>
                    ) : (
                      keys.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.name} ({k.algorithm})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}

              {signKeyMode === 'custom' && (
                <div className="pt-1">
                  <textarea
                    rows={4}
                    placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                    value={customPrivateKey}
                    onChange={(e) => setCustomPrivateKey(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs font-mono focus:border-amber-400 focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* Custom Annotations */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-semibold text-slate-300">
                  Signature Annotations & Claims (Optional)
                </label>
                <button
                  type="button"
                  onClick={addAnnotationRow}
                  className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Claim</span>
                </button>
              </div>

              <div className="space-y-2">
                {annotations.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Key (e.g. build-id, git-sha, env)"
                      value={row.key}
                      onChange={(e) => updateAnnotationRow(idx, 'key', e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs font-mono"
                    />
                    <input
                      type="text"
                      placeholder="Value"
                      value={row.value}
                      onChange={(e) => updateAnnotationRow(idx, 'value', e.target.value)}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => removeAnnotationRow(idx)}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={signInsecure}
                  onChange={(e) => setSignInsecure(e.target.checked)}
                  className="rounded accent-amber-500"
                />
                <span className="text-slate-300">Allow Insecure TLS (--tls-verify=false)</span>
              </label>

              <button
                type="submit"
                disabled={isSigning || !signImageRef.trim()}
                className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-xs font-bold bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 transition-all shadow-[0_0_15px_rgba(251,191,36,0.3)]"
              >
                {isSigning ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Signing & Uploading...</span>
                  </>
                ) : (
                  <>
                    <PenTool className="w-4 h-4" />
                    <span>Sign & Push Signature</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Sign Result Card */}
          {signResult && (
            <div className="p-5 rounded-xl bg-[#131326] border border-white/[0.08] space-y-3">
              <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 flex items-start gap-3.5">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1 flex-1">
                  <div className="text-base font-bold flex items-center gap-2">
                    <span>Image Signed Successfully!</span>
                    {signResult.architecture && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        {signResult.os || 'linux'}/{signResult.architecture}
                      </span>
                    )}
                  </div>
                  <p className="text-xs opacity-90 font-mono break-all">
                    Signature artifact uploaded to registry under tag:{' '}
                    <strong className="text-emerald-300">{signResult.signatureTag}</strong>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
                <div className="p-3 rounded-lg bg-[#0a0a14] border border-white/5">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Target Platform</span>
                  <span className="text-cyan-300 truncate block mt-0.5 flex items-center gap-1">
                    <Monitor className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{signResult.os || 'linux'} / {signResult.architecture || 'amd64'}</span>
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-[#0a0a14] border border-white/5">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Signed Image Digest</span>
                  <span className="text-amber-300 truncate block mt-0.5">{signResult.digest}</span>
                </div>
                <div className="p-3 rounded-lg bg-[#0a0a14] border border-white/5">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Signature Timestamp</span>
                  <span className="text-slate-300 block mt-0.5">{new Date(signResult.signedAt).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUB-TAB 3: KEY VAULT */}
      {activeSubTab === 'keys' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-400" />
                <span>Cosign Key Pairs in Vault ({keys.length})</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Private keys are securely encrypted on disk using machine-bound AES-256-CBC.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowGenerateModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 transition-all shadow-[0_0_12px_rgba(251,191,36,0.25)]"
            >
              <Plus className="w-4 h-4" />
              <span>Generate Key Pair</span>
            </button>
          </div>

          {/* Key List */}
          {keys.length === 0 ? (
            <div className="p-8 rounded-xl bg-[#131326] border border-white/5 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
                <KeyRound className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white">No Cosign Keys Found</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Generate an ECDSA P-256 or Ed25519 key pair to start signing container images directly in Skopeo GUI.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGenerateModal(true)}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 transition-all"
              >
                Generate First Key Pair
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {keys.map((k) => (
                <div
                  key={k.id}
                  className="p-4 rounded-xl bg-[#131326] border border-white/[0.08] hover:border-white/20 transition-all space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 min-w-0">
                      <h3 className="text-sm font-bold text-white truncate">{k.name}</h3>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold uppercase">
                          {k.algorithm}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {new Date(k.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteKey(k.id, k.name)}
                      className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-400"
                      title="Delete Key Pair"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[#0a0a14] border border-white/5 space-y-1 font-mono text-[11px]">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Public Key (PEM):</span>
                      <button
                        onClick={() => copyToClipboard(k.publicKey, 'Public key copied to clipboard!')}
                        className="text-amber-400 hover:underline flex items-center gap-1 text-[10px]"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </button>
                    </div>
                    <pre className="text-slate-300 max-h-16 overflow-y-auto text-[10px]">
                      {k.publicKey}
                    </pre>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => downloadFile(`${k.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.pub`, k.publicKey)}
                      className="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center gap-1.5 hover:bg-white/10"
                    >
                      <Download className="w-3.5 h-3.5 text-amber-400" />
                      <span>Download cosign.pub</span>
                    </button>

                    {k.privateKey && (
                      <button
                        onClick={() => downloadFile(`${k.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.key`, k.privateKey!)}
                        className="flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold bg-white/5 border border-white/10 text-slate-300 hover:text-white flex items-center justify-center gap-1.5 hover:bg-white/10"
                      >
                        <Lock className="w-3.5 h-3.5 text-amber-400" />
                        <span>Download cosign.key</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal: Generate Key Pair */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#131326] border border-white/15 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-400" />
                <span>Generate Cosign Key Pair</span>
              </h3>
              <button
                onClick={() => setShowGenerateModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Key Name / Description</label>
                <input
                  type="text"
                  placeholder="e.g. Production Release Key, CI/CD Signing Key"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Cryptographic Algorithm</label>
                <select
                  value={newKeyAlgorithm}
                  onChange={(e) => setNewKeyAlgorithm(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs font-mono"
                >
                  <option value="ECDSA_P256">ECDSA P-256 (prime256v1) - Recommended & Standard for Cosign</option>
                  <option value="ED25519">Ed25519 - Modern Edwards-curve Digital Signature</option>
                </select>
              </div>

              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300/90 leading-relaxed">
                Keys will be generated instantly and encrypted inside your macOS machine vault.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowGenerateModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isGeneratingKey}
                onClick={handleGenerateKey}
                className="px-5 py-2 rounded-lg text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 transition-all shadow-[0_0_12px_rgba(251,191,36,0.3)] flex items-center gap-1.5"
              >
                {isGeneratingKey ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5" />
                    <span>Generate & Store</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
