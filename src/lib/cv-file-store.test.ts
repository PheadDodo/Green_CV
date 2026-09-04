import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLocalCvFile, saveLocalCvFile } from "./cv-file-store";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("local CV file storage", () => {
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

    await expect(readLocalCvFile("demo-user/../private.txt", root)).rejects.toThrow(
      "Invalid CV storage path.",
    );
    await expect(readLocalCvFile("demo-user/id/resume.pdf", root)).rejects.toThrow(
      "Invalid CV storage path.",
    );
  });
});
