Building StorageLens requires wiring up a Manifest V3 extension architecture that bridges Chrome's DevTools API with page-level storage access in six sequential steps.

1. **Configure Manifest V3 & Extension Entry Points:** Prerequisite: Manifest V3 with devtools_page and scripting permissions.
   Create `manifest.json` declaring `manifest_version: 3`, set `"devtools_page": "devtools.html"`, and grant `"scripting"`, `"activeTab"`, and `"host_permissions": ["<all_urls>"]`. Configure `background.js` as a Service Worker to route messages between contexts.
2. **Create the DevTools Panel Shell:**
   In `devtools.js`, register the panel via `chrome.devtools.panels.create("StorageLens", "icon.png", "panel.html")`. Build `panel.html` using a UI framework (React, Svelte, or vanilla JS) featuring a tree-navigation pane, a file detail viewer, and a telemetry summary bar.
3. **Build the Main-World Script Injector & Bridge:**
   Because extension content scripts run in isolated contexts, they cannot directly access a webpage's Origin Private File System (OPFS). Use `chrome.scripting.executeScript` from your background context targeting `world: "MAIN"` using `chrome.devtools.inspectedWindow.tabId`. Establish a `window.postMessage` listener to stream storage data back to the DevTools panel.
4. **Implement the OPFS Directory Walker & Eviction Handler:**
   In the injected script, recursively scan `navigator.storage.getDirectory()` using `FileSystemDirectoryHandle.values()`. Build a nested JSON tree containing file names, paths, and byte sizes. Expose a deletion method that invokes `directoryHandle.removeEntry(filename)` to enable selective cache clearing from the UI.
5. **Integrate the Chunked SHA-256 Hashing Worker:**
   Spawn a dedicated Web Worker to process files larger than 100 MB without freezing the UI. Use `File.slice()` to stream 50 MB binary chunks into `crypto.subtle.digest('SHA-256', chunk)` sequentially, returning the final hex string to the panel.
6. **Attach Network Telemetry & Bandwidth Calculation:**
   Register a listener on `chrome.devtools.network.onRequestFinished`. Intercept response headers for binary mime-types or extensions (`.wasm`, `.onnx`, `.bin`), compare the requested URLs against stored OPFS assets, and increment the session's "Bandwidth Saved" counter on matches.
