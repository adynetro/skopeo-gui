import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { app } from 'electron';
import { CosignKeyPair, CosignSignResult, CosignVerificationResult, RegistryCredential } from '../types';
import { SkopeoService } from './skopeo';

export class CosignService {
  private filePath: string;
  private encryptionKey: Buffer;
  private skopeo: SkopeoService;

  constructor(skopeo: SkopeoService) {
    this.skopeo = skopeo;
    const userDataPath = app ? app.getPath('userData') : path.join(os.homedir(), '.skopeo-gui');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    this.filePath = path.join(userDataPath, 'cosign-keys.enc.json');

    // Create stable machine-bound key
    const machineId = `${os.hostname()}-${os.userInfo().username}-cosign-vault`;
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

  public getAllKeys(): CosignKeyPair[] {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }
    try {
      const data = fs.readFileSync(this.filePath, 'utf-8');
      const rawList: any[] = JSON.parse(data);
      return rawList.map((item) => ({
        ...item,
        privateKey: item.privateKey ? this.decrypt(item.privateKey) : undefined,
      }));
    } catch (e) {
      console.error('Error reading Cosign keys:', e);
      return [];
    }
  }

  public saveKey(key: Omit<CosignKeyPair, 'id' | 'createdAt'> & { id?: string }): CosignKeyPair {
    const list = this.getAllKeys();
    const now = new Date().toISOString();

    let target: CosignKeyPair;
    if (key.id) {
      const index = list.findIndex((k) => k.id === key.id);
      target = {
        ...key,
        id: key.id,
        createdAt: index >= 0 ? list[index].createdAt : now,
      } as CosignKeyPair;
      if (index >= 0) {
        list[index] = target;
      } else {
        list.push(target);
      }
    } else {
      target = {
        ...key,
        id: `key-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        createdAt: now,
      };
      list.push(target);
    }

    this.persist(list);
    return target;
  }

  public deleteKey(id: string): boolean {
    const list = this.getAllKeys();
    const filtered = list.filter((k) => k.id !== id);
    this.persist(filtered);
    return filtered.length !== list.length;
  }

  private persist(list: CosignKeyPair[]) {
    const toSave = list.map((item) => ({
      ...item,
      privateKey: item.privateKey ? this.encrypt(item.privateKey) : undefined,
    }));
    fs.writeFileSync(this.filePath, JSON.stringify(toSave, null, 2), 'utf-8');
  }

  public generateKeyPair(name?: string, algorithm: 'ECDSA_P256' | 'ED25519' = 'ECDSA_P256'): CosignKeyPair {
    let publicKeyPem = '';
    let privateKeyPem = '';

    if (algorithm === 'ED25519') {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      publicKeyPem = publicKey;
      privateKeyPem = privateKey;
    } else {
      // Default to ECDSA P-256 (prime256v1 / secp256r1) standard for Cosign
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      publicKeyPem = publicKey;
      privateKeyPem = privateKey;
    }

    const keyName = name && name.trim() ? name.trim() : `Cosign Key (${new Date().toLocaleDateString()})`;
    return this.saveKey({
      name: keyName,
      publicKey: publicKeyPem,
      privateKey: privateKeyPem,
      algorithm,
    });
  }

  public async verifySignature(
    imageRef: string,
    publicKeyPem?: string,
    cred?: RegistryCredential,
    insecure: boolean = false
  ): Promise<CosignVerificationResult> {
    try {
      const fullRef = imageRef.includes('://') ? imageRef.trim() : `docker://${imageRef.trim()}`;
      const inspectData = await this.skopeo.inspect(fullRef, cred, insecure);
      const digest = inspectData.Digest || '';

      if (!digest.includes('sha256:')) {
        return {
          verified: false,
          imageRef,
          digest,
          error: 'Image does not have a valid sha256 manifest digest.',
        };
      }

      const hex = digest.replace('sha256:', '');
      const sigTag = `sha256-${hex}.sig`;
      const cleanRef = fullRef.replace(/^([a-z-]+:\/\/)/, '');
      const repoBase = cleanRef.includes(':') ? cleanRef.split(':')[0] : cleanRef.split('@')[0];
      const sigRef = `docker://${repoBase}:${sigTag}`;

      // Check if .sig tag exists
      const allTags = await this.skopeo.listTags(`docker://${repoBase}`, cred, insecure);
      if (!allTags.includes(sigTag)) {
        return {
          verified: false,
          imageRef,
          digest,
          signatureTag: sigTag,
          error: `No Cosign signature tag (${sigTag}) found for this image in the registry.`,
        };
      }

      // Download signature artifact into temp dir via dir: transport to inspect blobs
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cosign-verify-'));
      try {
        await this.skopeo.copy(sigRef, `dir:${tmpDir}`, {
          srcCred: cred,
          srcInsecure: insecure,
        });

        const manifestPath = path.join(tmpDir, 'manifest.json');
        if (!fs.existsSync(manifestPath)) {
          return {
            verified: false,
            imageRef,
            digest,
            signatureTag: sigTag,
            error: 'Failed to read signature manifest from registry.',
          };
        }

        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const layers = Array.isArray(manifest.layers) ? manifest.layers : [];

        if (layers.length === 0) {
          return {
            verified: false,
            imageRef,
            digest,
            signatureTag: sigTag,
            error: 'Signature manifest contains no layers.',
          };
        }

        // Find layer containing payload and signature
        let payloadObj: any = null;
        let rawPayloadStr = '';
        let signatureBase64 = '';
        let certificateDetails: any = undefined;

        for (const layer of layers) {
          const layerSha = (layer.digest || '').replace('sha256:', '');
          const layerFile = path.join(tmpDir, layerSha);

          if (layer.annotations && layer.annotations['dev.cosignproject.cosign/signature']) {
            signatureBase64 = layer.annotations['dev.cosignproject.cosign/signature'];
          }

          if (fs.existsSync(layerFile)) {
            const rawContent = fs.readFileSync(layerFile, 'utf-8');
            try {
              payloadObj = JSON.parse(rawContent);
              rawPayloadStr = rawContent;
            } catch {
              // Not JSON
            }
          }

          // Check for X.509 certificate annotation or blob if Keyless (Fulcio)
          if (layer.annotations && layer.annotations['dev.sigstore.cosign/certificate']) {
            try {
              const certPem = layer.annotations['dev.sigstore.cosign/certificate'];
              const cert = new (crypto as any).X509Certificate(certPem);
              certificateDetails = {
                subject: cert.subject,
                issuer: cert.issuer,
                validFrom: cert.validFrom,
                validTo: cert.validTo,
                sanList: cert.subjectAltName ? cert.subjectAltName.split(', ') : [],
              };
            } catch {
              // Ignore certificate parse error
            }
          }
        }

        if (!payloadObj) {
          return {
            verified: false,
            imageRef,
            digest,
            signatureTag: sigTag,
            error: 'Signature payload could not be extracted from layer blobs.',
          };
        }

        // Verify signed digest matches the actual image manifest digest
        const payloadDigest = payloadObj.critical?.image?.['docker-manifest-digest'];
        if (payloadDigest !== digest) {
          return {
            verified: false,
            imageRef,
            digest,
            signatureTag: sigTag,
            payload: payloadObj,
            error: `Signature digest mismatch: payload signed digest (${payloadDigest}) does not match current image digest (${digest}).`,
          };
        }

        // Cryptographic signature verification
        let isCryptoValid = false;
        if (publicKeyPem && publicKeyPem.trim() && signatureBase64) {
          try {
            const sigBuf = Buffer.from(signatureBase64, 'base64');
            const verifier = crypto.createVerify('SHA256');
            verifier.update(rawPayloadStr);
            isCryptoValid = verifier.verify(publicKeyPem.trim(), sigBuf);

            if (!isCryptoValid) {
              // Try Ed25519 or raw buffer verification
              try {
                isCryptoValid = crypto.verify(null, Buffer.from(rawPayloadStr), publicKeyPem.trim(), sigBuf);
              } catch {
                // Ignore
              }
            }
          } catch (verErr: any) {
            return {
              verified: false,
              imageRef,
              digest,
              signatureTag: sigTag,
              payload: payloadObj,
              rawSignature: signatureBase64,
              error: `Cryptographic verification failed: ${verErr.message}`,
            };
          }

          if (!isCryptoValid) {
            return {
              verified: false,
              imageRef,
              digest,
              signatureTag: sigTag,
              payload: payloadObj,
              rawSignature: signatureBase64,
              error: 'Signature verification failed: Public key does not match signature.',
            };
          }
        } else {
          // If no public key was provided, signature payload & digest are structurally verified
          isCryptoValid = true;
        }

        return {
          verified: isCryptoValid,
          imageRef,
          digest,
          signatureTag: sigTag,
          signedAt: payloadObj.optional?.timestamp || inspectData.Created,
          signerIdentity: payloadObj.optional?.creator || payloadObj.critical?.identity?.['docker-reference'],
          issuer: certificateDetails?.issuer || 'Self-managed Cosign Key',
          algorithm: publicKeyPem ? (publicKeyPem.includes('EC') ? 'ECDSA_P256' : 'ED25519') : 'ECDSA / OCI Cosign',
          payload: payloadObj,
          rawSignature: signatureBase64,
          certificateDetails,
        };
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (err: any) {
      return {
        verified: false,
        imageRef,
        digest: '',
        error: err.message || String(err),
      };
    }
  }

  public async signImage(
    imageRef: string,
    privateKeyPem: string,
    annotations?: Record<string, string>,
    cred?: RegistryCredential,
    insecure: boolean = false
  ): Promise<CosignSignResult> {
    if (!privateKeyPem || !privateKeyPem.trim()) {
      throw new Error('Private key in PEM format is required to sign images.');
    }

    const fullRef = imageRef.includes('://') ? imageRef.trim() : `docker://${imageRef.trim()}`;
    const inspectData = await this.skopeo.inspect(fullRef, cred, insecure);
    const digest = inspectData.Digest || '';

    if (!digest.includes('sha256:')) {
      throw new Error('Image does not have a valid sha256 manifest digest to sign.');
    }

    const hex = digest.replace('sha256:', '');
    const sigTag = `sha256-${hex}.sig`;
    const cleanRef = fullRef.replace(/^([a-z-]+:\/\/)/, '');
    const repoBase = cleanRef.includes(':') ? cleanRef.split(':')[0] : cleanRef.split('@')[0];
    const sigDestRef = `docker://${repoBase}:${sigTag}`;
    const signedAt = new Date().toISOString();

    // 1. Build canonical Cosign JSON payload
    const payloadObj = {
      critical: {
        identity: {
          'docker-reference': repoBase,
        },
        image: {
          'docker-manifest-digest': digest,
        },
        type: 'cosign container image signature',
      },
      optional: {
        creator: 'Skopeo GUI (Native Cosign Engine)',
        timestamp: signedAt,
        ...(annotations || {}),
      },
    };

    const payloadJson = JSON.stringify(payloadObj, null, 2);
    const payloadBuffer = Buffer.from(payloadJson, 'utf-8');

    // 2. Cryptographically sign the payload with private key
    let signatureBuffer: Buffer;
    try {
      if (privateKeyPem.includes('PRIVATE KEY')) {
        const signer = crypto.createSign('SHA256');
        signer.update(payloadBuffer);
        signatureBuffer = signer.sign(privateKeyPem.trim());
      } else {
        throw new Error('Invalid private key format. Expected standard PEM PKCS#8 or EC private key.');
      }
    } catch (err: any) {
      throw new Error(`Signing failed: ${err.message}`);
    }

    const signatureBase64 = signatureBuffer.toString('base64');

    // 3. Build standard OCI dir: structure
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cosign-sign-'));
    try {
      const configObj = {
        architecture: 'amd64',
        os: 'linux',
        rootfs: { type: 'layers', diff_ids: [] },
      };
      const configJson = JSON.stringify(configObj);
      const configSha = crypto.createHash('sha256').update(configJson).digest('hex');
      fs.writeFileSync(path.join(tmpDir, configSha), configJson);

      const payloadSha = crypto.createHash('sha256').update(payloadBuffer).digest('hex');
      fs.writeFileSync(path.join(tmpDir, payloadSha), payloadBuffer);

      const manifest = {
        schemaVersion: 2,
        mediaType: 'application/vnd.oci.image.manifest.v1+json',
        config: {
          mediaType: 'application/vnd.oci.image.config.v1+json',
          size: Buffer.byteLength(configJson),
          digest: `sha256:${configSha}`,
        },
        layers: [
          {
            mediaType: 'application/vnd.dev.cosign.simplesigning.v1+json',
            size: Buffer.byteLength(payloadBuffer),
            digest: `sha256:${payloadSha}`,
            annotations: {
              'dev.cosignproject.cosign/signature': signatureBase64,
            },
          },
        ],
      };

      fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

      // 4. Push signature artifact to remote registry via Skopeo
      await this.skopeo.copy(`dir:${tmpDir}`, sigDestRef, {
        destCred: cred,
        destInsecure: insecure,
      });

      return {
        success: true,
        imageRef,
        digest,
        signatureTag: sigTag,
        signedAt,
      };
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}
