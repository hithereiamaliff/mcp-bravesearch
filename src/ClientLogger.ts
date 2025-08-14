// ClientLogger.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LoggingLevel, SetLevelRequest } from '@modelcontextprotocol/sdk/types.js';
import { LoggingLevelSchema, SetLevelRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import config from './config.js';

type LoggerFn = (level: LoggingLevel, message: string) => Promise<void>;

let mcpServer: McpServer | undefined;

const setServer = (server: McpServer) => {
  mcpServer = server;
};

let customLogger: LoggerFn | undefined;
let currentLevel: number = LoggingLevelSchema.options.indexOf(config.loggingLevel);

/**
 * Attempt to register a custom set level request handler.
 * If the method is already handled by the SDK/Server, we'll ignore the error.
 * @see https://github.com/modelcontextprotocol/typescript-sdk/issues/871
 * @param server {Server} The server to register the handler on.
 */
export const maybeRegisterCustomSetLevelRequestHandler = (server: McpServer['server']) => {
  try {
    server.assertCanSetRequestHandler(SetLevelRequestSchema.shape.method.value);
    server.setRequestHandler(
      SetLevelRequestSchema,
      async (request: SetLevelRequest): Promise<any> => {
        await log('info', `Setting logging level to ${request.params.level}`);
        currentLevel = LoggingLevelSchema.options.indexOf(request.params.level);
        return {};
      }
    );
  } catch (error) {
    console.error(
      `Failed to register custom SetLevelRequest handler. The SDK may now provide its own handler. See https://github.com/modelcontextprotocol/typescript-sdk/issues/871 for more information.`,
      error
    );
  }
};

const log = async (level: LoggingLevel, message: string) => {
  // If a custom logger exists, call it, and let it handle it's own log-level filtering
  if (customLogger) {
    await customLogger(level, message);
    return;
  }

  // If the log-level is less than the current log-level, skip it
  if (LoggingLevelSchema.options.indexOf(level) < currentLevel) {
    return;
  }

  // Fall back to default logger if no custom logger is set
  const time = new Date().toISOString();

  if (!mcpServer?.isConnected()) {
    console.error(`${time} [${level}] ${message}`);
    return;
  }

  try {
    await mcpServer?.server.sendLoggingMessage({ level, data: { message, time } });
  } catch (error) {
    console.error(`Error sending logging message: ${error}`);
  }
};

const setLogger = (logger: LoggerFn): void => {
  customLogger = logger;
};

const setLoggingLevel = (desiredLevel: LoggingLevel): void => {
  const desiredLevelIndex = LoggingLevelSchema.options.indexOf(desiredLevel);

  if (desiredLevelIndex === -1) {
    console.error(
      `Invalid logging level: ${desiredLevel}. Must be one of: ${LoggingLevelSchema.options.join(', ')}`
    );
    return;
  }

  currentLevel = desiredLevelIndex;
};

const getLoggingLevel = (): LoggingLevel => LoggingLevelSchema.options[currentLevel];

export default { log, setServer, setLogger, setLoggingLevel, getLoggingLevel };
