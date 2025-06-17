#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { BRAVE_API_KEY } from "./constants.js";

import WEB_SEARCH_TOOL, { validateArgs as isBraveWebSearchArgs, performSearch as performWebSearch } from "./tools/web.js";
import LOCAL_SEARCH_TOOL, { validateArgs as isBraveLocalSearchArgs, performSearch as performLocalSearch } from "./tools/local.js";

// Server implementation
const server = new Server(
  {
    name: "brave-search-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Check for API key
if (!BRAVE_API_KEY) {
  console.error("Error: BRAVE_API_KEY environment variable is required");
  process.exit(1);
}

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [WEB_SEARCH_TOOL, LOCAL_SEARCH_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    if (!args) {
      throw new Error("No arguments provided");
    }

    switch (name) {
      case "brave_web_search": {
        if (!isBraveWebSearchArgs(args)) {
          throw new Error("Invalid arguments for brave_web_search");
        }
        const { query, count = 10 } = args;
        const results = await performWebSearch(query, count);
        return {
          content: [{ type: "text", text: results }],
          isError: false,
        };
      }

      case "brave_local_search": {
        if (!isBraveLocalSearchArgs(args)) {
          throw new Error("Invalid arguments for brave_local_search");
        }
        const { query, count = 5 } = args;
        const results = await performLocalSearch(query, count);
        return {
          content: [{ type: "text", text: results }],
          isError: false,
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Brave Search MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
