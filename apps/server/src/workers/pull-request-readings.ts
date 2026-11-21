import {
    type WorkerBranch,
    type WorkerOutcome,
    workerPullRequestsRetained,
    type PullRequestReading,
    pullRequestReadingSchema,
    parseGithubPullRequestUrl,
} from '@haus/api';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import {
    count,
    field,
    type Payload,
    pullNumbers,
    text,
} from '../github/event-projection/payload.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { pullRequestReadingsTable } from '../postgres/schema.ts';

export interface PullRequestKey {
    number: number;
    repository: string;
}

type ReadingRow = typeof pullRequestReadingsTable.$inferSelect;
type Reader = Pick<HausDatabase, 'select'>;
type Writer = Pick<HausDatabase, 'insert' | 'update'>;

export function pullRequestKey(key: PullRequestKey): string {
    return `${key.repository}#${key.number}`;
}

/**
 * Every pull request the turns named, in their reports or their branches, once each and newest
 * first; `turns` is newest first.
 */
export function reportedPullRequests(
    turns: readonly { branches: WorkerBranch[]; outcome: WorkerOutcome | null }[]
): PullRequestKey[] {
    const keys = new Map<string, PullRequestKey>();
    for (const turn of turns) {
        const reported = turn.outcome?.kind === 'report' ? turn.outcome.report.pullRequestUrls : [];
        const branched = turn.branches.flatMap(({ pullRequestUrl }) =>
            pullRequestUrl ? [pullRequestUrl] : []
        );
        for (const url of [...reported, ...branched]) {
            const key = parseGithubPullRequestUrl(url);
            if (key && !keys.has(pullRequestKey(key))) {
                keys.set(pullRequestKey(key), key);
            }
        }
    }
    return [...keys.values()].slice(0, workerPullRequestsRetained);
}

export async function readPullRequestReadings(
    db: Reader,
    serverId: string,
    keys: readonly (PullRequestKey | null)[]
): Promise<Map<string, PullRequestReading>> {
    const wanted = keys.filter((key) => key !== null);
    if (wanted.length === 0) {
        return new Map();
    }
    const rows = await db
        .select()
        .from(pullRequestReadingsTable)
        .where(
            and(
                eq(pullRequestReadingsTable.serverId, serverId),
                inArray(
                    pullRequestReadingsTable.repository,
                    wanted.map((key) => key.repository)
                ),
                inArray(
                    pullRequestReadingsTable.number,
                    wanted.map((key) => key.number)
                )
            )
        );
    return new Map(rows.map((row) => [pullRequestKey(row), toPullRequestReading(row)]));
}

export function toPullRequestReading(row: ReadingRow): PullRequestReading {
    return pullRequestReadingSchema.parse({
        additions: row.additions,
        changedFiles: row.changedFiles,
        checks: row.checks,
        deletions: row.deletions,
        headSha: row.headSha,
        number: row.number,
        observedAt: row.observedAt.toISOString(),
        repository: row.repository,
        review: row.review,
        settledAt: row.settledAt?.toISOString() ?? null,
        source: row.source,
        state: row.state,
        title: row.title,
        url: row.url,
    });
}

/**
 * Records each snapshot a Run reported, and asks for one GitHub read. A newer
 * snapshot replaces an older Computer reading; a `github` reading is left
 * alone, since webhooks keep it current and a snapshot knows less.
 */
export async function seedPullRequestReadings(
    db: Writer,
    input: { branches: readonly WorkerBranch[]; now: Date; serverId: string }
): Promise<void> {
    for (const { pullRequest, pullRequestUrl } of input.branches) {
        const key = pullRequestUrl ? parseGithubPullRequestUrl(pullRequestUrl) : null;
        if (!(key && pullRequest && pullRequestUrl)) {
            continue;
        }
        const snapshot = {
            additions: pullRequest.additions,
            changedFiles: pullRequest.changedFiles,
            deletions: pullRequest.deletions,
            observedAt: new Date(pullRequest.observedAt),
            refreshRequestedAt: input.now,
            state: pullRequest.state,
            url: pullRequestUrl,
        };
        await db
            .insert(pullRequestReadingsTable)
            .values({ ...key, ...snapshot, serverId: input.serverId, source: 'computer' })
            .onConflictDoUpdate({
                set: snapshot,
                setWhere: sql`${pullRequestReadingsTable.source} = 'computer'
                    and ${pullRequestReadingsTable.observedAt} < excluded.observed_at`,
                target: [
                    pullRequestReadingsTable.serverId,
                    pullRequestReadingsTable.repository,
                    pullRequestReadingsTable.number,
                ],
            });
    }
}

/**
 * Marks the readings a webhook delivery touched as stale. The delivery only
 * says that something changed: `check_suite` payloads cannot state a rollup
 * and events arrive out of order, so one later read decides. Unknown pull
 * requests match nothing.
 */
export async function markPullRequestReadings(
    db: Writer,
    input: { event: string; now: Date; payload: Payload; serverId: string }
): Promise<void> {
    const repository = text(field(input.payload, 'repository'), 'full_name')?.toLowerCase();
    const target = deliveryTarget(input.event, input.payload);
    if (!(repository && target)) {
        return;
    }
    const table = pullRequestReadingsTable;
    const matches = or(
        target.numbers.length > 0 ? inArray(table.number, target.numbers) : undefined,
        target.headSha ? eq(table.headSha, target.headSha) : undefined
    );
    if (!matches) {
        return;
    }
    await db
        .update(table)
        .set({ refreshRequestedAt: sql`coalesce(${table.refreshRequestedAt}, ${input.now})` })
        .where(and(eq(table.serverId, input.serverId), eq(table.repository, repository), matches));
}

function deliveryTarget(
    event: string,
    payload: Payload
): { headSha: string | null; numbers: number[] } | null {
    if (event === 'pull_request' || event === 'pull_request_review') {
        const number = count(field(payload, 'pull_request'), 'number');
        return number === null ? null : { headSha: null, numbers: [number] };
    }
    if (event === 'check_suite' || event === 'check_run') {
        const check = field(payload, event);
        return { headSha: text(check, 'head_sha'), numbers: pullNumbers(check) };
    }
    return null;
}
