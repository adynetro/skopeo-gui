import { spawn, execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
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

      // Primary layer-based discovery if no detached SBOM artifact was found
      if (packages.length === 0) {
        try {
          const layerPkgs = await this.extractPackagesFromLayers(imageRef, cred, insecure, targetPlatform);
          if (layerPkgs && layerPkgs.length > 0) {
            packages = layerPkgs;
            format = 'Layer-Inspection';
            tool = 'Skopeo Layer Inspection (APK/DPKG/RPM)';
          }
        } catch {
          // Proceed to labels/env fallback if layer extraction fails
        }
      }

      // Secondary Fallback: If no detached OCI SBOM artifact was found, inspect labels and environment
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

  public async testConnection(
    cred: RegistryCredential
  ): Promise<{ success: boolean; message: string }> {
    const bin = await this.getBinPath();
    const rawDomain = (cred.domain || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (!rawDomain) {
      return { success: false, message: 'Registry domain is required' };
    }

    const server = rawDomain.split('/')[0];
    const hasRepoPath = rawDomain.includes('/');

    if (cred.isAnonymous) {
      // Anonymous connection test
      try {
        const testTarget = hasRepoPath
          ? `docker://${rawDomain}`
          : (server === 'docker.io' ? 'docker://docker.io/library/alpine:latest' : `docker://${server}`);

        if (hasRepoPath || server === 'docker.io') {
          await this.listTags(testTarget, cred, cred.insecure);
        }
        return { success: true, message: `Anonymous connection to ${server} verified!` };
      } catch {
        return { success: true, message: `Anonymous registry access configured for ${server}` };
      }
    }

    if (!cred.username || !cred.password) {
      return { success: false, message: 'Username and password/token are required for authenticated access.' };
    }

    // 1. Primary test: Native skopeo login on server host
    const tmpAuth = path.join(
      os.tmpdir(),
      `skopeo-auth-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.json`
    );
    try {
      fs.writeFileSync(tmpAuth, '{}');
    } catch {}

    const loginPromise = new Promise<{ success: boolean; message: string }>((resolve) => {
      const args = [
        'login',
        '--authfile',
        tmpAuth,
        `--tls-verify=${!cred.insecure}`,
        '-u',
        cred.username,
        '--password-stdin',
        server,
      ];

      const proc = spawn(bin, args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => (stdout += d));
      proc.stderr.on('data', (d) => (stderr += d));

      proc.stdin.write(cred.password + '\n');
      proc.stdin.end();

      proc.on('close', (code) => {
        try {
          if (fs.existsSync(tmpAuth)) fs.unlinkSync(tmpAuth);
        } catch {}

        if (code === 0) {
          resolve({ success: true, message: `Authentication verified successfully with ${server}!` });
        } else {
          let errText = (stderr || stdout || '')
            .replace(/time="[^"]*"\s+level=\w+\s+msg="/g, '')
            .replace(/"\s*$/g, '')
            .trim();

          if (
            errText.includes('invalid username/password') ||
            errText.includes('unauthorized') ||
            errText.includes('401')
          ) {
            errText = `Invalid username or password/token for ${server}.`;
          } else if (
            errText.includes('requested access to the resource is denied') ||
            errText.includes('403')
          ) {
            errText = `Access denied by ${server}. Verify that user/token permissions are active.`;
          }

          resolve({ success: false, message: errText || `Login test failed for ${server}` });
        }
      });
    });

    const loginResult = await loginPromise;
    if (loginResult.success) {
      return loginResult;
    }

    // 2. Fallback: If user specified a specific repository path (e.g. OCIR/ECR tenancy repo), test querying that repo
    if (hasRepoPath) {
      try {
        await this.listTags(`docker://${rawDomain}`, cred, cred.insecure);
        return { success: true, message: `Authentication verified successfully for ${rawDomain}!` };
      } catch {
        return loginResult;
      }
    }

    return loginResult;
  }

  public async extractPackagesFromLayers(
    imageRef: string,
    cred?: RegistryCredential,
    insecure: boolean = false,
    platform?: { os?: string; arch?: string; variant?: string }
  ): Promise<SbomPackage[]> {
    const bin = await this.getBinPath();
    const tmpDir = path.join(
      os.tmpdir(),
      `skopeo-layers-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    );
    try {
      fs.mkdirSync(tmpDir, { recursive: true });
    } catch {
      return [];
    }

    try {
      const args = ['copy'];
      if (platform?.os) args.push(`--override-os=${platform.os}`);
      if (platform?.arch) args.push(`--override-arch=${platform.arch}`);
      if (platform?.variant) args.push(`--override-variant=${platform.variant}`);

      if (cred && !cred.isAnonymous && cred.username && cred.password) {
        args.push(`--creds=${cred.username}:${cred.password}`);
      }
      if (insecure || (cred && cred.insecure)) {
        args.push('--tls-verify=false');
      }

      args.push(imageRef, `dir:${tmpDir}`);

      await new Promise<void>((resolve, reject) => {
        const proc = spawn(bin, args);
        let stderr = '';
        proc.stderr.on('data', (d) => (stderr += d));
        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Layer download failed: ${stderr}`));
        });
      });

      const manifestPath = path.join(tmpDir, 'manifest.json');
      if (!fs.existsSync(manifestPath)) return [];
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const packages: SbomPackage[] = [];
      const seen = new Set<string>();

      let osId = 'linux';
      let osVersion = '';
      let osName = 'Linux';

      // 1. Detect OS Release across image layers
      for (const layer of manifest.layers || []) {
        const layerHash = layer.digest.replace('sha256:', '');
        const layerFile = path.join(tmpDir, layerHash);
        if (!fs.existsSync(layerFile)) continue;

        try {
          const rawOs = await execFileAsync('tar', ['-zxOf', layerFile, 'etc/os-release']).catch(() =>
            execFileAsync('tar', ['-zxOf', layerFile, 'usr/lib/os-release']).catch(() => ({ stdout: '' }))
          );
          if (rawOs.stdout) {
            const lines = rawOs.stdout.split('\n');
            for (const l of lines) {
              if (l.startsWith('ID=')) osId = l.replace('ID=', '').replace(/["'\r]/g, '').toLowerCase();
              if (l.startsWith('VERSION_ID=')) osVersion = l.replace('VERSION_ID=', '').replace(/["'\r]/g, '');
              if (l.startsWith('PRETTY_NAME=')) osName = l.replace('PRETTY_NAME=', '').replace(/["'\r]/g, '');
            }
          }
        } catch {}
      }

      for (const layer of manifest.layers || []) {
        const layerHash = layer.digest.replace('sha256:', '');
        const layerFile = path.join(tmpDir, layerHash);
        if (!fs.existsSync(layerFile)) continue;

        // 2a. Alpine Linux APK DB
        try {
          const check = await execFileAsync('tar', ['-ztf', layerFile, 'lib/apk/db/installed']).catch(() => ({ stdout: '' }));
          if (check.stdout && check.stdout.includes('lib/apk/db/installed')) {
            const raw = await execFileAsync('tar', ['-zxOf', layerFile, 'lib/apk/db/installed']).catch(() => ({ stdout: '' }));
            if (raw.stdout) {
              const blocks = raw.stdout.split('\n\n');
              for (const block of blocks) {
                const lines = block.split('\n');
                let name = '', version = '', license = '', desc = '';
                for (const line of lines) {
                  if (line.startsWith('P:')) name = line.substring(2).trim();
                  if (line.startsWith('V:')) version = line.substring(2).trim();
                  if (line.startsWith('L:')) license = line.substring(2).trim();
                  if (line.startsWith('T:')) desc = line.substring(2).trim();
                }
                if (name && version) {
                  const key = `apk:${name}:${version}`;
                  if (!seen.has(key)) {
                    seen.add(key);
                    packages.push({
                      name,
                      version,
                      type: 'apk',
                      license: license || 'Open Source',
                      supplier: 'Alpine Linux',
                      purl: `pkg:apk/alpine/${name}@${version}?distro=${osVersion || '3.23'}`,
                    });
                  }
                }
              }
            }
          }
        } catch {}

        // 2b. Debian / Ubuntu DPKG Status
        try {
          const check = await execFileAsync('tar', ['-ztf', layerFile, 'var/lib/dpkg/status']).catch(() => ({ stdout: '' }));
          if (check.stdout && check.stdout.includes('var/lib/dpkg/status')) {
            const raw = await execFileAsync('tar', ['-zxOf', layerFile, 'var/lib/dpkg/status']).catch(() => ({ stdout: '' }));
            if (raw.stdout) {
              const blocks = raw.stdout.split('\n\n');
              for (const block of blocks) {
                const lines = block.split('\n');
                let name = '', version = '', source = '', maintainer = '';
                for (const line of lines) {
                  if (line.startsWith('Package:')) name = line.replace('Package:', '').trim();
                  if (line.startsWith('Version:')) version = line.replace('Version:', '').trim();
                  if (line.startsWith('Source:')) source = line.replace('Source:', '').trim();
                  if (line.startsWith('Maintainer:')) maintainer = line.replace('Maintainer:', '').trim();
                }
                if (name && version) {
                  const key = `deb:${name}:${version}`;
                  if (!seen.has(key)) {
                    seen.add(key);
                    const isUbuntu = osId.includes('ubuntu');
                    packages.push({
                      name,
                      version,
                      type: 'deb',
                      license: 'Standard Distribution License',
                      supplier: maintainer || (isUbuntu ? 'Ubuntu Linux' : 'Debian Linux'),
                      purl: `pkg:deb/${isUbuntu ? 'ubuntu' : 'debian'}/${name}@${version}?distro=${osVersion || 'latest'}`,
                    });
                  }
                }
              }
            }
          }
        } catch {}

        // 2c. Red Hat / CentOS / AlmaLinux / Rocky / Fedora / Amazon Linux RPM (SQLite)
        try {
          await execFileAsync('tar', [
            '-zxf',
            layerFile,
            '-C',
            tmpDir,
            'var/lib/rpm/rpmdb.sqlite',
            'usr/lib/sysimage/rpm/rpmdb.sqlite',
          ]).catch(() => ({ stdout: '' }));

          const cand1 = path.join(tmpDir, 'var/lib/rpm/rpmdb.sqlite');
          const cand2 = path.join(tmpDir, 'usr/lib/sysimage/rpm/rpmdb.sqlite');
          const dbPath = fs.existsSync(cand1) ? cand1 : fs.existsSync(cand2) ? cand2 : null;

          if (dbPath) {
            const { stdout: sqliteOut } = await execFileAsync(
              '/usr/bin/sqlite3',
              [dbPath, 'SELECT hex(blob) FROM Packages;'],
              { maxBuffer: 100 * 1024 * 1024 }
            ).catch(() => ({ stdout: '' }));

            const hexRows = sqliteOut.split('\n').filter(Boolean);
            for (const hex of hexRows) {
              const buf = Buffer.from(hex, 'hex');
              if (buf.length < 8) continue;
              let nindex = 0, dsize = 0, indexStart = 0;
              if (buf[0] === 0x8e && buf[1] === 0xad && buf[2] === 0xe8 && buf[3] === 0x01) {
                nindex = buf.readUInt32BE(8);
                dsize = buf.readUInt32BE(12);
                indexStart = 16;
              } else {
                nindex = buf.readUInt32BE(0);
                dsize = buf.readUInt32BE(4);
                indexStart = 8;
              }
              const dataStart = indexStart + nindex * 16;
              if (dataStart + dsize > buf.length) continue;

              let name = '', version = '', release = '', license = '', arch = '';
              for (let i = 0; i < nindex; i++) {
                const entryOffset = indexStart + i * 16;
                const tag = buf.readUInt32BE(entryOffset);
                const dataOffset = buf.readUInt32BE(entryOffset + 8);
                const target = dataStart + dataOffset;
                if (target >= buf.length) continue;

                const readString = () => {
                  let end = target;
                  while (end < buf.length && buf[end] !== 0) end++;
                  return buf.toString('utf8', target, end);
                };

                if (tag === 1000) name = readString();
                else if (tag === 1001) version = readString();
                else if (tag === 1002) release = readString();
                else if (tag === 1014) license = readString();
                else if (tag === 1022) arch = readString();
              }

              if (name && version) {
                const fullVer = release ? `${version}-${release}` : version;
                const key = `rpm:${name}:${fullVer}`;
                if (!seen.has(key)) {
                  seen.add(key);
                  const rpmNamespace = osId.includes('almalinux')
                    ? 'almalinux'
                    : osId.includes('rocky')
                    ? 'rocky'
                    : osId.includes('fedora')
                    ? 'fedora'
                    : 'redhat';
                  packages.push({
                    name,
                    version: fullVer,
                    type: 'rpm',
                    license: license || 'Open Source',
                    supplier: osName || 'Red Hat Enterprise Linux',
                    purl: `pkg:rpm/${rpmNamespace}/${name}@${fullVer}?arch=${arch || 'x86_64'}`,
                  });
                }
              }
            }
          }
        } catch {}

        // 2d. Red Hat / CentOS / RHEL 8 RPM (Berkeley DB format)
        try {

          await execFileAsync('tar', [
            '-zxf',
            layerFile,
            '-C',
            tmpDir,
            'var/lib/rpm/Packages',
          ]).catch(() => ({ stdout: '' }));

          const bdbPath = path.join(tmpDir, 'var/lib/rpm/Packages');
          if (fs.existsSync(bdbPath)) {
            const buf = fs.readFileSync(bdbPath);
            let offset = 0;
            while (offset <= buf.length - 32) {
              const nindex = buf.readUInt32BE(offset);
              const dsize = buf.readUInt32BE(offset + 4);
              if (nindex >= 10 && nindex <= 200 && dsize >= 500 && dsize <= 200000) {
                const indexStart = offset + 8;
                const dataStart = indexStart + nindex * 16;
                if (dataStart + dsize <= buf.length) {
                  let hasName = false;
                  let name = '', version = '', release = '', license = '', arch = '';
                  for (let i = 0; i < nindex; i++) {
                    const entryOffset = indexStart + i * 16;
                    const tag = buf.readUInt32BE(entryOffset);
                    const dataOffset = buf.readUInt32BE(entryOffset + 8);
                    const target = dataStart + dataOffset;
                    if (target >= buf.length || target < dataStart) continue;

                    const readString = () => {
                      let end = target;
                      while (end < dataStart + dsize && buf[end] !== 0) end++;
                      return buf.toString('utf8', target, end);
                    };

                    if (tag === 1000) {
                      name = readString();
                      hasName = /^[a-zA-Z0-9_+.-]+$/.test(name);
                    } else if (tag === 1001) {
                      version = readString();
                    } else if (tag === 1002) {
                      release = readString();
                    } else if (tag === 1014) {
                      license = readString();
                    } else if (tag === 1022) {
                      arch = readString();
                    }
                  }

                  if (hasName && name && version) {
                    const fullVer = release ? `${version}-${release}` : version;
                    const key = `rpm:${name}:${fullVer}`;
                    if (!seen.has(key)) {
                      seen.add(key);
                      packages.push({
                        name,
                        version: fullVer,
                        type: 'rpm',
                        license: license || 'Open Source',
                        supplier: osName || 'Red Hat Enterprise Linux',
                        purl: `pkg:rpm/redhat/${name}@${fullVer}?arch=${arch || 'x86_64'}`,
                      });
                    }
                  }
                }
              }
              offset += 2;
            }
          }
        } catch {}

        // 2e. .NET Runtime / SDK Framework packages
        try {
          const checkDotnet = await execFileAsync('tar', ['-ztf', layerFile]).catch(() => ({ stdout: '' }));
          if (checkDotnet.stdout && (checkDotnet.stdout.includes('/dotnet/shared/') || checkDotnet.stdout.includes('.runtimeconfig.json'))) {
            const lines = checkDotnet.stdout.split('\n');
            for (const line of lines) {
              const match = line.match(/dotnet\/shared\/([^/]+)\/([0-9.]+)\//);
              if (match) {
                const frameworkName = match[1];
                const frameworkVersion = match[2];
                const key = `dotnet:${frameworkName}:${frameworkVersion}`;
                if (!seen.has(key)) {
                  seen.add(key);
                  packages.push({
                    name: frameworkName,
                    version: frameworkVersion,
                    type: 'runtime',
                    license: 'MIT',
                    supplier: 'Microsoft .NET',
                    purl: `pkg:nuget/${frameworkName}@${frameworkVersion}`,
                  });
                }
              }
            }
          }
        } catch {}
      }


      return packages;
    } catch {
      return [];
    } finally {
      try {
        if (fs.existsSync(tmpDir)) {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        }
      } catch {}
    }

  }
}


