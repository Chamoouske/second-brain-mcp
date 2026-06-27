import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSecondBrain } from "../src/secondBrain.js";
import { createToolHandlers } from "../src/tools.js";

async function handlers() {
  const root = await mkdtemp(join(tmpdir(), "second-brain-tools-"));
  return createToolHandlers(createSecondBrain({ root, rejectedRetentionDays: 30 }));
}

describe("MCP tool handlers", () => {
  it("exposes semantic tool names for the three folders and audits", async () => {
    const tools = await handlers();

    expect(Object.keys(tools).sort()).toEqual([
      "audit_list",
      "audit_update",
      "outputs_input",
      "outputs_search",
      "purge_rejected",
      "raw_input",
      "raw_search",
      "wiki_input",
      "wiki_search"
    ]);
  });

  it("returns approved wiki entries only after audit approval", async () => {
    const tools = await handlers();
    const created = await tools.wiki_input({
      title: "Audited Knowledge",
      content: "Only approved knowledge is retrievable."
    });

    await expect(tools.wiki_search({ query: "approved" })).resolves.toEqual({ items: [] });
    await tools.audit_update({ id: created.item.id, decision: "approve", comment: "Looks good." });

    const search = await tools.wiki_search({ query: "approved" });
    expect(search.items.map((item) => item.id)).toEqual([created.item.id]);
  });

  it("routes all folder and audit helpers through validated handlers", async () => {
    const tools = await handlers();
    await tools.raw_input({ title: "Raw", content: "Source text" });
    await tools.outputs_input({ title: "Output", content: "Generated text" });

    await expect(tools.raw_search({ query: "source" })).resolves.toHaveProperty("items");
    await expect(tools.outputs_search({ query: "generated" })).resolves.toHaveProperty("items");
    await expect(tools.audit_list({ status: "pending_audit" })).resolves.toEqual({ items: [] });
    await expect(tools.purge_rejected({ retentionDays: 0 })).resolves.toEqual({ purgedIds: [] });
  });
});
