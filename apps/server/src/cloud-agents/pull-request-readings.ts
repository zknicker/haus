import {
    type CloudAgentBranch,
    type CloudAgentPullRequestReading,
    cloudAgentPullRequestReadingSchema,
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
import { cloudAgentPullRequestsTable } from '../postgres/schema.ts';

export interface PullRequestKey {
    number: number;
    repository: string;
}

type ReadingRow = typeof cloudAgentPullRequestsTable.$inferSelect;
type Reader = Pick<HausDatabase, 'select'>;
type Writer = Pick<HausDatabase, 'insert' | 'update'>;

export function pullRequestKey(key: PullRequestKey): string {
    return `${key.repository}#${key.number}`;
}

/** The pull request the newest reporting Run named; `runs` is newest first. */
export function reportedPullRequest(
    runs: readonly { branches: CloudAgentBranch[] }[]
): PullRequestKey | null {
    for (const run of runs) {
        for (const { pullRequestUrl } of run.branches) {
            const key = pullRequestUrl ? parseGithubPullRequestUrl(pullRequestUrl) : null;
            if (key) {
                return key;
            }
        }
    }
    return null;
}

export async function readPullRequestReadings(
    db: Reader,
    serverId: string,
    keys: readonly (PullRequestKey | null)[]
): Promise<Map<string, CloudAgentPullRequestReading>> {
    const wanted = keys.filter((key) => key !== null);
    if (wanted.length === 0) {
        return new Map();
    }
    const rows = await db
        .select()
        .from(cloudAgentPullRequestsTable)
        .where(
            and(
                eq(cloudAgentPullRequestsTable.serverId, serverId),
                inArray(
                    cloudAgentPullRequestsTable.repository,
                    wanted.map((key) => key.repository)
                ),
                inArray(
                    cloudAgentPullRequestsTable.number,
                    wanted.map((key) => key.number)
                )
            )
        );
    return new Map(rows.map((row) => [pullRequestKey(row), toPullRequestReading(row)]));
}

export function toPullRequestReading(row: ReadingRow): CloudAgentPullRequestReading {
    return cloudAgentPullRequestReadingSchema.parse({
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
    input: { branches: readonly CloudAgentBranch[]; now: Date; serverId: string }
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
            .insert(cloudAgentPullRequestsTable)
            .values({ ...key, ...snapshot, serverId: input.serverId, source: 'computer' })
            .onConflictDoUpdate({
                set: snapshot,
                setWhere: sql`${cloudAgentPullRequestsTable.source} = 'computer'
                    and ${cloudAgentPullRequestsTable.observedAt} < excluded.observed_at`,
                target: [
                    cloudAgentPullRequestsTable.serverId,
                    cloudAgentPullRequestsTable.repository,
                    cloudAgentPullRequestsTable.number,
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
    const table = cloudAgentPullRequestsTable;
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
