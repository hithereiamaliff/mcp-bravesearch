#!/usr/bin/env node

import { Command } from "commander";
import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { BRAVE_API_KEY } from "./constants.js";

import { name as braveWebSearchName, paramsSchema as braveWebSearchParamsSchema, performSearch as performWebSearch } from "./tools/web.js";
import { name as braveLocalSearchName, paramsSchema as braveLocalSearchParamsSchema, performSearch as performLocalSearch } from "./tools/local.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { InMemoryEventStore } from "@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js";

if (!BRAVE_API_KEY) {
  console.error("Error: BRAVE_API_KEY environment variable is required");
  process.exit(1);
}

const program = new Command()
  .option("--transport <stdio|http>", "transport type", process.env.BRAVE_MCP_TRANSPORT ?? "stdio")
  .option("--port <number>", "desired port for HTTP transport", process.env.BRAVE_MCP_PORT ?? "3000")
  .option("--host <string>", "host address to bind to for HTTP transport", process.env.BRAVE_MCP_HOST ?? "0.0.0.0")
  .allowUnknownOption()
  .parse(process.argv);

const TRANSPORT_TYPES = ["stdio", "http"] as const;

const CLI_OPTIONS = program.opts<{ transport: "stdio" | "http"; port: string; host: string }>();

if (!TRANSPORT_TYPES.includes(CLI_OPTIONS.transport)) {
  console.error(`Invalid --transport value: '${CLI_OPTIONS.transport}'. Must be one of: ${TRANSPORT_TYPES.join(", ")}.`);
  process.exit(1);
}

function createServer(): McpServer {
  const server = new McpServer({
    version: "0.1.0",
    name: "brave-search-mcp-server",
    instructions: "Use this server to search the Web for various types of data via the Brave Search API.",
  }, { capabilities: { logging: {} } });

  server.tool(braveWebSearchName, braveWebSearchParamsSchema.shape, performWebSearch);
  server.tool(braveLocalSearchName, braveLocalSearchParamsSchema.shape, performLocalSearch);

  return server;
}

async function createNewHttpTransport(transports: Map<string, StreamableHTTPServerTransport>): Promise<StreamableHTTPServerTransport> {
  const transport = new StreamableHTTPServerTransport({
    eventStore: new InMemoryEventStore(),
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId) => {
      transports.set(sessionId, transport);
    }
  });

  transport.onclose = () => {
    const sessionId = transport.sessionId;
    if (sessionId && transports.has(sessionId)) {
      transports.delete(sessionId);
    }
  };

  return transport;
}

async function getHttpTransportForRequest(req: Request, transports: Map<string, StreamableHTTPServerTransport>): Promise<StreamableHTTPServerTransport> {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (sessionId && transports.has(sessionId)) {
    return transports.get(sessionId) as StreamableHTTPServerTransport;
  }

  if (!sessionId && isInitializeRequest(req.body)) {
    const server = createServer();
    const transport = await createNewHttpTransport(transports);
    await server.connect(transport);

    return transport;
  }

  throw new Error('Invalid request - no session ID or not initialization request');
}

function startHttpServer(port: string, host: string, transports: Map<string, StreamableHTTPServerTransport>) {
  const app = express();

  app.use(express.json());

  app.all('/mcp', async (req: Request, res: Response) => {
    try {
      const transport = await getHttpTransportForRequest(req, transports);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({
          id: null, jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
        });
      }
    }
  });

  app.listen(parseInt(port), host, () => console.error(`Server is running on http://${host}:${port}/mcp`));
}

async function startStdioServer() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function registerSigIntHandler(transports: Map<string, StreamableHTTPServerTransport>) {
  process.on('SIGINT', async () => {
    for (const sessionID of transports.keys()) {
      await transports.get(sessionID)?.close();
      transports.delete(sessionID);
    }

    console.error('Server shut down.');
    process.exit(0);
  });
}

function main() {
  const transports = new Map<string, StreamableHTTPServerTransport>();

  if (CLI_OPTIONS.transport === "http") {
    startHttpServer(CLI_OPTIONS.port, CLI_OPTIONS.host, transports);
  } else {
    startStdioServer();
  }

  registerSigIntHandler(transports);
  console.error(`Server is running on ${CLI_OPTIONS.transport} mode`);
}

main();
