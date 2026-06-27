import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type {
  AuditListQuery,
  AuditUpdateInput,
  BrainFolder,
  BrainItem,
  BrainStatus,
  InputDocument,
  Manifest,
  SearchQuery,
  SecondBrainOptions
} from "./types.js";

const MANIFEST_VERSION = 1;
const MANIFEST_DIR = ".second-brain";
const MANIFEST_FILE = "manifest.json";

interface PurgeOptions {
  now?: Date;
  retentionDays?: number;
}

type ManifestPatch = Partial<Omit<BrainItem, "id">>;

function requireText(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} is required`);
  }
  return trimmed;
}

function assertSafeTitle(title: string): string {
  const trimmed = requireText(title, "title");
  if (/[\\/]/.test(trimmed) || trimmed.includes("..")) {
    throw new Error("title cannot contain path traversal characters");
  }
  return trimmed;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function isoNow(): string {
  return new Date().toISOString();
}

function uniqueId(folder: BrainFolder, title: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${folder}-${slugify(title)}-${Date.now().toString(36)}-${random}`;
}

function ensureWithinRoot(root: string, path: string): string {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(path);
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}\\`) && !resolvedPath.startsWith(`${resolvedRoot}/`)) {
    throw new Error("resolved path escapes the second brain root");
  }
  return resolvedPath;
}

function itemDirectory(root: string, folder: BrainFolder, status: BrainStatus): string {
  if (folder === "wiki" && status === "rejected") {
    return join(root, folder, "rejected");
  }
  return join(root, folder);
}

function renderDocument(input: InputDocument, item: BrainItem): string {
  const tags = item.tags.map((tag) => `"${tag}"`).join(", ");
  const sources = item.sourceIds.map((sourceId) => `"${sourceId}"`).join(", ");
  return [
    "---",
    `id: ${item.id}`,
    `title: ${item.title}`,
    `folder: ${item.folder}`,
    `status: ${item.status}`,
    `tags: [${tags}]`,
    `sourceIds: [${sources}]`,
    `createdAt: ${item.createdAt}`,
    `updatedAt: ${item.updatedAt}`,
    "---",
    "",
    input.content.trim(),
    ""
  ].join("\n");
}

function matchesQuery(content: string, item: BrainItem, query?: string): boolean {
  if (!query || query.trim() === "") {
    return true;
  }

  const haystack = `${item.title}\n${item.tags.join("\n")}\n${content}`.toLowerCase();
  return haystack.includes(query.toLowerCase().trim());
}

function byNewest(a: BrainItem, b: BrainItem): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

export function createSecondBrain(options: SecondBrainOptions) {
  const root = resolve(options.root);
  const manifestPath = join(root, MANIFEST_DIR, MANIFEST_FILE);

  async function ensureLayout(): Promise<void> {
    await mkdir(join(root, MANIFEST_DIR), { recursive: true });
    await mkdir(join(root, "raw"), { recursive: true });
    await mkdir(join(root, "wiki", "rejected"), { recursive: true });
    await mkdir(join(root, "outputs"), { recursive: true });
  }

  async function readManifest(): Promise<Manifest> {
    await ensureLayout();
    try {
      const parsed = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;
      return { version: MANIFEST_VERSION, items: parsed.items ?? [] };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: MANIFEST_VERSION, items: [] };
      }
      throw error;
    }
  }

  async function writeManifest(manifest: Manifest): Promise<void> {
    await ensureLayout();
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  async function addDocument(folder: BrainFolder, input: InputDocument, status: BrainStatus): Promise<BrainItem> {
    const title = assertSafeTitle(input.title);
    const content = requireText(input.content, "content");
    const id = uniqueId(folder, title);
    const now = isoNow();
    const directory = ensureWithinRoot(root, itemDirectory(root, folder, status));
    const path = ensureWithinRoot(root, join(directory, `${id}.md`));
    const item: BrainItem = {
      id,
      title,
      folder,
      status,
      path,
      tags: input.tags ?? [],
      sourceIds: input.sourceIds ?? [],
      createdAt: now,
      updatedAt: now
    };

    const manifest = await readManifest();
    await mkdir(directory, { recursive: true });
    await writeFile(path, renderDocument({ ...input, content }, item), "utf8");
    manifest.items.push(item);
    await writeManifest(manifest);
    return item;
  }

  async function search(folder: BrainFolder, query: SearchQuery = {}): Promise<BrainItem[]> {
    const manifest = await readManifest();
    const limit = query.limit ?? 20;
    const candidates = manifest.items
      .filter((item) => item.folder === folder)
      .filter((item) => (query.status ? item.status === query.status : true))
      .sort(byNewest);

    const matches: BrainItem[] = [];
    for (const item of candidates) {
      const content = await readFile(item.path, "utf8").catch(() => "");
      if (matchesQuery(content, item, query.query)) {
        matches.push(item);
      }
      if (matches.length >= limit) {
        break;
      }
    }

    return matches;
  }

  async function auditList(query: AuditListQuery = {}): Promise<BrainItem[]> {
    const manifest = await readManifest();
    const status = query.status ?? "pending_audit";
    return manifest.items.filter((item) => item.folder === "wiki" && item.status === status).sort(byNewest);
  }

  async function updateManifestItem(id: string, patch: ManifestPatch): Promise<BrainItem> {
    const manifest = await readManifest();
    const index = manifest.items.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new Error(`Unknown item id: ${id}`);
    }
    const updated = { ...manifest.items[index], ...patch };
    manifest.items[index] = updated;
    await writeManifest(manifest);
    return updated;
  }

  async function auditUpdate(input: AuditUpdateInput): Promise<BrainItem> {
    const comment = input.comment?.trim();
    if (input.decision === "reject" && !comment) {
      throw new Error("comment is required when rejecting a wiki draft");
    }

    const manifest = await readManifest();
    const index = manifest.items.findIndex((item) => item.id === input.id);
    if (index === -1) {
      throw new Error(`Unknown item id: ${input.id}`);
    }

    const item = manifest.items[index];
    if (item.folder !== "wiki") {
      throw new Error("Only wiki items can be audited");
    }

    const now = isoNow();
    const status: BrainStatus = input.decision === "approve" ? "approved" : "rejected";
    let path = item.path;
    if (status === "rejected") {
      const rejectedDir = ensureWithinRoot(root, itemDirectory(root, "wiki", "rejected"));
      await mkdir(rejectedDir, { recursive: true });
      path = ensureWithinRoot(root, join(rejectedDir, basename(item.path)));
      await rename(item.path, path);
    }

    const updated: BrainItem = {
      ...item,
      status,
      path,
      updatedAt: now,
      auditedAt: now,
      auditComment: comment
    };
    manifest.items[index] = updated;
    await writeManifest(manifest);
    return updated;
  }

  async function purgeRejected(optionsOverride: PurgeOptions = {}): Promise<string[]> {
    const now = optionsOverride.now ?? new Date();
    const retentionDays = optionsOverride.retentionDays ?? options.rejectedRetentionDays;
    const manifest = await readManifest();
    const retained: BrainItem[] = [];
    const purged: string[] = [];
    const retentionMs = retentionDays * 24 * 60 * 60 * 1000;

    for (const item of manifest.items) {
      const auditedAt = item.auditedAt ? new Date(item.auditedAt).getTime() : Number.NaN;
      const expired = item.folder === "wiki" && item.status === "rejected" && Number.isFinite(auditedAt) && now.getTime() - auditedAt > retentionMs;
      if (expired) {
        await rm(item.path, { force: true });
        purged.push(item.id);
      } else {
        retained.push(item);
      }
    }

    if (purged.length > 0) {
      await writeManifest({ version: MANIFEST_VERSION, items: retained });
    }

    return purged;
  }

  return {
    rawInput: (input: InputDocument) => addDocument("raw", input, "approved"),
    rawSearch: (query?: SearchQuery) => search("raw", query),
    wikiInput: (input: InputDocument) => addDocument("wiki", input, "pending_audit"),
    wikiSearch: (query?: SearchQuery) => search("wiki", { ...query, status: "approved" }),
    outputsInput: (input: InputDocument) => addDocument("outputs", input, "approved"),
    outputsSearch: (query?: SearchQuery) => search("outputs", query),
    auditList,
    auditUpdate,
    purgeRejected,
    testing: {
      updateManifestItem
    }
  };
}
