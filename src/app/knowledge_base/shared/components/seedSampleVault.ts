// Sample-vault seeder (KB-012). Fetches the manifest + every file from
// `/sample-vault/`, prompts the user to pick an empty folder, writes
// the files, and resolves so the caller can drive `openFolder()` next.
//
// We don't ship a single zip — fetching individual files means no
// runtime zip dependency, and Next serves `public/sample-vault/`
// transparently.

import { getSubdirectoryHandle } from "../hooks/fileExplorerHelpers";

interface ManifestEntry {
  path: string;
  kind: "text" | "binary";
}

interface Manifest {
  version: number;
  description: string;
  files: ManifestEntry[];
  openOnLoad?: string;
}

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const MANIFEST_URL = `${BASE_PATH}/sample-vault/manifest.json`;

/** Fetch the sample vault from `/sample-vault/` and write every file
 *  into `target`. Errors propagate to the caller so the UI can surface
 *  them (typically a permission denial after the user picked a folder
 *  the app can't write to). */
export async function seedSampleVault(target: FileSystemDirectoryHandle): Promise<{
  fileCount: number;
  openOnLoad?: string;
}> {
  const manifest = await fetchManifest();
  for (const entry of manifest.files) {
    await writeOne(target, entry);
  }
  return { fileCount: manifest.files.length, openOnLoad: manifest.openOnLoad };
}

async function fetchManifest(): Promise<Manifest> {
  const res = await fetch(MANIFEST_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Sample vault manifest fetch failed: ${res.status}`);
  }
  return (await res.json()) as Manifest;
}

async function writeOne(target: FileSystemDirectoryHandle, entry: ManifestEntry): Promise<void> {
  const url = `${BASE_PATH}/sample-vault/${entry.path}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Sample vault file ${entry.path} fetch failed: ${res.status}`);
  }

  const parts = entry.path.split("/");
  const filename = parts.pop()!;
  const dir = parts.length > 0 ? await getSubdirectoryHandle(target, parts.join("/"), true) : target;
  const fileHandle = await dir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  if (entry.kind === "text") {
    const text = await res.text();
    await writable.write(text);
  } else {
    const bytes = await res.arrayBuffer();
    await writable.write(bytes);
  }
  await writable.close();
}
