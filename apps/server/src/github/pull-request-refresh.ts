import { and, asc, eq, isNotNull, lte, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { type BootSweep, type SweepTimers, startBootSweep } from '../boot-sweep.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    pullRequestReadingsTable,
    workerTurnsTable,
    githubInstallationsTable,
} from '../postgres/schema.ts';
import { publishRealtime } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { prepareWorkerEvents } from '../workers/worker-events.ts';
import { GithubApiError } from './github-api.ts';
import type { GithubApp } from './github-app.ts';
import { createInstallationTokens } from './installation-tokens.ts';
import { type GithubPullRequestFacts, readGithubPullRequest } from './pull-request-read.ts';
import { enqueuePullRequestWakes, pullRequestTransitions } from './pull-request-wake.ts';

/** A burst of check events settles into one read after this long. */
const coalesceMs = 5000;
const rowsPerPass = 25;

type ReadingRow = typeof pullRequestReadingsTable.$inferSelect;
type InstallationTokens = ReturnType<typeof createInstallationTokens>;

export interface PullRequestRefreshDependencies {
    app: GithubApp;
    db: HausDatabase;
    delivery: Pick<AgentDelivery, 'enqueue'>;
    wakeAgents(wakes: { agentId: string; serverId: string }[]): void;
}

/** Reads marked pull requests on a fixed interval, one at a time. */
export function startPullRequestRefresher(
    dependencies: PullRequestRefreshDependencies,
    options: { intervalMs: number; timers?: SweepTimers }
): BootSweep {
    const tokens = createInstallationTokens(dependencies.app);
    return startBootSweep({
        intervalMs: options.intervalMs,
        name: 'GitHub pull request refresher',
        run: (closing) => refreshPullRequestReadings(dependencies, { closing, tokens }),
        timers: options.timers,
    });
}

/**
 * One serial pass over marked readings: never a fan-out, since each read holds
 * no database connection but its write does. A retryable failure ends the pass
 * with the mark in place, so a rate limit waits for the next interval. Any
 * other failure clears the mark and keeps the last reading: nothing is guessed.
 */
export async function refreshPullRequestReadings(
    dependencies: PullRequestRefreshDependencies,
    options: { closing?: AbortSignal; now?: Date; tokens?: InstallationTokens } = {}
): Promise<void> {
    const { db } = dependencies;
    const now = options.now ?? new Date();
    const tokens = options.tokens ?? createInstallationTokens(dependencies.app);
    const rows = await db
        .select()
        .from(pullRequestReadingsTable)
        .where(
            and(
                isNotNull(pullRequestReadingsTable.refreshRequestedAt),
                lte(
                    pullRequestReadingsTable.refreshRequestedAt,
                    new Date(now.getTime() - coalesceMs)
                )
            )
        )
        .orderBy(asc(pullRequestReadingsTable.refreshRequestedAt))
        .limit(rowsPerPass);
    for (const row of rows) {
        if (options.closing?.aborted) {
            return;
        }
        const installationId = await findPullRequestInstallation(db, row);
        if (installationId === null) {
            await clearMark(db, row);
            continue;
        }
        try {
            const facts = await readGithubPullRequest(
                {
                    number: row.number,
                    repository: row.repository,
                    token: await tokens.read(installationId),
                },
                dependencies.app.transport
            );
            await writeReading(dependencies, row, facts, now);
        } catch (error) {
            if (!(error instanceof GithubApiError)) {
                throw error;
            }
            if (error.failure === 'retryable') {
                return;
            }
            tokens.forget(installationId);
            await clearMark(db, row);
        }
    }
}

export async function findPullRequestInstallation(
    db: Pick<HausDatabase, 'select'>,
    row: { repository: string; serverId: string }
): Promise<number | null> {
    const owner = row.repository.split('/')[0] ?? '';
    const [installation] = await db
        .select({ installationId: githubInstallationsTable.installationId })
        .from(githubInstallationsTable)
        .where(
            and(
                eq(githubInstallationsTable.serverId, row.serverId),
                eq(githubInstallationsTable.status, 'active'),
                eq(sql`lower(${githubInstallationsTable.accountLogin})`, owner)
            )
        )
        .limit(1);
    return installation?.installationId ?? null;
}

async function writeReading(
    dependencies: PullRequestRefreshDependencies,
    row: ReadingRow,
    facts: GithubPullRequestFacts,
    now: Date
): Promise<void> {
    const { events, wakes } = await dependencies.db.transaction(async (tx) => {
        await lockServerRow(tx, row.serverId);
        await tx
            .update(pullRequestReadingsTable)
            .set({ ...facts, observedAt: now, source: 'github' })
            .where(rowKey(row));
        await clearMark(tx, row);
        if (!readingChanged(row, facts)) {
            return { events: [], wakes: [] };
        }
        return {
            events: await prepareWorkerEvents(tx, {
                serverId: row.serverId,
                workerIds: await reportingWorkIds(tx, row),
            }),
            wakes: await enqueuePullRequestWakes(tx, dependencies.delivery, {
                reading: { ...row, headSha: facts.headSha },
                transitions: pullRequestTransitions(row, facts),
            }),
        };
    });
    for (const event of events) {
        publishRealtime(event);
    }
    if (wakes.length > 0) {
        dependencies.wakeAgents(wakes);
    }
}

/**
 * A mark that arrived during the read stays, so that change gets its own read.
 * Postgres keeps microseconds and the row read back as a JavaScript Date keeps
 * milliseconds, so the stored mark is compared at the precision that was read.
 */
async function clearMark(db: Pick<HausDatabase, 'update'>, row: ReadingRow): Promise<void> {
    await db
        .update(pullRequestReadingsTable)
        .set({ refreshRequestedAt: null })
        .where(
            and(
                rowKey(row),
                sql`date_trunc('milliseconds', ${pullRequestReadingsTable.refreshRequestedAt}) = ${row.refreshRequestedAt}`
            )
        );
}

function rowKey(row: ReadingRow) {
    return and(
        eq(pullRequestReadingsTable.serverId, row.serverId),
        eq(pullRequestReadingsTable.repository, row.repository),
        eq(pullRequestReadingsTable.number, row.number)
    );
}

function readingChanged(row: ReadingRow, facts: GithubPullRequestFacts): boolean {
    return (
        row.source !== 'github' ||
        row.additions !== facts.additions ||
        row.changedFiles !== facts.changedFiles ||
        row.checks !== facts.checks ||
        row.deletions !== facts.deletions ||
        row.headSha !== facts.headSha ||
        row.review !== facts.review ||
        row.settledAt?.getTime() !== facts.settledAt?.getTime() ||
        row.state !== facts.state ||
        row.title !== facts.title
    );
}

/** The work whose Runs reported this pull request, by the URL they recorded. */
export async function reportingWorkIds(
    db: Pick<HausDatabase, 'selectDistinct'>,
    row: ReadingRow
): Promise<string[]> {
    const runs = await db
        .selectDistinct({ workId: workerTurnsTable.workerId })
        .from(workerTurnsTable)
        .where(
            and(
                eq(workerTurnsTable.serverId, row.serverId),
                sql`exists (
                    select 1 from jsonb_array_elements(${workerTurnsTable.branches}) branch
                    where branch->>'pullRequestUrl' = ${row.url}
                )`
            )
        );
    return runs.map((run) => run.workId);
}
