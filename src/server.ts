#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { startHttpServer } from "./httpServer.js";
import { buildServer } from "./mcpServer.js";

export async function startStdioServer() {
  const server = buildServer();
  await server.connect(new StdioServerTransport());
}

export async function main() {
  if (process.env.MCP_TRANSPORT === "http") {
    await startHttpServer();
    return;
  }

  await startStdioServer();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
