export const BRAVE_API_KEY = process.env.BRAVE_API_KEY!;

export const RATE_LIMIT = {
  perSecond: 1,
  perMonth: 15000,
} as const;
