# Changelog

All notable changes to **Skopeo GUI** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.3] - 2026-08-21

### 🚀 Highlights in 1.2.3

#### 1. 🏗️ Multi-Architecture Platform Picker & Manifest Conversion Controls
- **Target Architecture Selector**: Easily choose between **All Architectures (`--all`)**, single architectures (`linux/amd64`, `linux/arm64`, `linux/arm/v7`, `linux/ppc64le`, `linux/s390x`, `linux/riscv64`, `windows/amd64`), Host Native, or custom OS/Arch/Variant configurations.
- **Manifest Conversion Toggle**: Added an explicit toggle to disable manifest conversion (enabled by default) to preserve source manifests and prevent `Unknown media type during manifest conversion: "application/vnd.in-toto+json"` failures on modern multi-arch images with in-toto attestations.
- **Preserve Manifest Digests**: Added support for `--preserve-digests`.

#### 2. ⚡ Smart Destination Target Auto-Fill
- **1-Click Destination Namespace**: Selecting a vault credential automatically populates the destination target prefix and repository with the credential's domain.
- **Quick Action Fill**: Added dedicated "Use Credential Domain" helper button.

#### 3. 🖥️ Window & UI Refinements
- **Expanded Window Dimensions**: Increased default window size to 1440x940 (minimum 1080x720) for optimal viewing of all matrixes and logs.
- **Image Inspector Cleanup**: Removed remote delete button from the Image Inspector for a streamlined, read-only inspection workflow.

---

## [1.2.0] - 2026-08-21

### 🚀 Highlights in 1.2.0

#### 1. 🛡️ Multi-Datasource & Alternative Scanner Engines
- **Docker Scout CLI Integration**: Built-in support for Docker Scout to match Docker Hub vulnerability classifications (Critical, High, Medium, Low) exactly.
- **Deep Layer Package Discovery**: Unpacks container layer filesystems on the fly to discover all installed OS packages (Alpine APK `/lib/apk/db/installed`, Debian/Ubuntu DPKG `/var/lib/dpkg/status`, RPM, Go binaries/modules) even when an image does not have an attached `.sbom` artifact.
- **Multi-Engine Selector**: Switch seamlessly between **OSV.dev + Alpine SecDB (Cloud Multi-Datasource)**, **Docker Scout CLI**, **Trivy CLI (Aqua Security)**, and **Grype CLI (Anchore)** with instant re-scan capabilities.
- **Engine Badges & Scope Metrics**: Displays active engine name and exact number of inspected packages with layer inspection tags.

#### 2. 📦 CycloneDX v1.5 SBOM & VEX Exporter
- **CycloneDX Standard Export**: Export complete Software Bill of Materials in official CycloneDX v1.5 JSON schema (`bomFormat: "CycloneDX"`, `specVersion: "1.5"`).
- **Vulnerability Extensions (VEX)**: Embeds identified CVEs, CVSS ratings, severity levels, and remediation upgrade paths directly into the CycloneDX report.

#### 3. 📕 Professional PDF Security Audit Report Exporter
- **Publication-Ready PDF Reports**: 1-click export of executive security audit reports via native Electron `printToPDF`.
- **Executive Summary & Risk Badges**: Highlights critical/high risks with color-coded badges, platform metadata, and signature status.
- **Comprehensive CVE Breakdown**: Detailed table with CVE IDs, affected packages, fix versions, CVSS base scores, and remediation recommendations.

---

## [1.1.1] - 2026-08-20

### 🔧 Fixes & Enhancements
- **Fix Registry Connection Test (HTTP 400 Bad Request)**: Switched the connection test to use native `skopeo login` challenge-response protocol instead of querying `/tags/list` without a repository path.
- **Repository Path Support**: Enhanced connection testing to support both global server roots and scoped tenancy/namespace paths (e.g. Oracle Cloud OCIR `docker.io/myorg/myrepo`).
- **Human-Readable Error Messages**: Clear error messages for invalid passwords, access permission issues, or network timeouts.


---

## [1.1.0] - 2026-08-20


### 🚀 Highlights in 1.1.0

#### 1. 🔑 Full macOS Keychain & Docker Desktop `dockerconfig.json` Integration
- **Automatic Helper Discovery**: Discovers and interacts with `docker-credential-desktop`, `docker-credential-osxkeychain`, and domain-specific `credHelpers`.
- **macOS Keychain Decryption**: Queries and extracts real passwords/tokens from the macOS Keychain rather than failing on empty auth objects in `~/.docker/config.json`.
- **1-Click Import & Status**: Live Docker config detection card showing configured registry count and 1-click import.
- **Custom File Chooser & Paste JSON**: Import custom `.dockerconfigjson` files from disk or paste raw JSON / base64 secret tokens.
- **Multi-Format Export**: Export the vault to standard `dockerconfig.json`, Kubernetes `ImagePullSecret` YAML, or base64 token.
- **Interactive Guide**: Built-in macOS Docker & Keychain explanation guide.

#### 2. 🛡️ Precise CVSS v3.1 / v3.0 / v4.0 Vulnerability Severity Scoring
- **Full FIRST / NIST CVSS v3.1 Formula**: Implemented exact mathematical base score calculator ($0.0 - 10.0$) from CVSS vector strings.
- **Multi-Version CVSS & Metric Support**: Calculates exact scores for CVSS v3.1, v3.0, v2.0, and evaluates CVSS v4.0 vectors.
- **Accurate Severity Bucketing**: Properly classifies vulnerabilities into **CRITICAL** ($\ge 9.0$), **HIGH** ($7.0 - 8.9$), **MEDIUM** ($4.0 - 6.9$), and **LOW** ($0.1 - 3.9$) instead of defaulting to Medium.
- **Advisory & Ecosystem Urgency**: Resolves GitHub Advisory severities, Debian/Ubuntu urgency ratings, and contextual heuristics.
- **CVSS Score Badges in UI**: Displays formatted scores (e.g. `CVSS: 8.6 (CVSS:3.1)`) on vulnerability cards.

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

### 📦 Downloads & Releases
- **DMG & ZIP Downloads:** [**GitHub Releases**](https://github.com/adynetro/skopeo-gui/releases)
- **Architecture:** Apple Silicon (`arm64` - M1, M2, M3, M4)
- **macOS Compatibility:** macOS 12.0 (Monterey) and higher

