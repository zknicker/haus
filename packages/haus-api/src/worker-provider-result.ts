import * as z from 'zod';

/**
 * The hard cap on a Run's full report (TECH-8): large enough that no real
 * final report needs cutting, measured the same length-based way as
 * `workerSummaryMaxLength` rather than exact UTF-8 bytes.
 */
export const workerProviderResultMaxLength = 65_536;

/**
 * A Run's full final report (TECH-8), alongside its bounded `summary`. The
 * Computer derives both from the same source text, so `summary` is always a
 * truncated-consistent prefix of `report.text`, never an independently cut
 * sibling that can drift from it. `clipped` is explicit rather than an
 * in-band ellipsis, so a reader never silently loses the hard-cap boundary.
 */
export const workerProviderResultSchema = z
    .object({
        clipped: z.boolean(),
        text: z.string().trim().min(1).max(workerProviderResultMaxLength),
    })
    .strict();

export type WorkerProviderResult = z.infer<typeof workerProviderResultSchema>;
