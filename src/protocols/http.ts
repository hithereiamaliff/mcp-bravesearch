import { randomUUID } from 'node:crypto';
import express, { type Request, type Response } from 'express';
import config from '../config.js';
import { server } from '../server.js';
import { registerSigIntHandler } from '../helpers.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { InMemoryEventStore } from '@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js';

const getTransport = async (
  req: Request,
  transports: Map<string, StreamableHTTPServerTransport>,
  sessionId?: string | string[]
): Promise<StreamableHTTPServerTransport> => {
  // Belongs to an existing session; re-use the transport
  if (sessionId && transports.has(sessionId as string)) {
    return transports.get(sessionId as string) as StreamableHTTPServerTransport;
  }

  // No session ID and this is an initialization request; create a new transport
  if (!sessionId && isInitializeRequest(req.body)) {
    const transport = new StreamableHTTPServerTransport({
      eventStore: new InMemoryEventStore(),
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => transports.set(sessionId, transport),
    });

    transport.onclose = () => transports.delete(transport.sessionId as string);

    await server.connect(transport);

    return transport;
  }

  // No session ID and this is not an initialization request; throw an error
  throw new Error('Invalid request - no session ID or not initialization request');
};

export const start = () => {
  if (!config.ready) {
    console.error('Invalid configuration');
    process.exit(1);
  }

  const app = express();
  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.use(express.json());

  app.all('/mcp', async (req: Request, res: Response) => {
    try {
      const transport = await getTransport(req, transports, req.headers['mcp-session-id']);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({
          id: null,
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
        });
      }
    }
  });

  app.all('/ping', (req: Request, res: Response) => {
    res.status(200).json({ message: 'pong' });
  });

  app.listen(config.port, config.host, () => {
    console.error(`Server is running on http://${config.host}:${config.port}/mcp`);
  });

  // Register a SIGINT handler to close all transports when the server is shut down
  registerSigIntHandler(transports);
};

export default { start };
