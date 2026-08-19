# Skopeo GUI for Mac (Apple Silicon / arm64)

A fast, modern native macOS GUI application for **[Skopeo](https://github.com/containers/skopeo)** designed for Apple Silicon (M1/M2/M3/M4) Macs.

Easily **batch-migrate container images** across registries (Oracle Cloud OCIR, Docker Hub, GitHub Packages, Quay.io, AWS ECR, GCP Artifact Registry, or self-hosted registries), manage credentials with encrypted storage, and allow unauthenticated / anonymous access for public mirrors.

---

## Key Features

### 1. Batch Container Image Migration
- **Multi-Image & Tag Discovery**: Fetch remote tags automatically or specify custom tag filters (e.g. `latest`, `v*`, regex patterns).
- **Cross-Registry Copying**: Move images between:
  - `docker://` (Remote Docker / OCI registries)
  - `oci://` (Local OCI directory format)
  - `dir:` (Local unpacked image directories)
  - `oci-archive:` & `docker-archive:` (Single-file container tarballs)
  - `docker-daemon:` (Local Docker daemon socket)
- **Multi-Architecture Support**: Toggle `--all` to copy all architecture variants (`linux/amd64`, `linux/arm64`, `windows/amd64`, etc.) in multi-arch manifests.
- **Concurrent Worker Pool**: Configurable concurrency (1 to 8 parallel transfers) with live progress bars and individual item status tracking.
- **Resilient Execution**: Cancel anytime or inspect failure logs.

### 2. Credential Vault & Anonymous Support
- **Encrypted Local Storage**: Passwords and auth tokens are encrypted using machine-bound AES-256-CBC encryption.
- **Unauthenticated / Anonymous Mode**: Toggle anonymous access per registry to pull and copy from open/public registries without authentication.
- **Insecure TLS Bypasses**: Toggle `--tls-verify=false` per registry or transfer.
- **1-Click Provider Presets**:
  - **Oracle Cloud Infrastructure Registry (OCIR)** (`fra.ocir.io`, `iad.ocir.io`, `phx.ocir.io`, etc.)
  - **Docker Hub** (`docker.io`)
  - **GitHub Container Registry (GHCR)** (`ghcr.io`)
  - **Quay.io** (`quay.io`)
  - **AWS ECR** (`*.dkr.ecr.*.amazonaws.com`)
  - **Local / Self-Hosted Insecure Registry** (`localhost:5000`)
- **Docker Config Importer**: Automatically import credentials from `~/.docker/config.json`.
- **Live Connection Test**: Verify authentication before saving to vault.

### 3. Image & Manifest Inspector
- Query remote manifests without pulling images.
- Inspect layer digests, OS / architecture, creation timestamps, and environment variables.
- Browse all published tags for any repository.

### 4. Real-time Terminal Console
- Live streaming output of all underlying Skopeo CLI execution with log levels, copy-all, and autoscroll.

---

## Installation & Requirements

### Requirements
- **macOS** on Apple Silicon (M1/M2/M3/M4, `arm64`)
- **Skopeo CLI** (automatically detected at `/opt/homebrew/bin/skopeo` or standard PATH)
  ```bash
  brew install skopeo
  ```

### Pre-built App & DMG
The build outputs are located in:
- **DMG Installer:** `release/Skopeo GUI-1.0.0-arm64.dmg`
- **Application Bundle:** `release/mac-arm64/Skopeo GUI.app`

---

## Development

```bash
# Install dependencies
npm install

# Start in development mode (Vite + Electron live-reload)
npm run app:dev

# Build production frontend and Electron main
npm run build && npm run build:electron

# Package standalone macOS Apple Silicon DMG installer
npm run dist:dmg
```

---

## License
MIT
