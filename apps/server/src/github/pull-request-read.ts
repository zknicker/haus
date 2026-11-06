import type { CloudAgentPullRequestReading, CloudAgentPullRequestState } from '@haus/api';
import * as z from 'zod';
import {
    GithubApiError,
    type GithubApiTransport,
    githubNextPage,
    githubRequest,
} from './github-api.ts';

/** What one GitHub read says about a pull request. */
export interface GithubPullRequestFacts {
    additions: number;
    changedFiles: number;
    checks: CloudAgentPullRequestReading['checks'];
    deletions: number;
    headSha: string;
    review: CloudAgentPullRequestReading['review'];
    settledAt: Date | null;
    state: CloudAgentPullRequestState;
    title: string;
}

const pullRequestSchema = z.object({
    additions: z.number().int().nonnegative(),
    changed_files: z.number().int().nonnegative(),
    closed_at: z.string().nullable(),
    deletions: z.number().int().nonnegative(),
    draft: z.boolean(),
    head: z.object({ sha: z.string().min(1) }),
    merged_at: z.string().nullable(),
    state: z.enum(['open', 'closed']),
    title: z.string().min(1),
});
const reviewsSchema = z.array(
    z.object({ state: z.string(), user: z.object({ id: z.number() }).nullable() })
);
const checkRunsSchema = z.object({
    check_runs: z.array(z.object({ conclusion: z.string().nullable(), status: z.string() })),
});
const commitStatusSchema = z.object({ statuses: z.array(z.object({ state: z.string() })) });

const failingConclusions = new Set([
    'action_required',
    'cancelled',
    'failure',
    'startup_failure',
    'timed_out',
]);

/**
 * Reads one pull request as an installation: the pull request, its reviews,
 * and the check runs and commit statuses on its head.
 */
export async function readGithubPullRequest(
    input: { number: number; repository: string; token: string },
    transport: GithubApiTransport
): Promise<GithubPullRequestFacts> {
    const credential = { kind: 'installation', token: input.token } as const;
    const get = async (path: string, query?: Record<string, number>) =>
        await githubRequest({ credential, path, query }, transport);
    const base = `/repos/${input.repository}`;
    const pull = readBody(pullRequestSchema, (await get(`${base}/pulls/${input.number}`)).body);
    const [reviews, checkRuns, status] = [
        await readReviews(credential, `${base}/pulls/${input.number}/reviews`, transport),
        readBody(
            checkRunsSchema,
            (await get(`${base}/commits/${pull.head.sha}/check-runs`, { per_page: 100 })).body
        ),
        readBody(commitStatusSchema, (await get(`${base}/commits/${pull.head.sha}/status`)).body),
    ];
    return {
        additions: pull.additions,
        changedFiles: pull.changed_files,
        checks: rollupChecks(checkRuns.check_runs, status.statuses),
        deletions: pull.deletions,
        headSha: pull.head.sha,
        review: rollupReview(reviews),
        settledAt: settledAt(pull),
        state: pullRequestState(pull),
        title: pull.title,
    };
}

/** Any failure wins, then anything unfinished, then a pass; nothing at all is `none`. */
export function rollupChecks(
    checkRuns: readonly { conclusion: string | null; status: string }[],
    statuses: readonly { state: string }[]
): GithubPullRequestFacts['checks'] {
    const failed =
        checkRuns.some((run) => failingConclusions.has(run.conclusion ?? '')) ||
        statuses.some((status) => status.state === 'failure' || status.state === 'error');
    if (failed) {
        return 'failing';
    }
    if (
        checkRuns.some((run) => run.status !== 'completed') ||
        statuses.some((status) => status.state === 'pending')
    ) {
        return 'pending';
    }
    return checkRuns.length + statuses.length > 0 ? 'passing' : 'none';
}

/**
 * Each reviewer's latest deciding review, oldest first as GitHub lists them.
 * A comment decides nothing, and a dismissal withdraws that reviewer's verdict.
 */
export function rollupReview(
    reviews: readonly { state: string; user: { id: number } | null }[]
): GithubPullRequestFacts['review'] {
    const latest = new Map<number, string>();
    for (const review of reviews) {
        if (review.user && review.state !== 'COMMENTED' && review.state !== 'PENDING') {
            latest.set(review.user.id, review.state);
        }
    }
    const verdicts = [...latest.values()];
    if (verdicts.includes('CHANGES_REQUESTED')) {
        return 'changes-requested';
    }
    return verdicts.includes('APPROVED') ? 'approved' : 'none';
}

async function readReviews(
    credential: { kind: 'installation'; token: string },
    path: string,
    transport: GithubApiTransport
): Promise<z.infer<typeof reviewsSchema>> {
    const reviews: z.infer<typeof reviewsSchema> = [];
    let next: string | null = path;
    while (next) {
        const page = await githubRequest(
            { credential, path: next, query: next === path ? { per_page: 100 } : undefined },
            transport
        );
        reviews.push(...readBody(reviewsSchema, page.body));
        next = githubNextPage(page.headers);
    }
    return reviews;
}

function pullRequestState(pull: z.infer<typeof pullRequestSchema>): CloudAgentPullRequestState {
    if (pull.merged_at) {
        return 'merged';
    }
    if (pull.state === 'closed') {
        return 'closed';
    }
    return pull.draft ? 'draft' : 'open';
}

function settledAt(pull: z.infer<typeof pullRequestSchema>): Date | null {
    const at = pull.merged_at ?? pull.closed_at;
    return at ? new Date(at) : null;
}

function readBody<T>(schema: z.ZodType<T>, body: unknown): T {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
        throw new GithubApiError('refused', null, 'GitHub sent an unreadable pull request.');
    }
    return parsed.data;
}
