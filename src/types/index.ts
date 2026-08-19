export interface RegistryCredential {
  id: string;
  name: string;
  domain: string;
  username: string;
  password?: string;
  insecure: boolean;
  isAnonymous: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RegistryPreset {
  name: string;
  domain: string;
  description: string;
  defaultInsecure: boolean;
  defaultAnonymous: boolean;
  helpText?: string;
  docUrl?: string;
}

export interface ImageInspection {
  Name?: string;
  Tag?: string;
  Digest?: string;
  RepoTags?: string[];
  Created?: string;
  DockerVersion?: string;
  Labels?: Record<string, string>;
  Architecture?: string;
  Os?: string;
  Layers?: string[];
  Env?: string[];
  ManifestType?: string;
  RawJSON?: any;
}

export type TransportType = 'docker' | 'oci' | 'oci-archive' | 'dir' | 'docker-archive' | 'docker-daemon';

export interface BatchItem {
  id: string;
  srcReference: string;
  destReference: string;
  tag: string;
  imageName?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  logs: string[];
  error?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

export interface ImageTransferPair {
  src: string;
  dest?: string;
}

export interface BatchMigrationConfig {
  name: string;
  mode: 'tags' | 'multi-images';
  srcRegistryId?: string;
  destRegistryId?: string;
  srcTransport: TransportType;
  destTransport: TransportType;
  srcRepo?: string;
  destRepo?: string; // Can be full destination repo or a destination namespace/prefix e.g. "fra.ocir.io/tenancy/mirror"
  selectedTags?: string[];
  imagesList?: ImageTransferPair[];
  copyAllArchitectures: boolean; // --all
  srcInsecure: boolean;
  destInsecure: boolean;
  format?: 'v2s1' | 'v2s2' | 'oci';
  concurrency: number;
}

export interface AppSettings {
  skopeoPath: string;
  skopeoVersion?: string;
  isSkopeoInstalled: boolean;
  defaultConcurrency: number;
  autoImportDockerAuth: boolean;
  tempDirectory: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success' | 'cmd';
  message: string;
  taskId?: string;
}
