import type { HashWorkerMessage } from "../types/index.d";

const CHUNK_SIZE = 50 * 1024 * 1024;

function bytesToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

self.onmessage = async (event: MessageEvent<HashWorkerMessage>) => {
  const message = event.data;

  if (
    !message ||
    message.type !== "HASH_FILE" ||
    !(message.file instanceof File)
  ) {
    self.postMessage({
      type: "HASH_ERROR",
      error: "Invalid hash worker request. Expected a File payload.",
    } satisfies HashWorkerMessage);
    return;
  }

  const { file, id } = message;
  const totalBytes = file.size;
  const fragments: Uint8Array[] = [];
  let processedBytes = 0;

  try {
    for (let offset = 0; offset < totalBytes; offset += CHUNK_SIZE) {
      const chunk = file.slice(
        offset,
        Math.min(offset + CHUNK_SIZE, totalBytes),
      );
      const buffer = await chunk.arrayBuffer();
      const view = new Uint8Array(buffer);

      fragments.push(view);
      processedBytes = offset + view.byteLength;

      self.postMessage({
        type: "HASH_PROGRESS",
        id,
        progress: totalBytes > 0 ? processedBytes / totalBytes : 1,
        processedBytes,
        totalBytes,
      } satisfies HashWorkerMessage);
    }

    const concatenated = new Uint8Array(totalBytes);
    let cursor = 0;

    for (const fragment of fragments) {
      concatenated.set(fragment, cursor);
      cursor += fragment.byteLength;
    }

    const digest = await crypto.subtle.digest("SHA-256", concatenated.buffer);

    self.postMessage({
      type: "HASH_RESULT",
      id,
      hex: bytesToHex(digest),
      processedBytes: totalBytes,
      totalBytes,
    } satisfies HashWorkerMessage);
  } catch (error) {
    const messageText =
      error instanceof Error ? error.message : "Unknown hashing failure";

    self.postMessage({
      type: "HASH_ERROR",
      id,
      error: messageText,
    } satisfies HashWorkerMessage);
  }
};
