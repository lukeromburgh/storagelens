import type { OPFSNode } from "../types/index.d";

type StorageLensWindow = Window & {
  __storageLens?: {
    scanOPFS: () => Promise<OPFSNode>;
    deleteOPFSNode: (path: string) => Promise<boolean>;
  };
};

async function ensureOPFSRoot(): Promise<FileSystemDirectoryHandle> {
  if (
    !navigator.storage ||
    typeof navigator.storage.getDirectory !== "function"
  ) {
    throw new Error(
      "OPFS is unavailable in this page: navigator.storage.getDirectory() is not supported.",
    );
  }

  return navigator.storage.getDirectory();
}

async function readFileNode(
  handle: FileSystemFileHandle,
  path: string,
): Promise<OPFSNode> {
  const file = await handle.getFile();

  return {
    id: path,
    name: file.name,
    path,
    type: "file",
    size: file.size,
    mimeType: file.type || "application/octet-stream",
    lastModified: file.lastModified,
    handle,
  };
}

async function readDirectoryNode(
  handle: FileSystemDirectoryHandle,
  path: string,
): Promise<OPFSNode> {
  const node: OPFSNode = {
    id: path || "/",
    name: path ? path.split("/").filter(Boolean).at(-1) || "/" : "/",
    path: path || "/",
    type: "directory",
    size: 0,
    isRoot: path === "",
    children: [],
    handle,
  };

  const entries = [] as Array<{ name: string; handle: FileSystemHandle }>;

  for await (const entry of handle.values()) {
    entries.push({ name: entry.name, handle: entry as FileSystemHandle });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const childPath = `${path}/${entry.name}`
      .replace(/\/+/g, "/")
      .replace(/\/$/, "");

    if (entry.handle.kind === "file") {
      const fileNode = await readFileNode(
        entry.handle as FileSystemFileHandle,
        childPath,
      );
      node.children!.push(fileNode);
      node.size += fileNode.size;
    } else {
      const dirNode = await readDirectoryNode(
        entry.handle as FileSystemDirectoryHandle,
        childPath,
      );
      node.children!.push(dirNode);
      node.size += dirNode.size;
    }
  }

  return node;
}

export async function scanOPFS(): Promise<OPFSNode> {
  try {
    const rootHandle = await ensureOPFSRoot();
    const rootNode = await readDirectoryNode(rootHandle, "");
    const payload = {
      ...rootNode,
      id: "/",
      path: "/",
      isRoot: true,
      children: rootNode.children ?? [],
    } satisfies OPFSNode;

    window.postMessage(
      {
        source: "storage-lens-injected",
        type: "OPFS_SCAN_RESULT",
        payload,
      },
      "*",
    );

    return payload;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown OPFS scan error";
    window.postMessage(
      {
        source: "storage-lens-injected",
        type: "OPFS_SCAN_ERROR",
        error: message,
      },
      "*",
    );

    throw new Error(message);
  }
}

export async function deleteOPFSNode(path: string): Promise<boolean> {
  const normalizedPath = path.replace(/^\/+/, "").replace(/\/+$/g, "");

  if (!normalizedPath) {
    return false;
  }

  const segments = normalizedPath.split("/").filter(Boolean);

  if (segments.length === 0) {
    return false;
  }

  try {
    const rootHandle = await ensureOPFSRoot();
    let currentHandle: FileSystemDirectoryHandle = rootHandle;

    for (let index = 0; index < segments.length - 1; index += 1) {
      currentHandle = await currentHandle.getDirectoryHandle(segments[index]);
    }

    const targetName = segments[segments.length - 1];
    await currentHandle.removeEntry(targetName, { recursive: true });
    return true;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete OPFS entry.";
    console.error("[StorageLens] deleteOPFSNode failed:", message);
    return false;
  }
}

const storageLensWindow = window as StorageLensWindow;
storageLensWindow.__storageLens = {
  scanOPFS,
  deleteOPFSNode,
};

window.addEventListener("message", async (event: MessageEvent) => {
  const message = event.data as { type?: string; path?: string } | undefined;

  if (!message || typeof message.type !== "string") {
    return;
  }

  if (message.type === "STORAGE_LENS_SCAN_REQUEST") {
    await scanOPFS();
  }

  if (
    message.type === "STORAGE_LENS_DELETE_REQUEST" &&
    typeof message.path === "string"
  ) {
    await deleteOPFSNode(message.path);
  }
});

void scanOPFS();
