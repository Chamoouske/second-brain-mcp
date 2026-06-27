import { randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Express, Request, Response } from "express";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildServer } from "./mcpServer.js";

export interface HttpServerOptions {
  host: string;
  port: number;
  path: string;
}

export interface HttpAppOptions {
  path: string;
  buildMcpServer?: () => McpServer;
  createTransport?: (options: ConstructorParameters<typeof StreamableHTTPServerTransport>[0]) => StreamableHTTPServerTransport;
}

type TransportMap = Record<string, StreamableHTTPServerTransport>;

function normalizeHttpPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return "/mcp";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function sendJsonRpcError(res: Response, status: number, message: string): void {
  res.status(status).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message
    },
    id: null
  });
}

async function closeTransports(transports: TransportMap): Promise<void> {
  await Promise.all(
    Object.entries(transports).map(async ([sessionId, transport]) => {
      await transport.close();
      delete transports[sessionId];
    })
  );
}

export function createHttpApp(options: HttpAppOptions): Express {
  const path = normalizeHttpPath(options.path);
  const buildMcpServer = options.buildMcpServer ?? buildServer;
  const createTransport =
    options.createTransport ?? ((transportOptions) => new StreamableHTTPServerTransport(transportOptions));
  const transports: TransportMap = {};
  const app = createMcpExpressApp();

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.post(path, async (req: Request, res: Response) => {
    try {
      const sessionHeader = req.headers["mcp-session-id"];
      const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
      let transport = sessionId ? transports[sessionId] : undefined;

      if (!transport && !sessionId && isInitializeRequest(req.body)) {
        transport = createTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            if (transport) {
              transports[newSessionId] = transport;
            }
          }
        });

        transport.onclose = () => {
          if (transport?.sessionId) {
            delete transports[transport.sessionId];
          }
        };

        await buildMcpServer().connect(transport);
      }

      if (!transport) {
        sendJsonRpcError(res, 400, "Bad Request: No valid MCP session ID provided");
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) {
        sendJsonRpcError(res, 500, error instanceof Error ? error.message : "Internal server error");
      }
    }
  });

  app.get(path, async (req: Request, res: Response) => {
    const sessionHeader = req.headers["mcp-session-id"];
    const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
    const transport = sessionId ? transports[sessionId] : undefined;

    if (!sessionId || !transport) {
      res.status(400).send("Invalid or missing MCP session ID");
      return;
    }

    await transport.handleRequest(req, res);
  });

  app.delete(path, async (req: Request, res: Response) => {
    const sessionHeader = req.headers["mcp-session-id"];
    const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
    const transport = sessionId ? transports[sessionId] : undefined;

    if (!sessionId || !transport) {
      res.status(400).send("Invalid or missing MCP session ID");
      return;
    }

    await transport.handleRequest(req, res);
    delete transports[sessionId];
  });

  app.locals.closeMcpTransports = () => closeTransports(transports);
  app.locals.mcpPath = path;
  return app;
}

export function readHttpServerOptions(env = process.env): HttpServerOptions {
  const port = Number(env.PORT ?? env.MCP_HTTP_PORT ?? "3000");
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("PORT or MCP_HTTP_PORT must be an integer between 1 and 65535");
  }

  return {
    host: env.HOST ?? "127.0.0.1",
    port,
    path: normalizeHttpPath(env.MCP_HTTP_PATH ?? "/mcp")
  };
}

export async function startHttpServer(options = readHttpServerOptions()): Promise<HttpServer> {
  const app = createHttpApp({ path: options.path });
  return new Promise((resolve, reject) => {
    const server = app.listen(options.port, options.host, () => {
      resolve(server);
    });
    server.once("error", reject);
    server.once("close", () => {
      const close = app.locals.closeMcpTransports as (() => Promise<void>) | undefined;
      void close?.();
    });
  });
}
