import { mkdir, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const LOCAL_CV_FILE_ROOT = path.join(process.cwd(), ".data", "cv-files");
export type CvFileExtension = "pdf" | "docx" | "md" | "txt";

function safeSegment(value: string, label: string): string {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(value)) throw new Error(`Invalid ${label}.`);
  return value;
}

export function createCvStoragePath(
  userId: string,
  extension: CvFileExtension,
  id = globalThis.crypto.randomUUID(),
): string {
  return `${safeSegment(userId, "user id")}/${safeSegment(id, "file id")}/original.${extension}`;
}

export function resolveLocalCvFile(storagePath: string, root = LOCAL_CV_FILE_ROOT): string {
  if (storagePath.includes("\\")) throw new Error("Invalid CV storage path.");
  const segments = storagePath.split("/");
  if (segments.length !== 3) throw new Error("Invalid CV storage path.");
  if (
    !/^[A-Za-z0-9_-]{1,160}$/.test(segments[0])
    || !/^[A-Za-z0-9_-]{1,160}$/.test(segments[1])
    || !/^original\.(?:pdf|docx|md|txt)$/.test(segments[2])
  ) {
    throw new Error("Invalid CV storage path.");
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...segments);
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error("Invalid CV storage path.");
  return resolved;
}

export async function saveLocalCvFile(input: {
  userId: string;
  extension: CvFileExtension;
  bytes: Uint8Array;
  root?: string;
  id?: string;
}): Promise<string> {
  const root = input.root ?? LOCAL_CV_FILE_ROOT;
  const storagePath = createCvStoragePath(input.userId, input.extension, input.id);
  const filePath = resolveLocalCvFile(storagePath, root);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, input.bytes, { flag: "wx", mode: 0o600 });
  return storagePath;
}

export async function readLocalCvFile(storagePath: string, root = LOCAL_CV_FILE_ROOT): Promise<Buffer> {
  return readFile(resolveLocalCvFile(storagePath, root));
}

export async function removeLocalCvFile(storagePath: string, root = LOCAL_CV_FILE_ROOT): Promise<void> {
  const filePath = resolveLocalCvFile(storagePath, root);
  await unlink(filePath).catch((error: unknown) => {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  });
  await rmdir(path.dirname(filePath)).catch((error: unknown) => {
    if (!(error instanceof Error && "code" in error && ["ENOENT", "ENOTEMPTY"].includes(String(error.code)))) {
      throw error;
    }
  });
}
