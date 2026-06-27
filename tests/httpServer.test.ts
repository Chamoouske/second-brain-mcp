import { describe, expect, it } from "vitest";
import { createHttpApp, readHttpServerOptions, startHttpServer } from "../src/httpServer.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function fakeMcpServer() {
  return {
    connect: async () => undefined
  } as unknown as McpServer;
}

describe("HTTP transport", () => {
  it("loads HTTP server options from env", () => {
    expect(
      readHttpServerOptions({
        HOST: "0.0.0.0",
        PORT: "8080",
        MCP_HTTP_PATH: "second-brain"
      })
    ).toEqual({
      host: "0.0.0.0",
      port: 8080,
      path: "/second-brain"
    });
  });

  it("uses defaults for optional HTTP settings", () => {
    expect(readHttpServerOptions({})).toEqual({
      host: "127.0.0.1",
      port: 3000,
      path: "/mcp"
    });

    const app = createHttpApp({ path: " " });
    expect(app.locals.mcpPath).toBe("/mcp");
  });

  it("rejects invalid HTTP ports", () => {
    expect(() => readHttpServerOptions({ PORT: "70000" })).toThrow("PORT");
    expect(() => readHttpServerOptions({ MCP_HTTP_PORT: "abc" })).toThrow("PORT");
  });

  it("exposes a health endpoint", async () => {
    const app = createHttpApp({ path: "/mcp" });
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP listener address");
    }

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/health`);
      await expect(response.json()).resolves.toEqual({ status: "ok" });
      expect(response.status).toBe(200);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("returns an MCP JSON-RPC error for requests without a valid session", async () => {
    const app = createHttpApp({ path: "mcp" });
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP listener address");
    }

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 })
      });
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error.message).toContain("No valid MCP session ID");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("rejects GET and DELETE requests without a valid session", async () => {
    const app = createHttpApp({ path: "/mcp" });
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP listener address");
    }

    try {
      const baseUrl = `http://127.0.0.1:${address.port}/mcp`;
      const getResponse = await fetch(baseUrl);
      const deleteResponse = await fetch(baseUrl, { method: "DELETE" });

      expect(getResponse.status).toBe(400);
      await expect(getResponse.text()).resolves.toContain("Invalid or missing");
      expect(deleteResponse.status).toBe(400);
      await expect(deleteResponse.text()).resolves.toContain("Invalid or missing");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("returns a JSON-RPC server error when initialize setup fails", async () => {
    const app = createHttpApp({
      path: "/mcp",
      buildMcpServer: () => {
        throw new Error("test initialization failure");
      }
    });
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP listener address");
    }

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "test", version: "0.0.0" }
          }
        })
      });
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error.message).toBe("test initialization failure");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("handles a full injected HTTP session lifecycle", async () => {
    let sessionId: string | undefined;
    let closed = false;
    let fakeTransportOptions: { onsessioninitialized?: (sessionId: string) => void } = {};
    const fakeTransport = {
      get sessionId() {
        return sessionId;
      },
      onclose: undefined as (() => void) | undefined,
      close: async () => {
        closed = true;
      },
      handleRequest: async (_req: unknown, res: unknown) => {
        const response = res as { status: (code: number) => { json: (body: unknown) => void; send: (body?: unknown) => void } };
        if (!sessionId) {
          sessionId = "session-1";
          fakeTransportOptions.onsessioninitialized?.(sessionId);
          response.status(202).json({ ok: true, sessionId });
          return;
        }
        response.status(204).send();
      }
    };
    const app = createHttpApp({
      path: "/mcp",
      buildMcpServer: fakeMcpServer,
      createTransport: (options) => {
        fakeTransportOptions = options ?? {};
        return fakeTransport as never;
      }
    });
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP listener address");
    }

    try {
      const baseUrl = `http://127.0.0.1:${address.port}/mcp`;
      const initResponse = await fetch(baseUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "test", version: "0.0.0" }
          }
        })
      });
      expect(initResponse.status).toBe(202);

      const getResponse = await fetch(baseUrl, { headers: { "mcp-session-id": "session-1" } });
      expect(getResponse.status).toBe(204);

      const deleteResponse = await fetch(baseUrl, {
        method: "DELETE",
        headers: { "mcp-session-id": "session-1" }
      });
      expect(deleteResponse.status).toBe(204);

      await app.locals.closeMcpTransports();
      expect(closed).toBe(false);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("closes stored MCP transports through app locals", async () => {
    let sessionId: string | undefined;
    let closed = false;
    let fakeTransportOptions: { onsessioninitialized?: (sessionId: string) => void } = {};
    const fakeTransport = {
      get sessionId() {
        return sessionId;
      },
      onclose: undefined as (() => void) | undefined,
      close: async () => {
        closed = true;
      },
      handleRequest: async (_req: unknown, res: unknown) => {
        sessionId = "session-2";
        fakeTransportOptions.onsessioninitialized?.(sessionId);
        (res as { status: (code: number) => { json: (body: unknown) => void } }).status(202).json({ ok: true });
      }
    };
    const app = createHttpApp({
      path: "/mcp",
      buildMcpServer: fakeMcpServer,
      createTransport: (options) => {
        fakeTransportOptions = options ?? {};
        return fakeTransport as never;
      }
    });
    const server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP listener address");
    }

    try {
      await fetch(`http://127.0.0.1:${address.port}/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "test", version: "0.0.0" }
          }
        })
      });

      await app.locals.closeMcpTransports();
      expect(closed).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("starts and closes the HTTP server", async () => {
    const server = await startHttpServer({ host: "127.0.0.1", port: 0, path: "/mcp" });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP listener address");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    expect(response.status).toBe(200);

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
});
