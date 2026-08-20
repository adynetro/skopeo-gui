import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { app } from 'electron';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';
import {
  DockerConfigInfo,
  DockerExportResult,
  DockerImportDetail,
  DockerImportResult,
  RegistryCredential
} from '../types';

const execFileAsync = promisify(execFile);

export class CredentialService {
  private filePath: string;
  private encryptionKey: Buffer;

  constructor() {
    const userDataPath = app ? app.getPath('userData') : path.join(os.homedir(), '.skopeo-gui');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    this.filePath = path.join(userDataPath, 'credentials.enc.json');

    // Create stable machine-bound key
    const machineId = `${os.hostname()}-${os.userInfo().username}-skopeo-vault`;
    this.encryptionKey = crypto.createHash('sha256').update(machineId).digest();
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  private decrypt(text: string): string {
    try {
      const parts = text.split(':');
      if (parts.length !== 2) return text;
      const iv = Buffer.from(parts[0], 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
      let decrypted = decipher.update(parts[1], 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch {
      return text;
    }
  }

  public getAll(): RegistryCredential[] {
    if (!fs.existsSync(this.filePath)) {
      return this.getDefaultRegistries();
    }
    try {
      const data = fs.readFileSync(this.filePath, 'utf-8');
      const rawList: any[] = JSON.parse(data);
      return rawList.map((item) => ({
        ...item,
        password: item.password ? this.decrypt(item.password) : '',
      }));
    } catch (e) {
      console.error('Error reading credentials:', e);
      return this.getDefaultRegistries();
    }
  }

  public save(credential: Omit<RegistryCredential, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): RegistryCredential {
    const list = this.getAll();
    const now = new Date().toISOString();

    let target: RegistryCredential;
    if (credential.id) {
      const index = list.findIndex((c) => c.id === credential.id);
      target = {
        ...credential,
        id: credential.id,
        createdAt: index >= 0 ? list[index].createdAt : now,
        updatedAt: now,
      } as RegistryCredential;
      if (index >= 0) {
        list[index] = target;
      } else {
        list.push(target);
      }
    } else {
      // Check if domain already exists with similar username to avoid duplicates
      const existingIdx = list.findIndex((c) => c.domain === credential.domain);
      if (existingIdx >= 0) {
        target = {
          ...credential,
          id: list[existingIdx].id,
          createdAt: list[existingIdx].createdAt || now,
          updatedAt: now,
        };
        list[existingIdx] = target;
      } else {
        target = {
          ...credential,
          id: `cred-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          createdAt: now,
          updatedAt: now,
        };
        list.push(target);
      }
    }

    this.persist(list);
    return target;
  }

  public delete(id: string): boolean {
    const list = this.getAll();
    const filtered = list.filter((c) => c.id !== id);
    this.persist(filtered);
    return filtered.length !== list.length;
  }

  private persist(list: RegistryCredential[]) {
    const toSave = list.map((item) => ({
      ...item,
      password: item.password ? this.encrypt(item.password) : '',
    }));
    fs.writeFileSync(this.filePath, JSON.stringify(toSave, null, 2), 'utf-8');
  }

  /**
   * Discovers default Docker config.json file path on macOS / Linux.
   */
  public findDockerConfigFile(): string | null {
    const candidatePaths = [
      process.env.DOCKER_CONFIG ? path.join(process.env.DOCKER_CONFIG, 'config.json') : '',
      path.join(os.homedir(), '.docker', 'config.json'),
      path.join(os.homedir(), '.config', 'docker', 'config.json'),
      path.join(os.homedir(), '.config', 'containers', 'auth.json'),
    ].filter(Boolean);

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
    return null;
  }

  /**
   * Discovers credential helper binary path (e.g. docker-credential-desktop, docker-credential-osxkeychain).
   */
  public async findHelperBinary(storeName: string): Promise<string | null> {
    const binName = `docker-credential-${storeName}`;
    const searchDirs = [
      '/usr/local/bin',
      '/opt/homebrew/bin',
      '/Applications/Docker.app/Contents/Resources/bin',
      path.join(os.homedir(), '.docker', 'bin'),
      path.join(os.homedir(), '.local', 'bin'),
      '/usr/bin',
    ];

    // Check direct directory matches
    for (const dir of searchDirs) {
      const full = path.join(dir, binName);
      if (fs.existsSync(full)) {
        return full;
      }
    }

    // Try `which` command
    try {
      const extendedPath = `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin:/Applications/Docker.app/Contents/Resources/bin:${path.join(os.homedir(), '.docker', 'bin')}`;
      const { stdout } = await execFileAsync('which', [binName], {
        env: { ...process.env, PATH: extendedPath },
      });
      const found = stdout.trim();
      if (found && fs.existsSync(found)) {
        return found;
      }
    } catch {}

    return null;
  }

  /**
   * Queries Docker Credential Helper using standard stdin/stdout JSON protocol.
   */
  private queryCredentialHelper(binPath: string, action: 'list' | 'get', input?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const extendedPath = `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin:/Applications/Docker.app/Contents/Resources/bin`;
      const child = spawn(binPath, [action], {
        env: { ...process.env, PATH: extendedPath },
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (d) => {
        stdout += d.toString();
      });
      child.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          try {
            resolve(JSON.parse(stdout.trim()));
          } catch {
            resolve(stdout.trim());
          }
        } else {
          reject(new Error(stderr.trim() || `Credential helper ${binPath} exited with code ${code}`));
        }
      });

      child.on('error', (err) => reject(err));

      if (input) {
        child.stdin.write(input + '\n');
      }
      child.stdin.end();
    });
  }

  /**
   * Normalizes registry domains and server URLs.
   */
  public normalizeRegistryDomain(raw: string): { domain: string; isDockerHub: boolean; isTokenSubpath: boolean } {
    let clean = raw.trim();

    // Check if it's an internal token endpoint
    const isTokenSubpath = clean.includes('/access-token') || clean.includes('/refresh-token');

    // Strip http/https protocols
    clean = clean.replace(/^https?:\/\//i, '');

    // Strip trailing slashes and version paths
    clean = clean.replace(/\/+$/, '').replace(/\/v[12]\/?$/i, '');

    const isDockerHub =
      clean === 'index.docker.io' ||
      clean === 'index.docker.io/v1' ||
      clean === 'docker.io' ||
      clean.startsWith('index.docker.io');

    const domain = isDockerHub ? 'docker.io' : clean;
    return { domain, isDockerHub, isTokenSubpath };
  }

  /**
   * Generates a descriptive, friendly name for a registry.
   */
  public generateFriendlyName(domain: string, username?: string): string {
    const userSuffix = username ? ` (${username})` : '';

    if (domain === 'docker.io') return `Docker Hub (docker.io)${userSuffix}`;
    if (domain === 'quay.io') return `Quay.io (quay.io)${userSuffix}`;
    if (domain === 'ghcr.io') return `GitHub Packages (ghcr.io)${userSuffix}`;
    if (domain === 'registry.redhat.io') return `Red Hat Registry (registry.redhat.io)${userSuffix}`;
    if (domain.includes('ocir.io')) return `Oracle Cloud OCIR (${domain})${userSuffix}`;
    if (domain.includes('amazonaws.com') || domain.includes('.ecr.')) return `AWS ECR (${domain})${userSuffix}`;
    if (domain.includes('gcr.io') || domain.includes('pkg.dev')) return `Google Container Registry (${domain})${userSuffix}`;
    if (domain.includes('azurecr.io')) return `Azure Container Registry (${domain})${userSuffix}`;

    return `Docker Config (${domain})${userSuffix}`;
  }

  /**
   * Retrieves Docker configuration and macOS Keychain store status.
   */
  public async getDockerConfigInfo(): Promise<DockerConfigInfo> {
    const configPath = this.findDockerConfigFile();
    if (!configPath || !fs.existsSync(configPath)) {
      return {
        exists: false,
        path: path.join(os.homedir(), '.docker', 'config.json'),
        registriesCount: 0,
        registriesList: [],
        helperAvailable: false,
        rawAuthsCount: 0,
      };
    }

    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const credsStore = parsed.credsStore;
      const credHelpers = parsed.credHelpers || {};
      const auths = parsed.auths || {};

      let helperAvailable = false;
      let helperPath: string | undefined;

      if (credsStore) {
        const found = await this.findHelperBinary(credsStore);
        if (found) {
          helperAvailable = true;
          helperPath = found;
        }
      }

      // Collect all configured registry domains
      const domainsSet = new Set<string>();
      Object.keys(auths).forEach((k) => domainsSet.add(k));
      Object.keys(credHelpers).forEach((k) => domainsSet.add(k));

      // If helper is available, check list
      if (helperAvailable && helperPath) {
        try {
          const listOutput = await this.queryCredentialHelper(helperPath, 'list');
          if (listOutput && typeof listOutput === 'object') {
            Object.keys(listOutput).forEach((k) => domainsSet.add(k));
          }
        } catch {}
      }

      const registriesList = Array.from(domainsSet).map((k) => {
        const norm = this.normalizeRegistryDomain(k);
        return norm.domain;
      }).filter((v, i, a) => a.indexOf(v) === i);

      const rawAuthsCount = Object.keys(auths).filter((k) => !!auths[k]?.auth).length;

      return {
        exists: true,
        path: configPath,
        credsStore,
        credHelpers,
        registriesCount: registriesList.length,
        registriesList,
        helperAvailable,
        helperPath,
        rawAuthsCount,
      };
    } catch (e: any) {
      return {
        exists: true,
        path: configPath,
        registriesCount: 0,
        registriesList: [],
        helperAvailable: false,
        rawAuthsCount: 0,
      };
    }
  }

  /**
   * Imports credentials from ~/.docker/config.json and macOS Keychain helpers.
   */
  public async importDockerConfig(customFilePath?: string): Promise<DockerImportResult> {
    const configPath = customFilePath || this.findDockerConfigFile();
    if (!configPath || !fs.existsSync(configPath)) {
      return {
        success: false,
        imported: 0,
        updated: 0,
        skipped: 0,
        message: `Docker config file not found at ${configPath || '~/.docker/config.json'}.`,
        details: [],
      };
    }

    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const content = JSON.parse(raw);
      const auths = content.auths || {};
      const credsStore = content.credsStore;
      const credHelpers = content.credHelpers || {};

      const details: DockerImportDetail[] = [];
      let importedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      // 1. Process via Credential Helper (e.g. docker-credential-desktop on macOS)
      if (credsStore) {
        const helperBin = await this.findHelperBinary(credsStore);
        if (helperBin) {
          // Query list of all credentials stored in macOS Keychain
          let helperMap: Record<string, string> = {};
          try {
            const listRes = await this.queryCredentialHelper(helperBin, 'list');
            if (listRes && typeof listRes === 'object') {
              helperMap = listRes;
            }
          } catch {}

          // Union of servers from helper list and config.json auths
          const serversToQuery = new Set<string>([
            ...Object.keys(auths),
            ...Object.keys(helperMap),
          ]);

          for (const serverUrl of serversToQuery) {
            const norm = this.normalizeRegistryDomain(serverUrl);
            if (norm.isTokenSubpath) {
              // Skip access-token / refresh-token duplicate entries
              continue;
            }

            try {
              const credRes = await this.queryCredentialHelper(helperBin, 'get', serverUrl);
              const username = credRes.Username || '';
              const password = credRes.Secret || '';

              if (username && password) {
                const existing = this.getAll().find((c) => c.domain === norm.domain);
                const isUpdate = !!existing;

                this.save({
                  id: existing?.id,
                  name: this.generateFriendlyName(norm.domain, username),
                  domain: norm.domain,
                  username,
                  password,
                  insecure: false,
                  isAnonymous: false,
                });

                if (isUpdate) {
                  updatedCount++;
                  details.push({ domain: norm.domain, username, source: `Keychain (${credsStore})`, status: 'updated' });
                } else {
                  importedCount++;
                  details.push({ domain: norm.domain, username, source: `Keychain (${credsStore})`, status: 'added' });
                }
              }
            } catch {
              // Ignore single lookup failure
            }
          }
        }
      }

      // 2. Process per-domain credHelpers
      for (const [domainKey, helperName] of Object.entries(credHelpers)) {
        const norm = this.normalizeRegistryDomain(domainKey);
        if (norm.isTokenSubpath) continue;

        const helperBin = await this.findHelperBinary(helperName as string);
        if (helperBin) {
          try {
            const credRes = await this.queryCredentialHelper(helperBin, 'get', domainKey);
            const username = credRes.Username || '';
            const password = credRes.Secret || '';

            if (username && password) {
              const existing = this.getAll().find((c) => c.domain === norm.domain);
              const isUpdate = !!existing;

              this.save({
                id: existing?.id,
                name: this.generateFriendlyName(norm.domain, username),
                domain: norm.domain,
                username,
                password,
                insecure: false,
                isAnonymous: false,
              });

              if (isUpdate) {
                updatedCount++;
                details.push({ domain: norm.domain, username, source: `Helper (${helperName})`, status: 'updated' });
              } else {
                importedCount++;
                details.push({ domain: norm.domain, username, source: `Helper (${helperName})`, status: 'added' });
              }
            }
          } catch {}
        }
      }

      // 3. Process direct base64 auth entries in auths object
      for (const [domainKey, item] of Object.entries(auths) as [string, any][]) {
        if (item && item.auth) {
          try {
            const decoded = Buffer.from(item.auth, 'base64').toString('utf-8');
            const [username, ...pwParts] = decoded.split(':');
            const password = pwParts.join(':');
            const norm = this.normalizeRegistryDomain(domainKey);

            if (username && password) {
              const existing = this.getAll().find((c) => c.domain === norm.domain);
              const isUpdate = !!existing;

              this.save({
                id: existing?.id,
                name: this.generateFriendlyName(norm.domain, username),
                domain: norm.domain,
                username: username || '',
                password: password || '',
                insecure: false,
                isAnonymous: false,
              });

              if (isUpdate) {
                updatedCount++;
                details.push({ domain: norm.domain, username, source: 'config.json auths', status: 'updated' });
              } else {
                importedCount++;
                details.push({ domain: norm.domain, username, source: 'config.json auths', status: 'added' });
              }
            }
          } catch {}
        }
      }

      const totalProcessed = importedCount + updatedCount;
      const message = totalProcessed > 0
        ? `Successfully imported ${importedCount} new and updated ${updatedCount} registry credentials from Docker config.`
        : 'No active credentials found in Docker config or macOS Keychain.';

      return {
        success: totalProcessed > 0,
        imported: importedCount,
        updated: updatedCount,
        skipped: skippedCount,
        message,
        configPath,
        credsStore,
        details,
      };
    } catch (e: any) {
      return {
        success: false,
        imported: 0,
        updated: 0,
        skipped: 0,
        message: `Failed to import Docker config: ${e.message}`,
        details: [],
      };
    }
  }

  /**
   * Imports credentials from raw pasted JSON string or Kubernetes .dockerconfigjson content.
   */
  public async importFromRawJson(rawJson: string): Promise<DockerImportResult> {
    try {
      let contentStr = rawJson.trim();

      // Check if it's base64 encoded (like a raw k8s .dockerconfigjson secret payload)
      if (!contentStr.startsWith('{') && contentStr.length > 20) {
        try {
          const decoded = Buffer.from(contentStr, 'base64').toString('utf-8');
          if (decoded.trim().startsWith('{')) {
            contentStr = decoded.trim();
          }
        } catch {}
      }

      const parsed = JSON.parse(contentStr);
      const auths = parsed.auths || (parsed.auth ? { [parsed.domain || 'docker.io']: parsed } : parsed);

      let imported = 0;
      let updated = 0;
      const details: DockerImportDetail[] = [];

      for (const [domainKey, item] of Object.entries(auths) as [string, any][]) {
        let username = '';
        let password = '';

        if (item && item.auth) {
          const decoded = Buffer.from(item.auth, 'base64').toString('utf-8');
          const [u, ...pParts] = decoded.split(':');
          username = u;
          password = pParts.join(':');
        } else if (item && item.username && item.password) {
          username = item.username;
          password = item.password;
        }

        if (username && password) {
          const norm = this.normalizeRegistryDomain(domainKey);
          const existing = this.getAll().find((c) => c.domain === norm.domain);
          const isUpdate = !!existing;

          this.save({
            id: existing?.id,
            name: this.generateFriendlyName(norm.domain, username),
            domain: norm.domain,
            username,
            password,
            insecure: false,
            isAnonymous: false,
          });

          if (isUpdate) {
            updated++;
            details.push({ domain: norm.domain, username, source: 'Pasted JSON', status: 'updated' });
          } else {
            imported++;
            details.push({ domain: norm.domain, username, source: 'Pasted JSON', status: 'added' });
          }
        }
      }

      return {
        success: imported + updated > 0,
        imported,
        updated,
        skipped: 0,
        message: `Successfully processed JSON: ${imported} added, ${updated} updated.`,
        details,
      };
    } catch (e: any) {
      return {
        success: false,
        imported: 0,
        updated: 0,
        skipped: 0,
        message: `Invalid JSON format: ${e.message}`,
        details: [],
      };
    }
  }

  /**
   * Generates a standard OCI/Docker config.json and Kubernetes ImagePullSecret YAML from vault.
   */
  public exportDockerConfig(): DockerExportResult {
    const list = this.getAll().filter((c) => !c.isAnonymous && c.username && c.password);
    const authsObj: Record<string, { auth: string }> = {};

    for (const cred of list) {
      const authBase64 = Buffer.from(`${cred.username}:${cred.password}`).toString('base64');
      const domainKey = cred.domain === 'docker.io' ? 'https://index.docker.io/v1/' : cred.domain;
      authsObj[domainKey] = {
        auth: authBase64,
      };
    }

    const configDoc = {
      auths: authsObj,
    };

    const jsonStr = JSON.stringify(configDoc, null, 2);
    const base64Str = Buffer.from(jsonStr).toString('base64');

    const k8sSecretYaml = `apiVersion: v1
kind: Secret
metadata:
  name: registry-pull-secret
  namespace: default
type: kubernetes.io/dockerconfigjson
data:
  .dockerconfigjson: ${base64Str}
`;

    return {
      json: jsonStr,
      base64DockerConfig: base64Str,
      k8sSecretYaml,
      registriesCount: list.length,
    };
  }

  private getDefaultRegistries(): RegistryCredential[] {
    const defaultList: RegistryCredential[] = [
      {
        id: 'docker-hub-public',
        name: 'Docker Hub (Public / Anonymous)',
        domain: 'docker.io',
        username: '',
        password: '',
        insecure: false,
        isAnonymous: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'ghcr-public',
        name: 'GitHub Packages (Public / Anonymous)',
        domain: 'ghcr.io',
        username: '',
        password: '',
        insecure: false,
        isAnonymous: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'quay-public',
        name: 'Quay.io (Public / Anonymous)',
        domain: 'quay.io',
        username: '',
        password: '',
        insecure: false,
        isAnonymous: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'ocir-template',
        name: 'Oracle Cloud Container Registry (OCIR)',
        domain: 'fra.ocir.io',
        username: 'dockeruser',
        password: '',
        insecure: false,
        isAnonymous: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    this.persist(defaultList);
    return defaultList;
  }
}

