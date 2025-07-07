import type { LoggingLevel } from '@modelcontextprotocol/sdk/types.js';
import { RATE_LIMIT } from './constants.js';
import { server } from './server.js';

let requestCount = {
  second: 0,
  month: 0,
  lastReset: Date.now(),
};

export async function log(level: LoggingLevel, message: string) {
  const time = new Date().toISOString();
  await server.server.sendLoggingMessage({ level, data: { message, time } });
}

export function checkRateLimit() {
  const now = Date.now();
  if (now - requestCount.lastReset > 1000) {
    requestCount.second = 0;
    requestCount.lastReset = now;
  }
  if (requestCount.second >= RATE_LIMIT.perSecond || requestCount.month >= RATE_LIMIT.perMonth) {
    throw new Error('Rate limit exceeded');
  }
  requestCount.second++;
  requestCount.month++;
}

export function stringify(data: any, pretty = false) {
  return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
}
