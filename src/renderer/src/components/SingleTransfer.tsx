import React, { useState } from 'react';
import {
  ArrowRightLeft,
  Play,
  Square,
  RefreshCw,
  CheckCircle2,
  Server,
  ArrowRight,
} from 'lucide-react';
import { RegistryCredential, TransportType } from '../../../types';

interface Props {
  credentials: RegistryCredential[];
  onShowToast: (msg: string, success: boolean) => void;
}

export const SingleTransfer: React.FC<Props> = ({
  credentials,
  onShowToast,
}) => {
  const [srcCredId, setSrcCredId] = useState('');
  const [srcTransport, setSrcTransport] = useState<TransportType>('docker');
  const [srcImage, setSrcImage] = useState('');
  const [srcInsecure, setSrcInsecure] = useState(false);

  const [destCredId, setDestCredId] = useState('');
  const [destTransport, setDestTransport] = useState<TransportType>('docker');
  const [destImage, setDestImage] = useState('');
  const [destInsecure, setDestInsecure] = useState(false);

  const [allArch, setAllArch] = useState(true);
  const [format, setFormat] = useState<'v2s1' | 'v2s2' | 'oci'>('v2s2');
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [outputLog, setOutputLog] = useState<string[]>([]);

  const handleStart = async () => {
    if (!srcImage.trim() || !destImage.trim()) {
      onShowToast('Please provide both source and destination image references.', false);
      return;
    }

    setIsRunning(true);
    setProgress(10);
    setOutputLog([`Starting copy: ${srcImage} -> ${destImage}`]);

    try {
      const srcRef = await (window as any).skopeoApi.formatUri(srcTransport, srcImage.trim());
      const destRef = await (window as any).skopeoApi.formatUri(destTransport, destImage.trim());

      const config = {
        name: `Single copy: ${srcImage} -> ${destImage}`,
        srcRegistryId: srcCredId || undefined,
        destRegistryId: destCredId || undefined,
        srcTransport,
        destTransport,
        srcRepo: srcImage.split(':')[0],
        destRepo: destImage.split(':')[0],
        selectedTags: [srcImage.includes(':') ? srcImage.split(':')[1] : 'latest'],
        copyAllArchitectures: allArch,
        srcInsecure,
        destInsecure,
        format,
        concurrency: 1,
      };

      await (window as any).skopeoApi.startBatchMigration(config);
      setProgress(100);
      onShowToast('Image transfer completed successfully!', true);
    } catch (err: any) {
      onShowToast(err.message || 'Transfer failed', false);
      setOutputLog((prev) => [...prev, `[ERROR] ${err.message}`]);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap pb-4 border-b border-white/[0.08]">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-amber-400" />
            Single Image Transfer
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Perform an immediate, dedicated transfer of a single container image tag between any two endpoints.
          </p>
        </div>

        <button
          onClick={handleStart}
          disabled={isRunning || !srcImage.trim() || !destImage.trim()}
          className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40 transition-colors shadow-[0_0_12px_rgba(251,191,36,0.25)]"
        >
          {isRunning ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Transferring...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              <span>Transfer Now</span>
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Source */}
        <div className="p-4 rounded-xl bg-[#131326] border border-white/[0.08] space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5 pb-2 border-b border-white/[0.06]">
            <Server className="w-3.5 h-3.5" />
            Source Image
          </span>

          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">Credentials</label>
            <select
              value={srcCredId}
              onChange={(e) => setSrcCredId(e.target.value)}
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

          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Source Image Reference (with tag)
            </label>
            <input
              type="text"
              placeholder="e.g. docker.io/library/redis:alpine or ubuntu:24.04"
              value={srcImage}
              onChange={(e) => setSrcImage(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs font-mono"
            />
          </div>
        </div>

        {/* Destination */}
        <div className="p-4 rounded-xl bg-[#131326] border border-white/[0.08] space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5 pb-2 border-b border-white/[0.06]">
            <Server className="w-3.5 h-3.5" />
            Destination Image
          </span>

          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">Credentials</label>
            <select
              value={destCredId}
              onChange={(e) => setDestCredId(e.target.value)}
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

          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Destination Image Reference (with tag)
            </label>
            <input
              type="text"
              placeholder="e.g. docker.io/myorg/redis:alpine"
              value={destImage}
              onChange={(e) => setDestImage(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#0a0a14] border border-white/10 text-white text-xs font-mono"
            />
          </div>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-[#131326] border border-white/[0.08] flex items-center gap-4 text-xs">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={allArch}
            onChange={(e) => setAllArch(e.target.checked)}
            className="rounded accent-amber-500"
          />
          <span className="text-slate-300">
            Copy all architectures (<code className="text-amber-400 text-[10px]">--all</code>)
          </span>
        </label>
      </div>
    </div>
  );
};
