import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestStore {
  braveApiKey: string;
}

export const requestContext = new AsyncLocalStorage<RequestStore>();

export function getRequestApiKey(): string | undefined {
  return requestContext.getStore()?.braveApiKey;
}
