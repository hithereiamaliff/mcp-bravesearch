import { mcpServer } from '../server.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

export const createTransport = (): StdioServerTransport => {
  return new StdioServerTransport();
};

export const start = async (): Promise<void> => {
  const transport = createTransport();
  await mcpServer.connect(transport);
  console.error('Stdio server started');
};

export default { start, createTransport };
