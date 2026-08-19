import { spawn, execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { ImageInspection, RegistryCredential, TransportType } from '../types';

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
    insecure: boolean = false
  ): Promise<ImageInspection> {
    const bin = await this.getBinPath();
    const args = ['inspect'];

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

    // Source auth
    if (options.srcCred && !options.srcCred.isAnonymous && options.srcCred.username && options.srcCred.password) {
      args.push(`--src-creds=${options.srcCred.username}:${options.srcCred.password}`);
    }

    if (options.srcInsecure || (options.srcCred && options.srcCred.insecure)) {
      args.push('--src-tls-verify=false');
    }

    // Destination auth
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

        // Parse layer progress if available (e.g., "Copying blob ...")
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
}
