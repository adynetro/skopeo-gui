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

export interface ImagePlatform {
  os: string;
  architecture: string;
  variant?: string;
}

export interface SbomPackage {
  name: string;
  version: string;
  type: string; // 'apk' | 'deb' | 'rpm' | 'npm' | 'pypi' | 'golang' | 'cargo' | 'os' | 'library'
  license?: string;
  supplier?: string;
  purl?: string;
}

export interface PackageVulnerability {
  id: string; // e.g. "CVE-2025-27516" or "GHSA-cpwx-vrp4-4pq7"
  aliases: string[]; // ["CVE-2025-27516"]
  packageName: string;
  packageVersion: string;
  packageType: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  score?: string; // CVSS score
  summary: string;
  details?: string;
  fixedVersion?: string;
  referenceUrls?: string[];
  published?: string;
}

export interface VulnerabilitySummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  unknown: number;
}

export type VulnerabilityDataSource = 'osv' | 'docker_scout' | 'trivy' | 'grype' | 'alpine_secdb';

export interface ScannerEngineInfo {
  id: VulnerabilityDataSource;
  name: string;
  isAvailable: boolean;
  version?: string;
  description: string;
}

export interface VulnerabilityScanResult {
  imageRef: string;
  scannedAt: string;
  scannedPackagesCount: number;
  summary: VulnerabilitySummary;
  vulnerabilities: PackageVulnerability[];
  scannerEngine: string;
  dataSource?: VulnerabilityDataSource;
  error?: string;
}

export interface SbomInspection {
  imageRef: string;
  digest?: string;
  os?: string;
  architecture?: string;
  availablePlatforms?: ImagePlatform[];
  format: 'SPDX' | 'CycloneDX' | 'Cosign-Attestation' | 'Layer-Inspection' | 'Labels' | 'None';
  specVersion?: string;
  creationTimestamp?: string;
  tool?: string;
  packages: SbomPackage[];
  hasCosignSignature: boolean;
  cosignSignatureTag?: string;
  hasSbomArtifact: boolean;
  sbomArtifactTag?: string;
  hasAttestation: boolean;
  rawJSON?: any;
  vulnerabilityScan?: VulnerabilityScanResult;
  error?: string;
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
  destRepo?: string;
  selectedTags?: string[];
  imagesList?: ImageTransferPair[];
  copyAllArchitectures: boolean; // --all
  overrideArch?: string;
  overrideOs?: string;
  overrideVariant?: string;
  preserveDigests?: boolean; // --preserve-digests
  srcInsecure: boolean;
  destInsecure: boolean;
  format?: 'v2s1' | 'v2s2' | 'oci'; // if undefined, preserve source format / disable conversion
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

export interface DockerConfigInfo {
  exists: boolean;
  path: string;
  credsStore?: string;
  credHelpers?: Record<string, string>;
  registriesCount: number;
  registriesList: string[];
  helperAvailable: boolean;
  helperPath?: string;
  rawAuthsCount: number;
}

export interface DockerImportDetail {
  domain: string;
  username: string;
  source: string;
  status: 'added' | 'updated' | 'skipped';
}

export interface DockerImportResult {
  success: boolean;
  imported: number;
  updated: number;
  skipped: number;
  message: string;
  configPath?: string;
  credsStore?: string;
  details: DockerImportDetail[];
}

export interface DockerExportResult {
  json: string;
  base64DockerConfig: string;
  k8sSecretYaml: string;
  registriesCount: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success' | 'cmd';
  message: string;
  taskId?: string;
}

export interface CosignKeyPair {
  id: string;
  name: string;
  publicKey: string; // PEM format
  privateKey?: string; // PEM format (encrypted in vault)
  algorithm: 'ECDSA_P256' | 'ED25519';
  createdAt: string;
}

export interface CosignVerificationResult {
  verified: boolean;
  imageRef: string;
  digest: string;
  os?: string;
  architecture?: string;
  signatureTag?: string;
  signedAt?: string;
  signerIdentity?: string;
  issuer?: string;
  algorithm?: string;
  payload?: any;
  rawSignature?: string;
  certificateDetails?: {
    subject?: string;
    issuer?: string;
    validFrom?: string;
    validTo?: string;
    sanList?: string[];
  };
  error?: string;
}

export interface CosignSignResult {
  success: boolean;
  imageRef: string;
  digest: string;
  os?: string;
  architecture?: string;
  signatureTag: string;
  signedAt: string;
  keyId?: string;
  error?: string;
}


