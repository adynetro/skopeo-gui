import { spawn, execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { ImageInspection, RegistryCredential, SbomInspection, SbomPackage, TransportType } from '../types';

const execFileAsync = promisify(execFile);

export class SkopeoService {
  private customPath: string = '';

  public setCustomPath(p: string) {
    this.customPath = p;
  }

  public async findBinary(): Promise<{ path: string; version: string; isInstalled: boolean }> {
    const candidatePaths = [
      this.customPath,
      '/opt/homebrew/bin/skopeo',
      '/usr/local/bin/skopeo',
      '/usr/bin/skopeo',
      'skopeo'
    ].filter(Boolean);

    for (const binPath of candidatePaths) {
      try {
        if (binPath.startsWith('/') && !fs.existsSync(binPath)) {
          continue;
        }
        const { stdout } = await execFileAsync(binPath, ['--version']);
        const version = stdout.trim();
        return { path: binPath, version, isInstalled: true };
      } catch (err) {
        // try next
      }
    }

    return { path: '', version: '', isInstalled: false };
  }

  private async getBinPath(): Promise<string> {
    if (this.customPath && fs.existsSync(this.customPath)) {
      return this.customPath;
    }
    const info = await this.findBinary();
    if (!info.isInstalled) {
      throw new Error('Skopeo binary not found. Please install via "brew install skopeo" or configure the binary path in Settings.');
    }
    return info.path;
  }

  public formatImageUri(transport: TransportType, ref: string): string {
    const cleanRef = ref.trim().replace(/^([a-z-]+:\/\/)/, '');
    if (transport === 'docker') {
      return `docker://${cleanRef}`;
    } else if (transport === 'oci') {
      return `oci://${cleanRef}`;
    } else if (transport === 'oci-archive') {
      return `oci-archive:${cleanRef}`;
    } else if (transport === 'dir') {
      return `dir:${cleanRef}`;
    } else if (transport === 'docker-archive') {
      return `docker-archive:${cleanRef}`;
    } else if (transport === 'docker-daemon') {
      return `docker-daemon:${cleanRef}`;
    }
    return `docker://${cleanRef}`;
  }

  public async inspect(
    imageRef: string,
    cred?: RegistryCredential,
    insecure: boolean = false,
    platform?: { os?: string; arch?: string; variant?: string }
  ): Promise<ImageInspection> {
    const bin = await this.getBinPath();
    const args = ['inspect'];

    if (platform?.os) {
      args.push(`--override-os=${platform.os}`);
    }
    if (platform?.arch) {
      args.push(`--override-arch=${platform.arch}`);
    }
    if (platform?.variant) {
      args.push(`--override-variant=${platform.variant}`);
    }

    if (cred && !cred.isAnonymous && cred.username && cred.password) {
      args.push(`--creds=${cred.username}:${cred.password}`);
    }

    if (insecure || (cred && cred.insecure)) {
      args.push('--tls-verify=false');
    }

    args.push(imageRef);

    try {
      const { stdout } = await execFileAsync(bin, args, { maxBuffer: 10 * 1024 * 1024 });
      const parsed = JSON.parse(stdout);
      return {
        ...parsed,
        RawJSON: parsed,
      };
    } catch (err: any) {
      const errMsg = err.stderr || err.stdout || err.message;
      throw new Error(`Skopeo inspect failed: ${errMsg}`);
    }
  }

  public async inspectRaw(
    imageRef: string,
    cred?: RegistryCredential,
    insecure: boolean = false
  ): Promise<any> {
    const bin = await this.getBinPath();
    const args = ['inspect', '--raw'];

    if (cred && !cred.isAnonymous && cred.username && cred.password) {
      args.push(`--creds=${cred.username}:${cred.password}`);
    }

    if (insecure || (cred && cred.insecure)) {
      args.push('--tls-verify=false');
    }

    args.push(imageRef);

    try {
      const { stdout } = await execFileAsync(bin, args, { maxBuffer: 15 * 1024 * 1024 });
      try {
        return JSON.parse(stdout);
      } catch {
        return stdout;
      }
    } catch (err: any) {
      const errMsg = err.stderr || err.stdout || err.message;
      throw new Error(`Skopeo inspect --raw failed: ${errMsg}`);
    }
  }

  public async listTags(
    imageRef: string,
    cred?: RegistryCredential,
    insecure: boolean = false
  ): Promise<string[]> {
    const bin = await this.getBinPath();
    const args = ['list-tags'];

    if (cred && !cred.isAnonymous && cred.username && cred.password) {
      args.push(`--creds=${cred.username}:${cred.password}`);
    }

    if (insecure || (cred && cred.insecure)) {
      args.push('--tls-verify=false');
    }

    args.push(imageRef);

    try {
      const { stdout } = await execFileAsync(bin, args, { maxBuffer: 10 * 1024 * 1024 });
      const parsed = JSON.parse(stdout);
      return Array.isArray(parsed.Tags) ? parsed.Tags : [];
    } catch (err: any) {
      const errMsg = err.stderr || err.stdout || err.message;
      throw new Error(`Failed to list tags: ${errMsg}`);
    }
  }

  public async inspectSbom(
    imageRef: string,
    cred?: RegistryCredential,
    insecure: boolean = false,
    platform?: { os?: string; arch?: string; variant?: string }
  ): Promise<SbomInspection> {
    try {
      // Default to linux/amd64 if no override given
      const targetPlatform = platform || { os: 'linux', arch: 'amd64' };

      // Discover all available platforms if it's a multi-arch manifest
      let availablePlatforms: { os: string; architecture: string; variant?: string }[] = [];
      try {
        const rawManifest = await this.inspectRaw(imageRef, cred, insecure);
        if (rawManifest && Array.isArray(rawManifest.manifests)) {
          availablePlatforms = rawManifest.manifests
            .map((m: any) => m.platform)
            .filter((p: any) => p && p.os && p.architecture);
        }
      } catch {
        // Not a multi-arch index, ignore
      }

      const inspectData = await this.inspect(imageRef, cred, insecure, targetPlatform);
      const digest = inspectData.Digest || '';
      const cleanRef = imageRef.replace(/^([a-z-]+:\/\/)/, '');
      const repoBase = cleanRef.includes(':') ? cleanRef.split(':')[0] : cleanRef.split('@')[0];

      // Extract Cosign-style tags if digest exists
      let hasCosignSig = false;
      let hasSbom = false;
      let hasAtt = false;
      let cosignTag = '';
      let sbomTag = '';

      if (digest.includes('sha256:')) {
        const hex = digest.replace('sha256:', '');
        const cosignSigCandidate = `sha256-${hex}.sig`;
        const cosignSbomCandidate = `sha256-${hex}.sbom`;
        const cosignAttCandidate = `sha256-${hex}.att`;

        try {
          const allTags = await this.listTags(`docker://${repoBase}`, cred, insecure);
          if (allTags.includes(cosignSigCandidate)) {
            hasCosignSig = true;
            cosignTag = cosignSigCandidate;
          }
          if (allTags.includes(cosignSbomCandidate)) {
            hasSbom = true;
            sbomTag = cosignSbomCandidate;
          }
          if (allTags.includes(cosignAttCandidate)) {
            hasAtt = true;
          }
        } catch {
          // tag list check not critical
        }
      }

      // Try fetching raw SBOM artifact if present
      let rawSbomData: any = null;
      let format: SbomInspection['format'] = 'None';
      let specVersion = '';
      let tool = '';
      let packages: SbomPackage[] = [];

      if (hasSbom && sbomTag) {
        try {
          const sbomRef = `docker://${repoBase}:${sbomTag}`;
          rawSbomData = await this.inspectRaw(sbomRef, cred, insecure);
        } catch {
          // ignore
        }
      }

      // Parse SPDX / CycloneDX packages if present in rawSbomData
      if (rawSbomData && typeof rawSbomData === 'object') {
        if (rawSbomData.spdxVersion || rawSbomData.SPDXID) {
          format = 'SPDX';
          specVersion = rawSbomData.spdxVersion || '2.3';
          tool = rawSbomData.creationInfo?.creators?.join(', ') || 'Syft / SPDX';
          if (Array.isArray(rawSbomData.packages)) {
            packages = rawSbomData.packages.map((pkg: any) => ({
              name: pkg.name || 'unknown',
              version: pkg.versionInfo || 'unknown',
              type: pkg.packageFileName?.endsWith('.apk') ? 'apk' : 'library',
              license: pkg.licenseConcluded || pkg.licenseDeclared || 'NOASSERTION',
              supplier: pkg.supplier,
              purl: pkg.externalRefs?.find((r: any) => r.referenceType === 'purl')?.referenceLocator,
            }));
          }
        } else if (rawSbomData.bomFormat === 'CycloneDX') {
          format = 'CycloneDX';
          specVersion = rawSbomData.specVersion || '1.5';
          tool = rawSbomData.metadata?.tools?.components?.[0]?.name || 'CycloneDX';
          if (Array.isArray(rawSbomData.components)) {
            packages = rawSbomData.components.map((comp: any) => ({
              name: comp.name || 'unknown',
              version: comp.version || 'unknown',
              type: comp.type || 'library',
              license: comp.licenses?.[0]?.license?.id || comp.licenses?.[0]?.license?.name || 'Unknown',
              purl: comp.purl,
              supplier: comp.supplier?.name,
            }));
          }
        }
      }

      // Fallback: If no detached OCI SBOM artifact was found, inspect labels and environment
      if (packages.length === 0) {
        const labels = inspectData.Labels || {};
        format = Object.keys(labels).length > 0 ? 'Labels' : 'None';
        tool = labels['org.opencontainers.image.source'] || labels['io.buildpacks.builder.version'] || 'Container Metadata';

        const syntheticPkgs: SbomPackage[] = [];
        if (labels['org.opencontainers.image.title']) {
          syntheticPkgs.push({
            name: labels['org.opencontainers.image.title'],
            version: labels['org.opencontainers.image.version'] || inspectData.Tag || 'latest',
            type: 'os',
            license: labels['org.opencontainers.image.licenses'] || 'Open Source',
            supplier: labels['org.opencontainers.image.vendor'] || labels['maintainer'],
          });
        }

        // Add base OS component
        syntheticPkgs.push({
          name: inspectData.Os ? `os-${inspectData.Os}` : 'base-os',
          version: inspectData.Architecture || 'amd64',
          type: 'os',
          license: 'Standard Distribution License',
          supplier: 'Official Distribution',
        });

        // Add packages detected from environment
        (inspectData.Env || []).forEach((e) => {
          if (e.includes('_VERSION=') || e.includes('_RELEASE=')) {
            const [k, v] = e.split('=');
            syntheticPkgs.push({
              name: k.replace('_VERSION', '').replace('_RELEASE', '').toLowerCase(),
              version: v,
              type: 'runtime',
              license: 'Standard Runtime License',
            });
          }
        });

        packages = syntheticPkgs;
      }

      return {
        imageRef,
        digest,
        os: inspectData.Os || targetPlatform.os,
        architecture: inspectData.Architecture || targetPlatform.arch,
        availablePlatforms: availablePlatforms.length > 0 ? availablePlatforms : undefined,
        format,
        specVersion,
        creationTimestamp: inspectData.Created,
        tool,
        packages,
        hasCosignSignature: hasCosignSig,
        cosignSignatureTag: cosignTag,
        hasSbomArtifact: hasSbom,
        sbomArtifactTag: sbomTag,
        hasAttestation: hasAtt,
        rawJSON: rawSbomData || inspectData.RawJSON,
      };
    } catch (err: any) {
      return {
        imageRef,
        format: 'None',
        packages: [],
        hasCosignSignature: false,
        hasSbomArtifact: false,
        hasAttestation: false,
        error: err.message || String(err),
      };
    }
  }

  public async copy(
    srcRef: string,
    destRef: string,
    options: {
      srcCred?: RegistryCredential;
      destCred?: RegistryCredential;
      allArch?: boolean;
      srcInsecure?: boolean;
      destInsecure?: boolean;
      format?: 'v2s1' | 'v2s2' | 'oci';
      onLog?: (line: string) => void;
      onProgress?: (progress: number) => void;
    },
    abortSignal?: AbortSignal
  ): Promise<{ success: boolean; output: string }> {
    const bin = await this.getBinPath();
    const args = ['copy'];

    if (options.allArch) {
      args.push('--all');
    }

    if (options.format) {
      args.push(`--format=${options.format}`);
    }

    if (options.srcCred && !options.srcCred.isAnonymous && options.srcCred.username && options.srcCred.password) {
      args.push(`--src-creds=${options.srcCred.username}:${options.srcCred.password}`);
    }

    if (options.srcInsecure || (options.srcCred && options.srcCred.insecure)) {
      args.push('--src-tls-verify=false');
    }

    if (options.destCred && !options.destCred.isAnonymous && options.destCred.username && options.destCred.password) {
      args.push(`--dest-creds=${options.destCred.username}:${options.destCred.password}`);
    }

    if (options.destInsecure || (options.destCred && options.destCred.insecure)) {
      args.push('--dest-tls-verify=false');
    }

    args.push(srcRef, destRef);

    return new Promise((resolve, reject) => {
      let output = '';
      const child = spawn(bin, args, {
        signal: abortSignal,
        env: { ...process.env, PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin` }
      });

      const handleData = (data: Buffer) => {
        const text = data.toString();
        output += text;
        if (options.onLog) {
          options.onLog(text);
        }

        if (options.onProgress) {
          if (text.includes('Copying blob')) {
            options.onProgress(50);
          } else if (text.includes('Copying config') || text.includes('Writing manifest')) {
            options.onProgress(90);
          }
        }
      };

      child.stdout.on('data', handleData);
      child.stderr.on('data', handleData);

      child.on('close', (code) => {
        if (code === 0) {
          if (options.onProgress) options.onProgress(100);
          resolve({ success: true, output });
        } else {
          reject(new Error(`Skopeo copy exited with code ${code}.\n${output}`));
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }

  public async delete(
    imageRef: string,
    cred?: RegistryCredential,
    insecure: boolean = false
  ): Promise<boolean> {
    const bin = await this.getBinPath();
    const args = ['delete'];

    if (cred && !cred.isAnonymous && cred.username && cred.password) {
      args.push(`--creds=${cred.username}:${cred.password}`);
    }

    if (insecure || (cred && cred.insecure)) {
      args.push('--tls-verify=false');
    }

    args.push(imageRef);

    try {
      await execFileAsync(bin, args);
      return true;
    } catch (err: any) {
      throw new Error(`Skopeo delete failed: ${err.stderr || err.message}`);
    }
  }

  public async batchDelete(
    imageRefs: string[],
    cred?: RegistryCredential,
    insecure: boolean = false
  ): Promise<{ succeeded: string[]; failed: { ref: string; error: string }[] }> {
    const succeeded: string[] = [];
    const failed: { ref: string; error: string }[] = [];

    for (const ref of imageRefs) {
      try {
        await this.delete(ref, cred, insecure);
        succeeded.push(ref);
      } catch (err: any) {
        failed.push({ ref, error: err.message || String(err) });
      }
    }

    return { succeeded, failed };
  }
}
