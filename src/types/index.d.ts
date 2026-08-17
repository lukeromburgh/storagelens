export interface OPFSNode {
  id: string;
  name: string;
  path: string;
  type: "file" | "directory";
  kind?: "file" | "directory";
  size: number;
  isRoot?: boolean;
  mimeType?: string;
  children?: OPFSNode[];
  lastModified?: number;
  handle?: FileSystemDirectoryHandle | FileSystemFileHandle;
}

export interface ExtensionMessage<T = unknown> {
  type: string;
  source: "panel" | "background" | "injected" | "worker";
  payload?: T;
  tabId?: number;
  requestId?: string;
  error?: string;
}

export interface HashWorkerMessage {
  type: "HASH_FILE" | "HASH_PROGRESS" | "HASH_RESULT" | "HASH_ERROR";
  id?: string;
  file?: File;
  progress?: number;
  processedBytes?: number;
  totalBytes?: number;
  hex?: string;
  error?: string;
}

declare global {
  interface Window {
    __storageLens?: {
      scanOPFS: () => Promise<OPFSNode>;
      deleteOPFSNode: (path: string) => Promise<boolean>;
    };
  }

  interface FileSystemDirectoryHandle {
    values: () => AsyncIterable<FileSystemHandle>;
  }

  interface StorageManager {
    getDirectory: () => Promise<FileSystemDirectoryHandle>;
  }

  interface Navigator {
    storage?: StorageManager;
  }

  const chrome: {
    devtools: {
      inspectedWindow: {
        tabId: number;
      };
      panels: {
        create: (title: string, iconPath: string, page: string) => void;
      };
      network: {
        onRequestFinished: {
          addListener: (listener: (request: any) => void) => void;
        };
      };
    };
    runtime: {
      onMessage: {
        addListener: (
          listener: (
            message: any,
            sender: any,
            sendResponse: (response?: any) => void,
          ) => boolean | void,
        ) => void;
      };
      sendMessage: (message: any, callback?: (response?: any) => void) => void;
    };
    scripting: {
      executeScript: (details: {
        target: { tabId: number; frameIds?: number[] };
        world?: "MAIN" | "ISOLATED";
        files?: string[];
        func?: () => void | Promise<void>;
        args?: unknown[];
      }) => Promise<any[]>;
    };
  };
}

export {};
