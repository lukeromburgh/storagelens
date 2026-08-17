# storagelens

**Project Name:** Large Asset & COS DevTools Inspector

**Goal:** Build a Chrome Extension (Manifest V3) that adds a dedicated DevTools panel for inspecting, debugging, and managing large browser storage assets (OPFS, Cache API, IndexedDB) and verifying Cross-Origin Storage (COS) content hashes.

---

### 1. Problem Statement

Developers building Web AI models, WebAssembly (Wasm) engines, and WebGPU applications regularly store multi-megabyte and gigabyte-sized files in the browser. Native Chrome DevTools provides no direct way to view the Origin Private File System (OPFS) directory tree, calculate cryptographic SHA-256 content hashes, or test local cache eviction without wiping the entire browser profile.

---

### 2. Target Audience

- **Web AI & WebGPU Engineers:** Developers running local models (Transformers.js, WebLLM, ONNX).
- **Wasm & Web Gaming Developers:** Teams deploying complex runtimes (Unity, Godot, CAD tools, video editors).
- **Frontend Performance Leads:** Engineers looking to audit CDN bandwidth waste caused by un-cached vendor assets.

---

### 3. Core Feature Requirements (MVP)

| Feature                           | Description                                                  | Acceptance Criteria                                                                           |
| --------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| **OPFS Directory Explorer**       | Visual tree view of the target site's OPFS filesystem.       | Displays all files/folders, full paths, and human-readable file sizes (KB/MB/GB).             |
| **SHA-256 Hash Verifier**         | Generates SHA-256 content hashes for stored files.           | Hashes multi-gigabyte files in the background without locking the main thread or freezing UI. |
| **Storage Management & Eviction** | Selective deletion of files/directories and cache clearing.  | Right-click to delete specific files/folders to test application cold-start behavior.         |
| **Bandwidth Telemetry**           | Intercepts large network fetches (`.wasm`, `.bin`, `.onnx`). | Calculates session bandwidth saved by local storage hits versus raw network downloads.        |

---

### 4. Technical Architecture

- **Extension Specification:** Manifest V3.
- **DevTools Panel (`devtools.js`):** Registers a custom tab named "Storage Inspector" using `chrome.devtools.panels.create`.
- **Injected Main-World Script:** Injected into the inspected webpage context to directly access `navigator.storage.getDirectory()` and the `caches` API (bypassing content-script sandbox limitations).
- **Background Service Worker:** Relays messages between the DevTools UI panel and the inspected webpage context.
- **Hashing Worker:** Dedicated Web Worker that uses `ReadableStream` and `crypto.subtle.digest` to process files in 50 MB chunks.

---

### 5. Development Milestones

**Phase 1: Core Storage Extraction (Week 1)**

- Set up Manifest V3 boilerplate and DevTools panel shell.
- Implement Main-World script injection via `chrome.scripting`.
- Write recursive directory walker for `FileSystemDirectoryHandle`.

**Phase 2: UI & Hashing Engine (Week 2)**

- Build tree-view component (using React, Svelte, or lightweight vanilla JS).
- Implement background Web Worker for chunked SHA-256 hashing.
- Wire up file deletion and storage flush actions.

**Phase 3: Telemetry & Launch (Week 3)**

- Attach listener to `chrome.devtools.network.onRequestFinished` to track binary assets over 1 MB.
- Add bandwidth savings calculator.
- Publish Free Tier to the Chrome Web Store.

---

### 6. Business & Monetization Plan

- **Free Community Tier:** OPFS directory tree view, manual hash calculation, and individual file deletion.
- **Pro Tier ($12/user/month):**
- **Team Build-Manifest Sync:** Compares local hashes against team CI/CD deployment manifests.
- **Network Mocking:** Synthetic cache-miss toggles to simulate first-time user visits under slow network constraints.
- **Audit Exporter:** Generates downloadable PDF/JSON reports on storage usage and CDN bandwidth waste.
