import { z } from "zod";
import { type WebResponse as BraveWeb, type BravePoiResponse, type BraveDescription } from "../types/index.js";
import { performSearch as performWebSearch } from "./web.js";
import { BRAVE_API_KEY } from "../constants.js";
import { checkRateLimit } from "../utils.js";

export const name = "brave_local_search";
export const description = "Searches for local businesses and places using Brave's Local Search API. Best for queries related to physical locations, businesses, restaurants, services, etc. Returns detailed information including:\n- Business names and addresses\n- Ratings and review counts\n- Phone numbers and opening hours\nUse this when the query implies 'near me' or mentions specific locations. Automatically falls back to web search if no local results are found.";
export const paramsSchema = z.object({
    query: z.string().describe("Local search query (e.g. 'pizza near Central Park')"),
    count: z.number().min(1).max(20).default(5).describe("Number of results (1-20, default 5)"),
});

export async function performSearch({ query, count }: z.infer<typeof paramsSchema>) {
    checkRateLimit();
    // Initial search to get location IDs
    const webUrl = new URL('https://api.search.brave.com/res/v1/web/search');
    webUrl.searchParams.set('q', query);
    webUrl.searchParams.set('search_lang', 'en');
    webUrl.searchParams.set('result_filter', 'locations');
    webUrl.searchParams.set('count', Math.min(count, 20).toString());

    const webResponse = await fetch(webUrl, {
        headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': BRAVE_API_KEY
        }
    });

    if (!webResponse.ok) {
        throw new Error(`Brave API error: ${webResponse.status} ${webResponse.statusText}\n${await webResponse.text()}`);
    }

    const webData = await webResponse.json() as BraveWeb;
    const locationIds = webData.locations?.results?.filter((r): r is { id: string; title?: string } => r.id != null).map(r => r.id) || [];

    if (locationIds.length === 0) {
        return performWebSearch({ query, count, offset: 0 }); // Fallback to web search with default offset
    }

    // Get POI details and descriptions in parallel
    const [poisData, descriptionsData] = await Promise.all([
        getPoisData(locationIds),
        getDescriptionsData(locationIds)
    ]);

    return {
        content: [{
            type: "text" as const,
            text: formatLocalResults(poisData, descriptionsData)
        }],
        isError: false,
    };
}

async function getPoisData(ids: string[]): Promise<BravePoiResponse> {
    checkRateLimit();
    const url = new URL('https://api.search.brave.com/res/v1/local/pois');
    ids.filter(Boolean).forEach(id => url.searchParams.append('ids', id));
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

    const poisResponse = await response.json() as BravePoiResponse;
    return poisResponse;
}

async function getDescriptionsData(ids: string[]): Promise<BraveDescription> {
    checkRateLimit();
    const url = new URL('https://api.search.brave.com/res/v1/local/descriptions');
    ids.filter(Boolean).forEach(id => url.searchParams.append('ids', id));
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

    const descriptionsData = await response.json() as BraveDescription;
    return descriptionsData;
}

function formatLocalResults(poisData: BravePoiResponse, descData: BraveDescription): string {
    return (poisData.results || []).map(poi => {
        const address = [
            poi.address?.streetAddress ?? '',
            poi.address?.addressLocality ?? '',
            poi.address?.addressRegion ?? '',
            poi.address?.postalCode ?? ''
        ].filter(part => part !== '').join(', ') || 'N/A';

        return `Name: ${poi.name}
  Address: ${address}
  Phone: ${poi.phone || 'N/A'}
  Rating: ${poi.rating?.ratingValue ?? 'N/A'} (${poi.rating?.ratingCount ?? 0} reviews)
  Price Range: ${poi.priceRange || 'N/A'}
  Hours: ${(poi.openingHours || []).join(', ') || 'N/A'}
  Description: ${descData.descriptions[poi.id] || 'No description available'}
  `;
    }).join('\n---\n') || 'No local results found';
}
