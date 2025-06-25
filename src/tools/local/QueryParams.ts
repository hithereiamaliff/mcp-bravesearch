import { z } from "zod";

export const params = z.object({
    query: z.string()
        .describe("Local search query (e.g. 'pizza near Central Park')"),
    count: z.number()
        .int()
        .min(1)
        .max(20)
        .default(5)
        .describe("Number of results (1-20, default 5)")
});

export type QueryParams = z.infer<typeof params>;

export default params;
