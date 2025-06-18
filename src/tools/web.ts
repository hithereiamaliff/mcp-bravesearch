import { type WebResponse } from "../types/index.js";
import { BRAVE_API_KEY } from "../constants.js";
import { checkRateLimit } from "../utils.js";
import { z } from "zod";

export const name = "brave_web_search";
export const description = "Performs a web search using the Brave Search API, ideal for general queries, news, articles, and online content. Use this for broad information gathering, recent events, or when you need diverse web sources. Supports pagination, content filtering, and freshness controls. Maximum 20 results per request, with offset for pagination.";
export const paramsSchema = z.object({
    query: z.string().describe("Search query (max 400 chars, 50 words)"),
    count: z.number().min(1).max(20).default(10).describe("Number of results (1-20, default 10)"),
    offset: z.number().min(0).max(9).default(0).describe("Pagination offset (max 9, default 0)")
});

export async function performSearch({ query, count, offset }: z.infer<typeof paramsSchema>) {
    checkRateLimit();
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', Math.min(count, 20).toString()); // API limit
    url.searchParams.set('offset', offset.toString());

    const response = await fetch(url, {
        headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': BRAVE_API_KEY
        }
    });

    if (!response.ok) {
        throw new Error(`Brave API error: ${response.status} ${response.statusText}\n${await response.text()}`);
    }

    const data = await response.json() as WebResponse;

    // Extract just web results
    const results = (data.web?.results || []).map(result => ({
        title: result.title || '',
        description: result.description || '',
        url: result.url || ''
    }));

    return {
        content: results.map(r => ({
            type: "text" as const,
            text: `Title: ${r.title}\nDescription: ${r.description}\nURL: ${r.url}`
        })),
        isError: false,
    };
}
