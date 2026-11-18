import * as z from 'zod';

import { cloudAgentTimestampSchema } from './cloud-agent-time.ts';

/**
 * How GitHub reports a pull request's own lifecycle. `draft` and `open` are
 * both live and `merged` and `closed` are both finished, and each pair reads
 * differently to a human, so none of them collapse into one another.
 */
export const cloudAgentPullRequestStates = ['draft', 'open', 'merged', 'closed'] as const;

export const cloudAgentPullRequestStateSchema = z.enum(cloudAgentPullRequestStates);

/**
 * One GitHub reading of the pull request a Run opened, taken by the Computer
 * at observation time. Cursor's own API carries no diff statistics, so the
 * Computer reads them where they exist. This is provider-observation evidence
 * on the Run, frozen once the Run settles; `cloudAgentPullRequestReadingSchema`
 * is what stays live. `observedAt` dates the reading, so a newer snapshot
 * replaces an older one and a Run that could not be read keeps the snapshot it
 * already had.
 */
export const cloudAgentPullRequestSchema = z
    .object({
        additions: z.number().int().nonnegative(),
        changedFiles: z.number().int().nonnegative(),
        deletions: z.number().int().nonnegative(),
        number: z.number().int().positive(),
        observedAt: cloudAgentTimestampSchema,
        state: cloudAgentPullRequestStateSchema,
    })
    .strict();

/** Rollups of a pull request's checks and reviews; `unknown` until GitHub is read. */
export const cloudAgentPullRequestCheckStates = [
    'none',
    'pending',
    'passing',
    'failing',
    'unknown',
] as const;
export const cloudAgentPullRequestReviewStates = [
    'none',
    'approved',
    'changes-requested',
    'unknown',
] as const;

/**
 * The Server's live reading of a pull request some Cloud Agent work reported
 * (ADR 0053 decision 6). It stays evidence: Haus never acts on the pull
 * request. A `computer` reading is the Run's snapshot, frozen once the Run
 * settled; a `github` one is kept current by webhooks.
 */
export const cloudAgentPullRequestReadingSchema = cloudAgentPullRequestSchema.extend({
    checks: z.enum(cloudAgentPullRequestCheckStates),
    headSha: z.string().min(1).max(100).nullable(),
    repository: z.string().min(1).max(300),
    review: z.enum(cloudAgentPullRequestReviewStates),
    /** When GitHub merged or closed it; null while it is open or was never read. */
    settledAt: cloudAgentTimestampSchema.nullable(),
    source: z.enum(['computer', 'github']),
    /** Null until GitHub is read: a Run's snapshot carries no title. */
    title: z.string().min(1).max(1000).nullable(),
    url: z.url().max(2000),
});

export type CloudAgentPullRequest = z.infer<typeof cloudAgentPullRequestSchema>;
export type CloudAgentPullRequestReading = z.infer<typeof cloudAgentPullRequestReadingSchema>;
export type CloudAgentPullRequestState = z.infer<typeof cloudAgentPullRequestStateSchema>;

/** A GitHub pull request URL's lower-cased `owner/name` and number; null for any other URL. */
export function parseGithubPullRequestUrl(
    url: string
): { number: number; repository: string } | null {
    const matched = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)(?:[/?#]|$)/u.exec(url);
    return matched?.[1] && matched[2]
        ? { number: Number(matched[2]), repository: matched[1].toLowerCase() }
        : null;
}

/**
 * The pull-request number a GitHub-shaped URL names. One owner for the parse,
 * so every surface that prints `pr=#<n>` reads the same digits out of the same
 * URL Cursor reported.
 */
export function cloudAgentPullRequestNumber(pullRequestUrl: string): number | null {
    const matched = /\/pull(?:s|-requests)?\/(\d+)(?:[/?#]|$)/u.exec(pullRequestUrl);
    const number = matched ? Number.parseInt(matched[1] as string, 10) : Number.NaN;
    return Number.isSafeInteger(number) && number > 0 ? number : null;
}
