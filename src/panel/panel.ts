import type { ExtensionMessage, OPFSNode } from "../types/index.d";

const statusText = document.querySelector("#status-text") as HTMLElement | null;
const treeRoot = document.querySelector("#tree-root") as HTMLElement | null;
const totalFilesEl = document.querySelector(
  "#total-files",
) as HTMLElement | null;
const totalSizeEl = document.querySelector("#total-size") as HTMLElement | null;
const bandwidthSavedEl = document.querySelector(
  "#bandwidth-saved",
) as HTMLElement | null;
const detailNameEl = document.querySelector(
  "#detail-name",
) as HTMLElement | null;
const detailPathEl = document.querySelector(
  "#detail-path",
) as HTMLElement | null;
const detailSizeEl = document.querySelector(
  "#detail-size",
) as HTMLElement | null;
const detailTypeEl = document.querySelector(
  "#detail-type",
) as HTMLElement | null;
const detailHashEl = document.querySelector(
  "#detail-hash",
) as HTMLElement | null;
const hashProgressEl = document.querySelector(
  "#hash-progress",
) as HTMLElement | null;
const hashButton = document.querySelector(
  "#hash-button",
) as HTMLButtonElement | null;
const deleteButton = document.querySelector(
  "#delete-button",
) as HTMLButtonElement | null;
const scanButton = document.querySelector(
  "#scan-button",
) as HTMLButtonElement | null;
const refreshButton = document.querySelector(
  "#refresh-button",
) as HTMLButtonElement | null;
const hashFileInput = document.querySelector(
  "#hash-file-input",
) as HTMLInputElement | null;

const BINARY_EXTENSIONS = new Set([
  "wasm",
  "onnx",
  "bin",
  "dat",
  "gz",
  "zip",
  "model",
]);

let currentTree: OPFSNode | null = null;
let selectedPath: string | null = null;
let bandwidthSavedBytes = 0;
let activeHashWorker: Worker | null = null;
let selectedFile: File | null = null;
const pendingRequests = new Map<string, (value: unknown) => void>();
const expandedPaths = new Set<string>();

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const sizes = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < sizes.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${sizes[unitIndex]}`;
}

function countFiles(node: OPFSNode): number {
  if (node.type === "file") {
    return 1;
  }

  return (node.children ?? []).reduce(
    (sum, child) => sum + countFiles(child),
    0,
  );
}

function sumSizes(node: OPFSNode): number {
  if (node.type === "file") {
    return node.size;
  }

  return (node.children ?? []).reduce((sum, child) => sum + sumSizes(child), 0);
}

function flattenNodes(node: OPFSNode): OPFSNode[] {
  const result: OPFSNode[] = [node];

  for (const child of node.children ?? []) {
    result.push(...flattenNodes(child));
  }

  return result;
}

function updateSummary(tree: OPFSNode | null): void {
  if (!tree) {
    totalFilesEl && (totalFilesEl.textContent = "0");
    totalSizeEl && (totalSizeEl.textContent = "0 B");
    return;
  }

  const totalFiles = countFiles(tree);
  const totalSize = sumSizes(tree);

  totalFilesEl && (totalFilesEl.textContent = String(totalFiles));
  totalSizeEl && (totalSizeEl.textContent = formatBytes(totalSize));
  bandwidthSavedEl &&
    (bandwidthSavedEl.textContent = formatBytes(bandwidthSavedBytes));
}

function renderTree(node: OPFSNode): string {
  const children = node.children ?? [];
  const files = children.filter((child) => child.type === "file");
  const folders = children.filter((child) => child.type === "directory");

  const sortedChildren = [...folders, ...files].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const childrenMarkup = sortedChildren
    .map((child) => {
      const isSelected = selectedPath === child.path;
      const childMarkup = renderTree(child);
      return `
        <li class="tree-node" data-kind="${child.type}" data-path="${escapeHtml(child.path)}">
          <div class="tree-item ${isSelected ? "selected" : ""}" data-path="${escapeHtml(child.path)}">
            <span class="tree-label">${escapeHtml(child.name)}</span>
            <span class="tree-size">${formatBytes(child.size)}</span>
          </div>
          ${childMarkup ? `<ul class="tree-children">${childMarkup}</ul>` : ""}
        </li>
      `;
    })
    .join("");

  return childrenMarkup;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function attachTreeEvents(): void {
  if (!treeRoot) {
    return;
  }

  treeRoot.querySelectorAll(".tree-item").forEach((element) => {
    element.addEventListener("click", () => {
      const path = (element as HTMLElement).dataset.path ?? null;
      selectedPath = path;
      if (path) {
        const item = findNodeByPath(currentTree, path);
        if (item) {
          renderDetails(item);
        }
      }
      treeRoot
        .querySelectorAll(".tree-item")
        .forEach((node) => node.classList.toggle("selected", node === element));
    });
  });
}

function findNodeByPath(
  node: OPFSNode | null,
  targetPath: string,
): OPFSNode | null {
  if (!node) {
    return null;
  }

  if (node.path === targetPath) {
    return node;
  }

  for (const child of node.children ?? []) {
    const match = findNodeByPath(child, targetPath);
    if (match) {
      return match;
    }
  }

  return null;
}

function renderDetails(node: OPFSNode | null): void {
  if (!node) {
    detailNameEl && (detailNameEl.textContent = "—");
    detailPathEl && (detailPathEl.textContent = "—");
    detailSizeEl && (detailSizeEl.textContent = "—");
    detailTypeEl && (detailTypeEl.textContent = "—");
    detailHashEl && (detailHashEl.textContent = "—");
    return;
  }

  detailNameEl && (detailNameEl.textContent = node.name || "—");
  detailPathEl && (detailPathEl.textContent = node.path || "—");
  detailSizeEl && (detailSizeEl.textContent = formatBytes(node.size));
  detailTypeEl && (detailTypeEl.textContent = node.type);
  detailHashEl && (detailHashEl.textContent = "—");
}

function getNodeKind(node: OPFSNode): "file" | "directory" {
  return node.kind ?? node.type;
}

function selectNode(node: OPFSNode): void {
  selectedPath = node.path;
  renderTreeView();
  renderDetails(node);
}

export function renderTreeNode(node: OPFSNode, depth: number = 0): HTMLElement {
  const container = document.createElement("div");
  container.className = "tree-node-container";

  const row = document.createElement("div");
  row.className = `tree-row depth-${depth}`;
  row.style.paddingLeft = `${depth * 16 + 8}px`;
  row.classList.toggle("selected", selectedPath === node.path);

  const kind = getNodeKind(node);

  if (kind === "directory") {
    const toggle = document.createElement("span");
    toggle.className = "toggle-icon";

    const initialExpanded =
      expandedPaths.has(node.path) || node.path === "/" || depth === 0;
    toggle.textContent = initialExpanded ? "▼" : "▶";

    const label = document.createElement("span");
    label.className = "node-label directory";
    label.textContent = `📁 ${node.name}`;

    row.appendChild(toggle);
    row.appendChild(label);

    const childrenContainer = document.createElement("div");
    childrenContainer.className = "children-container";
    childrenContainer.style.display = initialExpanded ? "block" : "none";

    const children = node.children ?? [];

    if (children.length > 0) {
      children.forEach((child) => {
        childrenContainer.appendChild(renderTreeNode(child, depth + 1));
      });
    } else {
      const emptyNode = document.createElement("div");
      emptyNode.className = "empty-dir";
      emptyNode.style.paddingLeft = `${(depth + 1) * 16 + 8}px`;
      emptyNode.textContent = "(empty)";
      childrenContainer.appendChild(emptyNode);
    }

    row.addEventListener("click", (event) => {
      event.stopPropagation();
      const isExpanded = childrenContainer.style.display !== "none";
      if (isExpanded) {
        expandedPaths.delete(node.path);
        childrenContainer.style.display = "none";
        toggle.textContent = "▶";
      } else {
        expandedPaths.add(node.path);
        childrenContainer.style.display = "block";
        toggle.textContent = "▼";
      }
      selectedPath = node.path;
      renderDetails(node);
      row.classList.toggle("selected", selectedPath === node.path);
    });

    container.appendChild(row);
    container.appendChild(childrenContainer);
  } else {
    const spacer = document.createElement("span");
    spacer.className = "toggle-spacer";
    spacer.textContent = " ";

    const label = document.createElement("span");
    label.className = "node-label file";
    label.textContent = `📄 ${node.name} (${formatBytes(node.size || 0)})`;

    row.appendChild(spacer);
    row.appendChild(label);

    row.addEventListener("click", (event) => {
      event.stopPropagation();
      document
        .querySelectorAll(".tree-row")
        .forEach((treeRow) => treeRow.classList.remove("selected"));
      row.classList.add("selected");
      selectNode(node);
    });

    container.appendChild(row);
  }

  return container;
}

function renderTreeView(): void {
  if (!treeRoot || !currentTree) {
    return;
  }

  treeRoot.innerHTML = "";
  const rootNode = renderTreeNode(currentTree, 0);
  treeRoot.appendChild(rootNode);

  if (!selectedPath) {
    selectedPath = currentTree.path;
  }

  const selectedNode = findNodeByPath(
    currentTree,
    selectedPath ?? currentTree.path,
  );
  renderDetails(selectedNode ?? currentTree);
}

function updateStatus(message: string): void {
  if (statusText) {
    statusText.textContent = message;
  }
}

function sendMessageToBackground(
  type: string,
  payload?: unknown,
): Promise<unknown> {
  const requestId = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    pendingRequests.set(requestId, resolve);

    chrome.runtime.sendMessage(
      {
        type,
        source: "panel",
        payload,
        requestId,
        tabId: chrome.devtools.inspectedWindow.tabId,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          pendingRequests.delete(requestId);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (
          response &&
          typeof response === "object" &&
          "requestId" in response
        ) {
          return;
        }

        resolve(response ?? undefined);
      },
    );
  });
}

async function scanOPFS(): Promise<void> {
  updateStatus("Scanning OPFS…");

  try {
    const response = (await sendMessageToBackground("SCAN_OPFS")) as
      | { payload?: OPFSNode; error?: string }
      | undefined;

    if (response?.error) {
      throw new Error(response.error);
    }

    if (response?.payload) {
      currentTree = response.payload;
      updateSummary(currentTree);
      renderTreeView();
      updateStatus("OPFS scan complete");
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to scan OPFS.";
    updateStatus(message);
    console.error("[StorageLens] OPFS scan failed:", error);
  }
}

async function deleteSelectedNode(): Promise<void> {
  if (!selectedPath) {
    return;
  }

  try {
    const response = (await sendMessageToBackground(
      "DELETE_OPFS_NODE",
      selectedPath,
    )) as { payload?: boolean; error?: string } | undefined;

    if (response?.error) {
      throw new Error(response.error);
    }

    if (response?.payload) {
      await scanOPFS();
      updateStatus("Selection deleted successfully");
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to delete selected node.";
    updateStatus(message);
    console.error("[StorageLens] Delete failed:", error);
  }
}

function startHashWorker(file: File): void {
  if (activeHashWorker) {
    activeHashWorker.terminate();
  }

  const worker = new Worker(
    new URL("../workers/hash-worker.ts", import.meta.url),
    { type: "module" },
  );
  activeHashWorker = worker;

  worker.onmessage = (event: MessageEvent) => {
    const message = event.data as {
      type?: string;
      progress?: number;
      hex?: string;
      error?: string;
      processedBytes?: number;
      totalBytes?: number;
    };

    if (!message || !message.type) {
      return;
    }

    if (message.type === "HASH_PROGRESS") {
      const percent = Math.round((message.progress ?? 0) * 100);
      hashProgressEl &&
        (hashProgressEl.textContent = `Hashing ${file.name}: ${percent}% (${formatBytes(message.processedBytes ?? 0)} / ${formatBytes(message.totalBytes ?? 0)})`);
      return;
    }

    if (message.type === "HASH_RESULT") {
      detailHashEl && (detailHashEl.textContent = message.hex ?? "—");
      hashProgressEl &&
        (hashProgressEl.textContent = `SHA-256 complete for ${file.name}: ${message.hex ?? "—"}`);
      worker.terminate();
      activeHashWorker = null;
      return;
    }

    if (message.type === "HASH_ERROR") {
      hashProgressEl &&
        (hashProgressEl.textContent = `Hash error: ${message.error ?? "Unknown error"}`);
      worker.terminate();
      activeHashWorker = null;
    }
  };

  worker.postMessage({ type: "HASH_FILE", id: crypto.randomUUID(), file });
  hashProgressEl &&
    (hashProgressEl.textContent = `Starting hash for ${file.name}…`);
}

function handleHashButtonClick(): void {
  const file = selectedFile ?? hashFileInput?.files?.[0] ?? null;

  if (!file) {
    hashProgressEl &&
      (hashProgressEl.textContent = "Select a file to hash before starting.");
    return;
  }

  selectedFile = file;
  startHashWorker(file);
}

function trackBinaryRequest(request: any): void {
  if (!request || typeof request.responseHeaders === "undefined") {
    return;
  }

  const url = request.url ?? "";
  const mimeType =
    request.responseHeaders?.["Content-Type"] ?? request.mimeType ?? "";
  const isBinary =
    /(?:\.(wasm|onnx|bin|dat|gz|zip|model))(?:\?.*)?$/.test(url) ||
    /application\/(octet-stream|wasm|x-binary)/i.test(mimeType);

  if (!isBinary) {
    return;
  }

  const contentLength = Number(
    request.responseHeaders?.["Content-Length"] ??
      request.response?.contentLength ??
      0,
  );
  if (!Number.isFinite(contentLength) || contentLength <= 1024 * 1024) {
    return;
  }

  bandwidthSavedBytes += contentLength;
  bandwidthSavedEl &&
    (bandwidthSavedEl.textContent = formatBytes(bandwidthSavedBytes));
}

function attachNetworkListener(): void {
  try {
    chrome.devtools.network.onRequestFinished.addListener((request) => {
      trackBinaryRequest(request);
    });
  } catch (error) {
    console.error("[StorageLens] Network listener registration failed:", error);
  }
}

function bindEvents(): void {
  scanButton?.addEventListener("click", () => {
    void scanOPFS();
  });

  refreshButton?.addEventListener("click", () => {
    void scanOPFS();
  });

  deleteButton?.addEventListener("click", () => {
    void deleteSelectedNode();
  });

  hashButton?.addEventListener("click", () => {
    handleHashButtonClick();
  });

  hashFileInput?.addEventListener("change", () => {
    selectedFile = hashFileInput.files?.[0] ?? null;
    if (selectedFile) {
      hashProgressEl &&
        (hashProgressEl.textContent = `Selected ${selectedFile.name} for hashing.`);
    }
  });
}

function initializePanel(): void {
  bindEvents();
  attachNetworkListener();
  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (!message || typeof message !== "object" || !("requestId" in message)) {
      return false;
    }

    const typedMessage = message as ExtensionMessage & { payload?: unknown };
    const resolver = typedMessage.requestId
      ? pendingRequests.get(typedMessage.requestId)
      : undefined;

    if (resolver) {
      resolver(typedMessage);
      pendingRequests.delete(typedMessage.requestId!);
      return false;
    }

    if (
      typedMessage.type === "OPFS_SCAN_RESULT" &&
      typedMessage.payload &&
      typeof typedMessage.payload === "object"
    ) {
      currentTree = typedMessage.payload as OPFSNode;
      updateSummary(currentTree);
      renderTreeView();
      updateStatus("Received OPFS snapshot");
    }

    return false;
  });

  updateStatus("Ready");
  renderDetails(null);
  updateSummary(null);
}

initializePanel();
