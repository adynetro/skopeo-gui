import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { app } from 'electron';
import { RegistryCredential } from '../types';

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
      target = {
        ...credential,
        id: `cred-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        createdAt: now,
        updatedAt: now,
      };
      list.push(target);
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

  public importDockerConfig(): { imported: number; message: string } {
    const dockerConfigPath = path.join(os.homedir(), '.docker', 'config.json');
    if (!fs.existsSync(dockerConfigPath)) {
      return { imported: 0, message: 'No ~/.docker/config.json file found' };
    }

    try {
      const content = JSON.parse(fs.readFileSync(dockerConfigPath, 'utf-8'));
      const auths = content.auths || {};
      const domains = Object.keys(auths);
      let count = 0;

      for (const domain of domains) {
        const item = auths[domain];
        if (item && item.auth) {
          const decoded = Buffer.from(item.auth, 'base64').toString('utf-8');
          const [username, ...pwParts] = decoded.split(':');
          const password = pwParts.join(':');

          const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/v[12]\/?$/, '');
          this.save({
            name: `Docker Config (${cleanDomain})`,
            domain: cleanDomain,
            username: username || '',
            password: password || '',
            insecure: false,
            isAnonymous: false,
          });
          count++;
        }
      }

      return { imported: count, message: `Successfully imported ${count} registry credentials from Docker config.` };
    } catch (e: any) {
      return { imported: 0, message: `Failed to import Docker config: ${e.message}` };
    }
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
        username: 'frwnfslc9lrx/oracleidentitycloudservice/username',
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
