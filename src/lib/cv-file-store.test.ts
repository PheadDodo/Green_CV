import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LOCAL_CV_FILE_ROOT,
  readLocalCvFile,
  removeLocalCvFile,
  resolveLocalCvFile,
  saveLocalCvFile,
} from "./cv-file-store";

const directories: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("local CV file storage", () => {
  it("saves, reads, and removes files inside the configured local CV root", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "greencv-files-"));
    directories.push(root);
    vi.stubEnv("JOBS_SUMMARY_LOCAL_CV_ROOT", root);
    const expectedStoragePath = "demo-user/isolated-id/original.pdf";
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

    // Fail before I/O if the configured root would fall back to the real workspace.
    expect(resolveLocalCvFile(expectedStoragePath)).toBe(path.join(root, expectedStoragePath));

    const storagePath = await saveLocalCvFile({
      userId: "demo-user",
      extension: "pdf",
      bytes,
      id: "isolated-id",
    });

    await expect(readLocalCvFile(storagePath, root)).resolves.toEqual(Buffer.from(bytes));
    await expect(readLocalCvFile(storagePath)).resolves.toEqual(Buffer.from(bytes));
    await removeLocalCvFile(storagePath);
    await expect(readLocalCvFile(storagePath, root)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps an explicit root independent from the configured root", async () => {
    const configuredRoot = await mkdtemp(path.join(tmpdir(), "greencv-files-"));
    const explicitRoot = await mkdtemp(path.join(tmpdir(), "greencv-files-"));
    directories.push(configuredRoot, explicitRoot);
    vi.stubEnv("JOBS_SUMMARY_LOCAL_CV_ROOT", configuredRoot);
    const input = { userId: "demo-user", extension: "pdf" as const, id: "shared-id" };
    const configuredBytes = new Uint8Array([1]);
    const explicitBytes = new Uint8Array([2]);

    expect(resolveLocalCvFile("demo-user/shared-id/original.pdf")).toBe(
      path.join(configuredRoot, "demo-user", "shared-id", "original.pdf"),
    );

    const storagePath = await saveLocalCvFile({ ...input, bytes: configuredBytes });
    await saveLocalCvFile({ ...input, root: explicitRoot, bytes: explicitBytes });

    expect(resolveLocalCvFile(storagePath, explicitRoot)).toBe(path.join(explicitRoot, storagePath));
    await expect(readLocalCvFile(storagePath, explicitRoot)).resolves.toEqual(Buffer.from(explicitBytes));
    await removeLocalCvFile(storagePath, explicitRoot);
    await expect(readLocalCvFile(storagePath, explicitRoot)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readLocalCvFile(storagePath)).resolves.toEqual(Buffer.from(configuredBytes));
  });

  it.each([undefined, ""])("uses the existing default when the configured root is %s", (root) => {
    vi.stubEnv("JOBS_SUMMARY_LOCAL_CV_ROOT", root);

    expect(resolveLocalCvFile("demo-user/file-id/original.pdf")).toBe(
      path.join(LOCAL_CV_FILE_ROOT, "demo-user", "file-id", "original.pdf"),
    );
  });

  it("stores an uploaded file under a generated user-scoped path", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "greencv-files-"));
    directories.push(root);
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

    const storagePath = await saveLocalCvFile({
      root,
      userId: "demo-user",
      extension: "pdf",
      bytes,
      id: "fixed-id",
    });

    expect(storagePath).toBe("demo-user/fixed-id/original.pdf");
    await expect(readLocalCvFile(storagePath, root)).resolves.toEqual(Buffer.from(bytes));
  });

  it("creates private artifact directories where POSIX permissions are supported", async () => {
    if (process.platform === "win32") return;
    const root = await mkdtemp(path.join(tmpdir(), "greencv-files-"));
    directories.push(root);

    await saveLocalCvFile({
      root,
      userId: "demo-user",
      extension: "pdf",
      bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
      id: "fixed-id",
    });

    expect((await stat(path.join(root, "demo-user", "fixed-id"))).mode & 0o777).toBe(0o700);
    expect((await stat(path.join(root, "demo-user", "fixed-id", "original.pdf"))).mode & 0o777).toBe(0o600);
  });

  it("rejects paths that are not opaque artifact paths", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "greencv-files-"));
    directories.push(root);
    vi.stubEnv("JOBS_SUMMARY_LOCAL_CV_ROOT", root);

    await expect(readLocalCvFile("demo-user/../private.txt", root)).rejects.toThrow(
      "Invalid CV storage path.",
    );
    await expect(readLocalCvFile("demo-user/id/resume.pdf", root)).rejects.toThrow(
      "Invalid CV storage path.",
    );
    await expect(readLocalCvFile("demo-user/../original.pdf")).rejects.toThrow(
      "Invalid CV storage path.",
    );
  });
});
