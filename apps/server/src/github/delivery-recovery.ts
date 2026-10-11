import { type EffectRuntime, settle } from '@haus/effect';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { type BootSweep, type SweepTimers, startBootSweep } from '../boot-sweep.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { githubWebhookDeliveriesTable } from '../postgres/schema.ts';
import {
    advanceGithubDeliveryCursor,
    readGithubDeliveryCursor,
    recordGithubDeliveryGap,
} from './delivery-cursor.ts';
import type { GithubDelivery, GithubIngestOutcome } from './delivery-ingest.ts';
import {
    fetchGithubLoggedDelivery,
    type GithubDeliveryLogEntry as LogEntry,
    readGithubDeliveryLogEntry,
    unfinishedGithubDeliveries,
} from './delivery-log.ts';
import { githubNextPage, githubRequest } from './github-api.ts';
import type { GithubApp } from './github-app.ts';

// Recovery reads the App's own delivery log (GET /app/hook/deliveries) with the
// App JWT and ingests every delivery Haus has not finished, whatever GitHub's
// status says: `status=failure` covers only HTTP 400–599 and misses timeouts.
// Authenticity comes from the authenticated API, so no HMAC is checked here.
// (specs/github-triggers.md#recovery-and-the-development-pull)

const hourMs = 60 * 60 * 1000;
/** GitHub keeps delivery logs for three days; the last hour of that is not trusted. */
const retentionMs = 3 * 24 * hourMs;
/** Each sweep re-reads an hour before its watermark, so clock skew loses nothing. */
const overlapMs = hourMs;
/** A delivery whose fetch or ingest fails this many sweeps running is recorded and dropped. */
export const maxRecoveryAttempts = 5;

export interface GithubRecoveryDependencies {
    app: GithubApp;
    /** Failed attempts per guid across sweeps; process memory, like install state. */
    attempts?: Map<string, number>;
    clock: { now(): Date };
    db: HausDatabase;
    ingest(delivery: GithubDelivery): Promise<GithubIngestOutcome>;
    runtime: EffectRuntime<never>;
}

export interface GithubRecoverySweep {
    /** Deliveries that failed `maxRecoveryAttempts` sweeps and were recorded done. */
    abandoned: number;
    /** Attempts that threw; the watermark stays at or before each one. */
    failed: number;
    gap: { from: Date; to: Date } | null;
    /** Deliveries fetched and ingested because they were not done locally. */
    ingested: number;
    pages: number;
}

/**
 * One recovery sweep. Pages run newest first, and paging stops only after a
 * page whose every entry predates the cutoff: the log's order is GitHub's,
 * not a contract, so a straggler near a page edge is still read. Entries are
 * filtered by their own `delivered_at`, never by position.
 */
export async function sweepGithubDeliveries(
    dependencies: GithubRecoveryDependencies
): Promise<GithubRecoverySweep> {
    const { app, db } = dependencies;
    const startedAt = dependencies.clock.now();
    const appId = Number(app.config.appId);
    const { cutoff, gap } = await sweepStart(dependencies, appId, startedAt);
    const sweep: SweepState = {
        attempts: dependencies.attempts ?? new Map<string, number>(),
        counts: { abandoned: 0, failed: 0, in_progress: 0, ingested: 0 },
        oldestUnresolved: startedAt,
        seen: new Set<string>(),
    };
    let next: string | null = '/app/hook/deliveries';
    let pages = 0;
    while (next) {
        const response = await githubRequest(
            {
                credential: { jwt: await app.signer.jwt(), kind: 'app' },
                path: next,
                query: pages === 0 ? { per_page: 100 } : undefined,
            },
            app.transport
        );
        pages += 1;
        const entries = (Array.isArray(response.body) ? response.body : []).map(
            readGithubDeliveryLogEntry
        );
        const recent = entries.filter(
            (entry): entry is LogEntry => entry !== null && entry.deliveredAt >= cutoff
        );
        await recoverPage(dependencies, sweep, { appId, now: startedAt, recent });
        const exhausted = entries.length > 0 && recent.length === 0;
        next = exhausted ? null : githubNextPage(response.headers);
    }
    // The watermark never passes an unresolved entry, and an entry that keeps
    // failing is abandoned rather than holding the watermark until a false gap.
    await advanceGithubDeliveryCursor(db, {
        appId,
        sweptAt: startedAt,
        watermark: sweep.oldestUnresolved,
    });
    const { abandoned, failed, ingested } = sweep.counts;
    return { abandoned, failed, gap, ingested, pages };
}

type EntryResult = 'abandoned' | 'failed' | 'in_progress' | 'ingested';

interface SweepState {
    attempts: Map<string, number>;
    counts: Record<EntryResult, number>;
    /** The oldest kept entry still unresolved (failed, or another attempt holds it). */
    oldestUnresolved: Date;
    /** Redeliveries share a guid; each is ingested once per sweep. */
    seen: Set<string>;
}

/** Reads the cursor and, past GitHub's retention, records and logs the gap. */
async function sweepStart(
    dependencies: GithubRecoveryDependencies,
    appId: number,
    startedAt: Date
): Promise<{ cutoff: Date; gap: GithubRecoverySweep['gap'] }> {
    const cursor = await readGithubDeliveryCursor(dependencies.db, { appId, now: startedAt });
    const retentionEdge = new Date(startedAt.getTime() - (retentionMs - hourMs));
    if (cursor.watermark >= retentionEdge) {
        return { cutoff: new Date(cursor.watermark.getTime() - overlapMs), gap: null };
    }
    const gap = { from: cursor.watermark, to: retentionEdge };
    await recordGithubDeliveryGap(dependencies.db, { appId, ...gap });
    await settle(
        dependencies.runtime,
        Effect.logError('github.delivery_gap').pipe(
            Effect.annotateLogs({
                appId,
                gapFrom: gap.from.toISOString(),
                gapTo: gap.to.toISOString(),
                operation: 'github.delivery_gap',
            })
        )
    );
    return { cutoff: retentionEdge, gap };
}

/** Recovers every kept entry on one page that this Server has not finished. */
async function recoverPage(
    dependencies: GithubRecoveryDependencies,
    sweep: SweepState,
    input: { appId: number; now: Date; recent: LogEntry[] }
): Promise<void> {
    const pending = await unfinishedGithubDeliveries(
        dependencies.db,
        input.recent.map((entry) => entry.guid).filter((guid) => !sweep.seen.has(guid))
    );
    for (const entry of input.recent) {
        const fresh = !sweep.seen.has(entry.guid) && pending.has(entry.guid);
        sweep.seen.add(entry.guid);
        if (!fresh) {
            continue;
        }
        const result = await recoverEntry(
            { ...dependencies, attempts: sweep.attempts },
            { appId: input.appId, entry, now: input.now }
        );
        sweep.counts[result] += 1;
        const unresolved = result === 'failed' || result === 'in_progress';
        if (unresolved && entry.deliveredAt < sweep.oldestUnresolved) {
            sweep.oldestUnresolved = entry.deliveredAt;
        }
    }
}

/**
 * Fetches and ingests one log entry. `in_progress` is another attempt's fresh
 * claim: if its holder crashed the claim goes stale, so a later sweep must
 * still reach the entry. A fetch or ingest that throws `maxRecoveryAttempts`
 * sweeps running is abandoned.
 */
async function recoverEntry(
    dependencies: GithubRecoveryDependencies & { attempts: Map<string, number> },
    input: { appId: number; entry: LogEntry; now: Date }
): Promise<EntryResult> {
    const { attempts } = dependencies;
    const { entry } = input;
    try {
        const delivery = await fetchGithubLoggedDelivery(dependencies.app, entry);
        const outcome = await dependencies.ingest(delivery);
        attempts.delete(entry.guid);
        return outcome.kind === 'in_progress' ? 'in_progress' : 'ingested';
    } catch {
        const tries = (attempts.get(entry.guid) ?? 0) + 1;
        if (tries < maxRecoveryAttempts) {
            attempts.set(entry.guid, tries);
            return 'failed';
        }
        attempts.delete(entry.guid);
        await abandonDelivery(dependencies, input.appId, entry, input.now);
        return 'abandoned';
    }
}

/**
 * Runs recovery on boot and then every `intervalMs`: ten minutes in
 * production, ten seconds for the development pull.
 */
export function startGithubDeliveryRecovery(
    dependencies: GithubRecoveryDependencies,
    options: { intervalMs: number; timers?: SweepTimers }
): BootSweep {
    const attempts = dependencies.attempts ?? new Map<string, number>();
    return startBootSweep({
        intervalMs: options.intervalMs,
        name: 'GitHub delivery recovery sweep',
        run: () => sweepGithubDeliveries({ ...dependencies, attempts }),
        timers: options.timers,
    });
}

/**
 * Records a delivery that kept failing as done with `recovery_abandoned`, so
 * it stops holding the watermark, and logs it for the operator. A `done` row
 * is never touched.
 */
async function abandonDelivery(
    dependencies: GithubRecoveryDependencies,
    appId: number,
    entry: LogEntry,
    now: Date
): Promise<void> {
    await dependencies.db
        .insert(githubWebhookDeliveriesTable)
        .values({
            deliveryGuid: entry.guid,
            event: entry.event ?? 'unknown',
            ignoredReason: 'recovery_abandoned',
            receivedAt: now,
            source: 'recovery',
            state: 'done',
        })
        .onConflictDoUpdate({
            set: { ignoredReason: 'recovery_abandoned', state: 'done' },
            setWhere: eq(githubWebhookDeliveriesTable.state, 'processing'),
            target: githubWebhookDeliveriesTable.deliveryGuid,
        });
    await settle(
        dependencies.runtime,
        Effect.logError('github.delivery_abandoned').pipe(
            Effect.annotateLogs({
                appId,
                attempts: maxRecoveryAttempts,
                deliveredAt: entry.deliveredAt.toISOString(),
                deliveryId: entry.id,
                operation: 'github.delivery_abandoned',
            })
        )
    );
}
