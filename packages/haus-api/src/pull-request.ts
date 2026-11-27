import * as z from 'zod';
import { timestampSchema } from './chat-contract-primitives.ts';

/**
 * How GitHub reports a pull request's own lifecycle. `draft` and `open` are
 * both live and `merged` and `closed` are both finished, and each pair reads
 * differently to a human, so none of them collapse into one another.
 */
export const pullRequestStates = ['draft', 'open', 'merged', 'closed'] as const;

export const pullRequestStateSchema = z.enum(pullRequestStates);

/** Rollups of a pull request's checks and reviews; `unknown` until GitHub is read. */
export const pullRequestCheckStates = ['none', 'pending', 'passing', 'failing', 'unknown'] as const;
export const pullRequestReviewStates = [
    'none',
    'approved',
    'changes-requested',
    'unknown',
] as const;

/**
 * The Server's live reading of a pull request a Task or Issue names
 * (ADR 0053 decision 6). It stays evidence: Haus never acts on the pull
 * request. A `github` reading is kept current by webhooks; a `computer` one
 * is a snapshot a Computer took before ADR 0062, which GitHub refreshes.
 * `observedAt` dates the reading, so a newer one replaces an older one.
 */
export const pullRequestReadingSchema = z
    .object({
        additions: z.number().int().nonnegative(),
        changedFiles: z.number().int().nonnegative(),
        checks: z.enum(pullRequestCheckStates),
        deletions: z.number().int().nonnegative(),
        headSha: z.string().min(1).max(100).nullable(),
        number: z.number().int().positive(),
        observedAt: timestampSchema,
        repository: z.string().min(1).max(300),
        review: z.enum(pullRequestReviewStates),
        /** When GitHub merged or closed it; null while it is open or was never read. */
        settledAt: timestampSchema.nullable(),
        source: z.enum(['computer', 'github']),
        state: pullRequestStateSchema,
        /** Null until GitHub is read. */
        title: z.string().min(1).max(1000).nullable(),
        url: z.url().max(2000),
    })
    .strict();

export type PullRequestReading = z.infer<typeof pullRequestReadingSchema>;
export type PullRequestState = z.infer<typeof pullRequestStateSchema>;

/** A GitHub pull request URL's lower-cased `owner/name` and number; null for any other URL. */
export function parseGithubPullRequestUrl(url: string) {
    const matched = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)(?:[/?#]|$)/u.exec(url);
    return matched?.[1] && matched[2]
        ? { number: Number(matched[2]), repository: matched[1].toLowerCase() }
        : null;
}

/** The pull-request number a GitHub-shaped URL names, so every `pr=#<n>` reads the same digits. */
export function pullRequestNumber(pullRequestUrl: string) {
    const matched = /\/pull(?:s|-requests)?\/(\d+)(?:[/?#]|$)/u.exec(pullRequestUrl);
    const number = matched ? Number.parseInt(matched[1] as string, 10) : Number.NaN;
    return Number.isSafeInteger(number) && number > 0 ? number : null;
}
