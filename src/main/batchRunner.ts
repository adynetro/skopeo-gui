import { BrowserWindow } from 'electron';
import { BatchItem, BatchMigrationConfig } from '../types';
import { SkopeoService } from './skopeo';
import { CredentialService } from './credentials';

export class BatchRunner {
  private skopeo: SkopeoService;
  private creds: CredentialService;
  private currentAbortController: AbortController | null = null;
  private isRunning: boolean = false;
  private items: BatchItem[] = [];

  constructor(skopeo: SkopeoService, creds: CredentialService) {
    this.skopeo = skopeo;
    this.creds = creds;
  }

  public getStatus() {
    return {
      isRunning: this.isRunning,
      items: this.items,
    };
  }

  public cancel() {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
    this.isRunning = false;
  }

  public async startMigration(
    config: BatchMigrationConfig,
    window: BrowserWindow
  ): Promise<BatchItem[]> {
    if (this.isRunning) {
      throw new Error('A migration is already in progress.');
    }

    this.isRunning = true;
    this.currentAbortController = new AbortController();

    const allCreds = this.creds.getAll();
    const srcCred = config.srcRegistryId ? allCreds.find((c) => c.id === config.srcRegistryId) : undefined;
    const destCred = config.destRegistryId ? allCreds.find((c) => c.id === config.destRegistryId) : undefined;

    // Create item tasks depending on mode
    if (config.mode === 'multi-images' && config.imagesList && config.imagesList.length > 0) {
      this.items = config.imagesList.map((pair, index) => {
        const rawSrc = pair.src.trim();
        const srcRef = this.skopeo.formatImageUri(config.srcTransport, rawSrc);

        let rawDest = pair.dest?.trim() || '';
        if (!rawDest) {
          // If no custom destination was specified, derive it from destRepo prefix
          // e.g. destRepo = "docker.io/myorg", src = "docker.io/library/redis:alpine" -> "docker.io/myorg/redis:alpine"
          const imgClean = rawSrc.replace(/^([a-z-]+:\/\/)/, '');
          const imgParts = imgClean.split('/');
          const lastPart = imgParts[imgParts.length - 1]; // "redis:alpine"
          const destPrefix = (config.destRepo || '').replace(/\/+$/, '');
          rawDest = destPrefix ? `${destPrefix}/${lastPart}` : lastPart;
        }

        const destRef = this.skopeo.formatImageUri(config.destTransport, rawDest);
        const tagMatch = rawSrc.match(/:([^/:]+)$/);
        const tag = tagMatch ? tagMatch[1] : 'latest';
        const imageName = rawSrc.replace(/^([a-z-]+:\/\/)/, '').replace(/:[^/:]+$/, '');

        return {
          id: `task-img-${index}-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          srcReference: srcRef,
          destReference: destRef,
          tag,
          imageName,
          status: 'pending',
          progress: 0,
          logs: [],
        };
      });
    } else {
      // Tags mode (single repo, multiple tags)
      const selectedTags = config.selectedTags || ['latest'];
      this.items = selectedTags.map((tag) => {
        const srcRef = this.skopeo.formatImageUri(config.srcTransport, `${config.srcRepo || ''}:${tag}`);
        const destRef = this.skopeo.formatImageUri(config.destTransport, `${config.destRepo || ''}:${tag}`);
        return {
          id: `task-${tag}-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          srcReference: srcRef,
          destReference: destRef,
          tag,
          imageName: config.srcRepo,
          status: 'pending',
          progress: 0,
          logs: [],
        };
      });
    }

    const sendUpdate = (item: BatchItem) => {
      if (!window.isDestroyed()) {
        window.webContents.send('batch:item-update', item);
      }
    };

    const emitLog = (taskId: string, message: string, level: 'info' | 'warn' | 'error' | 'success' | 'cmd' = 'info') => {
      if (!window.isDestroyed()) {
        window.webContents.send('log:entry', {
          id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: new Date().toLocaleTimeString(),
          taskId,
          level,
          message,
        });
      }
    };

    const concurrency = Math.max(1, Math.min(config.concurrency || 2, 8));
    const queue = [...this.items];

    const worker = async () => {
      while (queue.length > 0) {
        if (!this.isRunning || this.currentAbortController?.signal.aborted) {
          break;
        }

        const item = queue.shift();
        if (!item) break;

        item.status = 'running';
        item.startedAt = new Date().toISOString();
        item.progress = 10;
        sendUpdate(item);
        emitLog(item.id, `Starting copy: ${item.srcReference} -> ${item.destReference}`, 'cmd');

        const startTime = Date.now();

        try {
          await this.skopeo.copy(
            item.srcReference,
            item.destReference,
            {
              srcCred,
              destCred,
              allArch: config.copyAllArchitectures,
              overrideArch: config.overrideArch,
              overrideOs: config.overrideOs,
              overrideVariant: config.overrideVariant,
              preserveDigests: config.preserveDigests,
              srcInsecure: config.srcInsecure,
              destInsecure: config.destInsecure,
              format: config.format,
              onLog: (line) => {
                item.logs.push(line);
                emitLog(item.id, line.trim(), 'info');
              },
              onProgress: (p) => {
                item.progress = Math.max(item.progress, p);
                sendUpdate(item);
              },
            },
            this.currentAbortController?.signal
          );

          item.status = 'completed';
          item.progress = 100;
          item.completedAt = new Date().toISOString();
          item.durationMs = Date.now() - startTime;
          sendUpdate(item);
          emitLog(item.id, `Successfully copied [${item.imageName || ''}:${item.tag}] in ${((item.durationMs || 0) / 1000).toFixed(1)}s`, 'success');
        } catch (err: any) {
          if (this.currentAbortController?.signal.aborted) {
            item.status = 'cancelled';
            item.error = 'Cancelled by user';
            emitLog(item.id, `Cancelled copy for [${item.imageName || ''}:${item.tag}]`, 'warn');
          } else {
            item.status = 'failed';
            item.error = err.message || String(err);
            emitLog(item.id, `Failed copying [${item.imageName || ''}:${item.tag}]: ${item.error}`, 'error');
          }
          sendUpdate(item);
        }
      }
    };

    // Run concurrency pool
    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);

    this.isRunning = false;
    this.currentAbortController = null;
    return this.items;
  }
}
