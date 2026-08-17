import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        devtools: resolve(import.meta.dirname, "src/devtools/devtools.html"),
        panel: resolve(import.meta.dirname, "src/panel/panel.html"),
        background: resolve(
          import.meta.dirname,
          "src/background/service-worker.ts",
        ),
        opfsScanner: resolve(
          import.meta.dirname,
          "src/injected/opfs-scanner.ts",
        ),
        hashWorker: resolve(import.meta.dirname, "src/workers/hash-worker.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "background")
            return "src/background/service-worker.js";
          if (chunkInfo.name === "opfsScanner")
            return "src/injected/opfs-scanner.js";
          if (chunkInfo.name === "hashWorker")
            return "src/workers/hash-worker.js";
          return "assets/[name]-[hash].js";
        },
      },
    },
  },
});
