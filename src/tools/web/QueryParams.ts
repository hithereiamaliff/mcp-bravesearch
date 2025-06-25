import { z } from "zod";

export const params = z.object({
    query: z.string()
        .max(400)
        .refine(str => str.split(/\s+/).length <= 50, "Query cannot exceed 50 words")
        .describe("Search query (max 400 chars, 50 words)"),
    count: z.number()
        .int()
        .min(1)
        .max(20)
        .default(10)
        .describe("Number of results (1-20, default 10)"),
    offset: z.number()
        .int()
        .min(0)
        .max(9)
        .default(0)
        .describe("Pagination offset (max 9, default 0)")
});

export type QueryParams = z.infer<typeof params>;

export default params;
