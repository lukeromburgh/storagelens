import type { ExtensionMessage, OPFSNode } from "../types/index.d";

const STORAGE_LENS_MESSAGE = "storage-lens";

function isMessageWithType(message: unknown): message is ExtensionMessage {
  return typeof message === "object" && message !== null && "type" in message;
}

function normalizeTabId(tabId: unknown): number | undefined {
  if (typeof tabId === "number" && Number.isFinite(tabId)) {
    return tabId;
  }

  return undefined;
}

async function executeMainWorldScan(tabId: number): Promise<OPFSNode> {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: async () => {
        const scanTarget = window as Window & {
          __storageLens?: {
            scanOPFS: () => Promise<OPFSNode>;
          };
        };

        if (typeof scanTarget.__storageLens?.scanOPFS === "function") {
          return scanTarget.__storageLens.scanOPFS();
        }

        return null;
      },
    });

    const payload = Array.isArray(result) ? result[0]?.result : undefined;
    if (!payload || payload === null) {
      throw new Error("No OPFS scan result returned from the inspected page.");
    }

    return payload as OPFSNode;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown OPFS scan failure.";
    throw new Error(`scanOPFS failed: ${message}`);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isMessageWithType(message)) {
    return false;
  }

  if (message.type === "SCAN_OPFS") {
    const tabId = normalizeTabId(message.tabId);

    if (typeof tabId !== "number") {
      sendResponse({
        type: "OPFS_SCAN_ERROR",
        source: "background",
        error: "No inspected tab ID was provided for OPFS scanning.",
      });
      return false;
    }

    void executeMainWorldScan(tabId)
      .then((payload) => {
        chrome.runtime.sendMessage({
          type: "OPFS_SCAN_RESULT",
          source: "background",
          payload,
          tabId,
          requestId: message.requestId,
        });
      })
      .catch((error) => {
        chrome.runtime.sendMessage({
          type: "OPFS_SCAN_ERROR",
          source: "background",
          tabId,
          requestId: message.requestId,
          error:
            error instanceof Error ? error.message : "Unknown OPFS scan error",
        });
      });

    sendResponse({
      type: "SCAN_OPFS_ACCEPTED",
      source: "background",
      tabId,
    });

    return true;
  }

  if (message.type === "DELETE_OPFS_NODE") {
    const tabId = normalizeTabId(message.tabId);

    if (typeof tabId !== "number") {
      sendResponse({
        type: "DELETE_OPFS_NODE_ERROR",
        source: "background",
        error: "No inspected tab ID was provided for OPFS deletion.",
      });
      return false;
    }

    const deletePath =
      typeof message.payload === "string" ? message.payload : "";

    void chrome.scripting
      .executeScript({
        target: { tabId },
        world: "MAIN",
        func: async (path: string) => {
          const target = window as Window & {
            __storageLens?: {
              deleteOPFSNode: (path: string) => Promise<boolean>;
            };
          };

          if (typeof target.__storageLens?.deleteOPFSNode !== "function") {
            return false;
          }

          return target.__storageLens.deleteOPFSNode(path);
        },
        args: [deletePath],
      })
      .then((result) => {
        const success = Array.isArray(result)
          ? Boolean(result[0]?.result)
          : false;
        chrome.runtime.sendMessage({
          type: "DELETE_OPFS_NODE_RESULT",
          source: "background",
          payload: success,
          tabId,
          requestId: message.requestId,
        });
      })
      .catch((error) => {
        chrome.runtime.sendMessage({
          type: "DELETE_OPFS_NODE_ERROR",
          source: "background",
          tabId,
          requestId: message.requestId,
          error:
            error instanceof Error ? error.message : "Unknown deletion error",
        });
      });

    sendResponse({
      type: "DELETE_OPFS_NODE_ACCEPTED",
      source: "background",
      tabId,
    });

    return true;
  }

  return false;
});

chrome.runtime.onMessage.addListener((message) => {
  if (
    isMessageWithType(message) &&
    message.source === "injected" &&
    message.type === "OPFS_SCAN_RESULT"
  ) {
    chrome.runtime.sendMessage({
      ...message,
      source: "background",
    });
  }

  return false;
});

export {};
