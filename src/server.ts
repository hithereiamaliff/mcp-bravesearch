import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import tools from './tools/index.js';
import ClientLogger, { maybeRegisterCustomSetLevelRequestHandler } from './ClientLogger.js';

export const mcpServer = new McpServer(
  {
    version: '0.1.0',
    name: 'brave-search-mcp-server',
    title: 'Brave Search MCP Server',
  },
  {
    capabilities: {
      logging: {},
      tools: { listChanged: false },
    },
    instructions: `Use this server to search the Web for various types of data via the Brave Search API.`,
  }
);

ClientLogger.setServer(mcpServer);
// https://github.com/modelcontextprotocol/typescript-sdk/issues/871
maybeRegisterCustomSetLevelRequestHandler(mcpServer.server);

for (const tool of Object.values(tools)) {
  mcpServer.tool(tool.name, tool.description, tool.inputSchema, tool.annotations, tool.execute);
}
