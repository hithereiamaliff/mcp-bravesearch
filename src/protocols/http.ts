import { randomUUID } from 'node:crypto';
import express, { type Request, type Response } from 'express';
import config from '../config.js';
import { mcpServer } from '../server.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const yieldGenericServerError = (res: Response) => {
  res.status(500).json({
    id: null,
    jsonrpc: '2.0',
    error: { code: -32603, message: 'Internal server error' },
  });
};

const transports = new Map<string, StreamableHTTPServerTransport>();

export const getTransport = async (request: Request): Promise<StreamableHTTPServerTransport> => {
  // Check for an existing session
  const sessionId = request.headers['mcp-session-id'] as string;

  if (sessionId && transports.has(sessionId)) {
    return transports.get(sessionId)!;
  }

  // Is the client attempting to initialize a new session?
  if (isInitializeRequest(request.body)) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        transports.set(sessionId, transport);
      },
    });

    await mcpServer.connect(transport);
    return transport;
  }

  // We have a special case where we'll permit ListToolsRequest w/o a session ID
  if (request.body.method === ListToolsRequestSchema.shape.method.value) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await mcpServer.connect(transport);
    return transport;
  }

  throw new Error('Invalid request: must be an initialization request, include a valid session ID, or be a ListTools method request');
};

export const createApp = () => {
  const app = express();

  app.use(express.json());

  app.all('/mcp', async (req: Request, res: Response) => {
    try {
      const transport = await getTransport(req);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) {
        yieldGenericServerError(res);
      }
    }
  });

  app.all('/ping', (req: Request, res: Response) => {
    res.status(200).json({ message: 'pong' });
  });

  return app;
};

export const start = () => {
  if (!config.ready) {
    console.error('Invalid configuration');
    process.exit(1);
  }

  const app = createApp();

  app.listen(config.port, config.host, () => {
    console.error(`Server is running on http://${config.host}:${config.port}/mcp`);
  });
};

export default { start, createApp };
