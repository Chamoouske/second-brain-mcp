import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSecondBrain } from "../src/secondBrain.js";

async function testBrain() {
  const root = await mkdtemp(join(tmpdir(), "second-brain-"));
  return { root, brain: createSecondBrain({ root, rejectedRetentionDays: 7 }) };
}

describe("second brain file manager", () => {
  it("stores raw text documents and makes them searchable", async () => {
    const { root, brain } = await testBrain();

    const created = await brain.rawInput({
      title: "Local AI Notes",
      content: "Obsidian stores local markdown notes.",
      tags: ["ai", "pkm"]
    });

    expect(created.folder).toBe("raw");
    expect(created.status).toBe("approved");
    expect(created.path).toContain(join(root, "raw"));

    const results = await brain.rawSearch({ query: "obsidian" });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: created.id,
      title: "Local AI Notes",
      folder: "raw",
      status: "approved"
    });
  });

  it("keeps wiki drafts hidden from wiki search until approved", async () => {
    const { brain } = await testBrain();

    const wiki = await brain.wikiInput({
      title: "Semantic Links",
      content: "Semantic search can find related knowledge.",
      sourceIds: ["raw-1"]
    });

    expect(wiki.status).toBe("pending_audit");
    await expect(brain.wikiSearch({ query: "semantic" })).resolves.toEqual([]);

    const pending = await brain.auditList({ status: "pending_audit" });
    expect(pending.map((item) => item.id)).toEqual([wiki.id]);

    const approved = await brain.auditUpdate({
      id: wiki.id,
      decision: "approve",
      comment: "Reviewed and accurate."
    });

    expect(approved.status).toBe("approved");
    const results = await brain.wikiSearch({ query: "semantic" });
    expect(results.map((item) => item.id)).toEqual([wiki.id]);
  });

  it("moves rejected wiki drafts to a rejected subfolder and hides them from audit pending list", async () => {
    const { root, brain } = await testBrain();
    const wiki = await brain.wikiInput({
      title: "Bad Draft",
      content: "This claim is unsupported."
    });

    const rejected = await brain.auditUpdate({
      id: wiki.id,
      decision: "reject",
      comment: "Unsupported claim."
    });

    expect(rejected.status).toBe("rejected");
    expect(rejected.path).toContain(join(root, "wiki", "rejected"));
    await expect(stat(rejected.path)).resolves.toBeTruthy();
    await expect(brain.wikiSearch({ query: "unsupported" })).resolves.toEqual([]);
    await expect(brain.auditList({ status: "pending_audit" })).resolves.toEqual([]);
  });

  it("requires a rejection comment so audits are explainable", async () => {
    const { brain } = await testBrain();
    const wiki = await brain.wikiInput({ title: "Draft", content: "Needs review." });

    await expect(
      brain.auditUpdate({ id: wiki.id, decision: "reject", comment: " " })
    ).rejects.toThrow("comment");
  });

  it("expires old rejected wiki drafts based on retention days", async () => {
    const { brain } = await testBrain();
    const wiki = await brain.wikiInput({ title: "Old Rejection", content: "Outdated." });
    const rejected = await brain.auditUpdate({
      id: wiki.id,
      decision: "reject",
      comment: "Outdated."
    });

    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    await brain.testing.updateManifestItem(rejected.id, { auditedAt: oldDate });

    const purged = await brain.purgeRejected({ now: new Date(), retentionDays: 7 });

    expect(purged).toEqual([rejected.id]);
    await expect(brain.auditList({ status: "rejected" })).resolves.toEqual([]);
    await expect(readFile(rejected.path, "utf8")).rejects.toThrow();
  });

  it("stores generated outputs separately from approved wiki entries", async () => {
    const { brain } = await testBrain();

    const output = await brain.outputsInput({
      title: "Weekly Brief",
      content: "A synthesized answer based on approved notes.",
      sourceIds: ["wiki-1"]
    });

    expect(output.folder).toBe("outputs");
    expect(output.status).toBe("approved");
    const results = await brain.outputsSearch({ query: "synthesized" });
    expect(results.map((item) => item.id)).toEqual([output.id]);
  });

  it("supports search limits and empty queries", async () => {
    const { brain } = await testBrain();
    const first = await brain.rawInput({ title: "First", content: "Alpha" });
    await brain.rawInput({ title: "Second", content: "Beta" });

    const all = await brain.rawSearch({ query: " ", limit: 1 });

    expect(all).toHaveLength(1);
    expect(all[0].folder).toBe(first.folder);
  });

  it("rejects invalid audit targets", async () => {
    const { brain } = await testBrain();
    const raw = await brain.rawInput({ title: "Raw Only", content: "Cannot audit raw." });

    await expect(
      brain.auditUpdate({ id: raw.id, decision: "approve", comment: "Nope." })
    ).rejects.toThrow("Only wiki");
    await expect(
      brain.auditUpdate({ id: "missing", decision: "approve", comment: "Nope." })
    ).rejects.toThrow("Unknown item id");
  });

  it("leaves rejected drafts in place while they are within retention", async () => {
    const { brain } = await testBrain();
    const wiki = await brain.wikiInput({ title: "Recent Rejection", content: "Still retained." });
    const rejected = await brain.auditUpdate({
      id: wiki.id,
      decision: "reject",
      comment: "Keep for now."
    });

    await brain.testing.updateManifestItem(rejected.id, { auditedAt: new Date().toISOString() });

    await expect(brain.purgeRejected({ now: new Date(), retentionDays: 7 })).resolves.toEqual([]);
    await expect(brain.auditList({ status: "rejected" })).resolves.toHaveLength(1);
  });

  it("rejects path traversal titles when generating file names", async () => {
    const { brain } = await testBrain();

    await expect(
      brain.rawInput({ title: "../outside", content: "No escape." })
    ).rejects.toThrow("title");
    await expect(brain.rawInput({ title: "Empty", content: " " })).rejects.toThrow("content");
  });
});
