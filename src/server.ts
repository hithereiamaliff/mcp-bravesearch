import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import tools from "./tools/index.js";

export const server = new McpServer(
    {
        version: "0.1.0",
        name: "brave-search-mcp-server",
        title: "Brave Search MCP Server",
    },
    {
        capabilities: {
            logging: {},
            tools: { listChanged: false },
        },
        instructions:
            "Use this server to search the Web for various types of data " +
            "via the Brave Search API.",
    }
);

for (const tool of Object.values(tools)) {
    server.tool(
        tool.name,
        tool.description,
        tool.inputSchema,
        tool.annotations,
        tool.execute
    );
}
