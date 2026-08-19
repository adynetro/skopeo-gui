# Changelog

All notable changes to **Skopeo GUI** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-08-20

### 🚀 Initial Release of Skopeo GUI for macOS (Apple Silicon / arm64)

Skopeo GUI is a fast, native desktop interface for **[Skopeo](https://github.com/containers/skopeo)** and **[Sigstore Cosign](https://github.com/sigstore/cosign)**, designed to manage, replicate, inspect, and sign container images without requiring a local Docker daemon.

---

### ✨ Key Features & Capabilities

#### 1. 🚀 Batch Container Migration & Replication
- **Multi-Image Matrix Mode**: Move lists of source images with automatic destination repository routing (e.g. mirror images directly into Oracle Cloud OCIR tenancies, AWS ECR, or self-hosted registries).
- **Tag Mode**: Discover all published tags for any remote repository and selectively batch-copy desired versions.
- **Cross-Transport Support**:
  - `docker://` (Remote Docker / OCI registries)
  - `oci://` (Local OCI directory layout)
  - `dir:` (Local unpacked filesystem directories)
  - `oci-archive:` & `docker-archive:` (Single-file container tarballs)
  - `docker-daemon:` (Local Docker daemon socket)
- **Multi-Architecture Mirroring**: Toggle `--all` to copy all architecture variants in multi-arch images.
- **Concurrent Worker Pool**: Configurable concurrency (1 to 8 parallel workers) with live progress bars, real-time logging, and abort/cancellation support.

#### 2. 🛡️ Live Vulnerability & CVE Scanner
- **Google / OpenSSF OSV Database Engine**: Direct queries against the Open Source Vulnerabilities (OSV.dev) database (aggregating NVD, GitHub Advisory Database, Alpine/Debian security trackers, and ecosystem databases) with zero external binary dependencies.
- **1-Click Scanning**: Scan all discovered SBOM packages (`apk`, `deb`, `rpm`, `npm`, `pypi`, `golang`, `cargo`, `maven`, `nuget`, etc.) for known CVEs.
- **Severity Breakdown**: Color-coded risk categorization into **Critical**, **High**, **Medium**, and **Low** with CVSS vector scores.
- **Remediation & Fix Suggestions**: Instant display of recommended fix versions (e.g. `Fixed in >= 3.1.6`).
- **Interactive Filtering & Search**: Filter by severity level or search by CVE ID, package name, or advisory text.
- **Export Reports**: Download structured JSON vulnerability audit reports.

#### 3. ✍️ Native Cosign Signing, Verification & Key Vault
- **Zero-Binary Cosign Engine**: Sign and verify container images natively using Node.js built-in `crypto` module (ECDSA P-256 and Ed25519) and Skopeo OCI transports.
- **Sigstore OCI SimpleSigning Compatibility**: Fully compatible with official `cosign verify` and OCI registry standards (`sha256-<digest>.sig` tags).
- **Multi-Architecture Signing & Verification**: Sign and verify specific platform variants (e.g. `linux/amd64`, `linux/arm64`) as well as multi-arch root index digests.
- **Encrypted Key Vault**: Generate and store password-protected ECDSA P-256 / Ed25519 key pairs encrypted with machine-bound AES-256-CBC.
- **Keyless X.509 Certificate Verification**: Decodes and inspects Sigstore Fulcio certificates (Subject, Issuer, Validity window, SANs).
- **Custom Claims & Annotations**: Add metadata (e.g. `git-sha`, `build-id`, `release-env`, `author`) to signatures.
- **Export Keys**: Download `cosign.pub` and `cosign.key` files for CI/CD pipelines.

#### 4. 📦 Security & SBOM Inspector
- **Automated SBOM Discovery**: Automatically detects and parses detached OCI SBOM artifacts (`.sbom` tags), inline SPDX 2.3 and CycloneDX 1.5 documents, and image label metadata.
- **Supply Chain Badges**: Verifies presence of Cosign signatures (`.sig` tags) and SLSA / in-toto attestations (`.att` tags).
- **Package Inventory Browser**: Search and filter discovered packages with type badges, license info, suppliers, and Package URLs (PURLs).
- **Export SBOM**: Download normalized SBOM JSON files.

#### 5. 🖥️ Multi-Architecture Platform Selector & Inspector
- **Target Platform Architecture Selector**: Inspect container images and SBOMs for specific platform architectures (defaulting to **`linux/amd64`** for cloud servers or **`linux/arm64`** for Apple Silicon / ARM servers).
- **Automatic Manifest Discovery**: Detects all platform variants in OCI / Docker manifest lists (`linux/amd64`, `linux/arm64`, `linux/arm/v7`, `linux/ppc64le`, `linux/s390x`, `windows/amd64`).
- **1-Click Architecture Switcher**: Dynamically re-inspect layer digests, packages, and environment variables across architectures.

#### 6. 🔑 Encrypted Credential Vault & Registry Presets
- **Machine-Bound AES-256-CBC Encryption**: Safely store registry passwords and API tokens on disk.
- **Anonymous / Public Registry Mode**: Pull and copy from open/public registries without credentials.
- **Insecure TLS Bypasses**: Toggle `--tls-verify=false` per registry for local or self-hosted registries.
- **1-Click Registry Provider Presets**:
  - **Oracle Cloud Infrastructure Registry (OCIR)** (`fra.ocir.io`, `iad.ocir.io`, `phx.ocir.io`, etc.)
  - **Docker Hub** (`docker.io`)
  - **GitHub Container Registry (GHCR)** (`ghcr.io`)
  - **Quay.io** (`quay.io`)
  - **AWS ECR** (`*.dkr.ecr.*.amazonaws.com`)
  - **Local / Self-Hosted Insecure Registry** (`localhost:5000`)
- **Docker Config Importer**: 1-click credential import from `~/.docker/config.json`.
- **Live Connection Test**: Verify credentials before saving.

#### 7. 🔍 Remote Image & Tag Management
- **Remote Manifest Inspection**: Query layers, digests, sizes, env variables, and labels without pulling images.
- **Tag Discovery**: Discover and filter all published tags for any remote repository.
- **Remote Image Deletion**: Delete tags and manifests directly from remote registries via Skopeo.

#### 8. 📟 Real-Time Terminal Console
- Live streaming output of all underlying Skopeo CLI executions with syntax highlighting, log levels, copy buttons, and autoscroll.

---

### 📦 Artifacts & Packaging
- **Standalone DMG Installer:** `release/Skopeo GUI-1.0.0-arm64.dmg`
- **Application Bundle:** `release/mac-arm64/Skopeo GUI.app`
- **Architecture:** Apple Silicon (`arm64` - M1, M2, M3, M4)
- **macOS Compatibility:** macOS 12.0 (Monterey) and higher
