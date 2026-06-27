import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createSecondBrain } from "./secondBrain.js";
import { loadSecondBrainOptions } from "./config.js";
import { createToolHandlers, toolSchemas } from "./tools.js";

function jsonContent(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

export function buildServer() {
  const brain = createSecondBrain(loadSecondBrainOptions());
  const handlers = createToolHandlers(brain);
  const server = new McpServer({
    name: "second-brain-mcp",
    version: "0.1.0"
  });

  server.registerTool(
    "raw_input",
    {
      title: "Raw Input",
      description: "Store source material text in the raw folder.",
      inputSchema: toolSchemas.inputSchema
    },
    async (args) => jsonContent(await handlers.raw_input(args))
  );

  server.registerTool(
    "raw_search",
    {
      title: "Raw Search",
      description: "Search original source material stored in raw.",
      inputSchema: toolSchemas.searchSchema
    },
    async (args) => jsonContent(await handlers.raw_search(args))
  );

  server.registerTool(
    "wiki_input",
    {
      title: "Wiki Input",
      description: "Store a wiki draft as pending audit.",
      inputSchema: toolSchemas.inputSchema
    },
    async (args) => jsonContent(await handlers.wiki_input(args))
  );

  server.registerTool(
    "wiki_search",
    {
      title: "Wiki Search",
      description: "Search only approved wiki entries.",
      inputSchema: toolSchemas.searchSchema
    },
    async (args) => jsonContent(await handlers.wiki_search(args))
  );

  server.registerTool(
    "outputs_input",
    {
      title: "Outputs Input",
      description: "Store generated reports, answers, and composites.",
      inputSchema: toolSchemas.inputSchema
    },
    async (args) => jsonContent(await handlers.outputs_input(args))
  );

  server.registerTool(
    "outputs_search",
    {
      title: "Outputs Search",
      description: "Search generated outputs.",
      inputSchema: toolSchemas.searchSchema
    },
    async (args) => jsonContent(await handlers.outputs_search(args))
  );

  server.registerTool(
    "audit_list",
    {
      title: "Audit List",
      description: "List wiki entries by audit status, pending by default.",
      inputSchema: toolSchemas.auditListSchema
    },
    async (args) => jsonContent(await handlers.audit_list(args))
  );

  server.registerTool(
    "audit_update",
    {
      title: "Audit Update",
      description: "Approve or reject a wiki draft. Rejections move files to wiki/rejected.",
      inputSchema: toolSchemas.auditUpdateSchema
    },
    async (args) => jsonContent(await handlers.audit_update(args))
  );

  server.registerTool(
    "purge_rejected",
    {
      title: "Purge Rejected",
      description: "Delete rejected wiki drafts older than the configured retention period.",
      inputSchema: toolSchemas.purgeSchema
    },
    async (args) => jsonContent(await handlers.purge_rejected(args))
  );

  return server;
}
