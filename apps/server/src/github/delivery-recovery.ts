import { type EffectRuntime, settle } from '@haus/effect';
import { and, eq, inArray } from 'drizzle-orm';
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
import { field, type Payload, text } from './event-projection/payload.ts';
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

export interface GithubRecoveryDependencies {
    app: GithubApp;
    clock: { now(): Date };
    db: HausDatabase;
    ingest(delivery: GithubDelivery): Promise<GithubIngestOutcome>;
    runtime: EffectRuntime<never>;
}

export interface GithubRecoverySweep {
    /** Ingest attempts that threw; any failure keeps the watermark in place. */
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
    const cursor = await readGithubDeliveryCursor(db, { appId, now: startedAt });
    const retentionEdge = new Date(startedAt.getTime() - (retentionMs - hourMs));
    let gap: GithubRecoverySweep['gap'] = null;
    let cutoff = new Date(cursor.watermark.getTime() - overlapMs);
    if (cursor.watermark < retentionEdge) {
        gap = { from: cursor.watermark, to: retentionEdge };
        cutoff = retentionEdge;
        await recordGithubDeliveryGap(db, { appId, ...gap });
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
    }

    const seen = new Set<string>();
    let next: string | null = '/app/hook/deliveries';
    let pages = 0;
    let ingested = 0;
    let failed = 0;
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
        const entries = (Array.isArray(response.body) ? response.body : []).map(readEntry);
        const recent = entries.filter(
            (entry): entry is LogEntry => entry !== null && entry.deliveredAt >= cutoff
        );
        const pending = await notDone(
            db,
            recent.map((entry) => entry.guid).filter((guid) => !seen.has(guid))
        );
        for (const entry of recent) {
            if (seen.has(entry.guid) || !pending.has(entry.guid)) {
                seen.add(entry.guid);
                continue;
            }
            seen.add(entry.guid);
            try {
                await dependencies.ingest(await fetchDelivery(app, entry));
                ingested += 1;
            } catch {
                failed += 1;
            }
        }
        const exhausted = entries.length > 0 && recent.length === 0;
        next = exhausted ? null : githubNextPage(response.headers);
    }
    if (failed === 0) {
        await advanceGithubDeliveryCursor(db, { appId, sweptAt: startedAt, watermark: startedAt });
    }
    return { failed, gap, ingested, pages };
}

/**
 * Runs recovery on boot and then every `intervalMs`: ten minutes in
 * production, ten seconds for the development pull.
 */
export function startGithubDeliveryRecovery(
    dependencies: GithubRecoveryDependencies,
    options: { intervalMs: number; timers?: SweepTimers }
): BootSweep {
    return startBootSweep({
        intervalMs: options.intervalMs,
        name: 'GitHub delivery recovery sweep',
        run: () => sweepGithubDeliveries(dependencies),
        timers: options.timers,
    });
}

interface LogEntry {
    deliveredAt: Date;
    guid: string;
    id: number;
}

function readEntry(entry: Payload): LogEntry | null {
    const id = field(entry, 'id');
    const guid = text(entry, 'guid');
    const deliveredAt = new Date(text(entry, 'delivered_at') ?? Number.NaN);
    if (
        typeof id !== 'number' ||
        !guid ||
        guid.length > 64 ||
        Number.isNaN(deliveredAt.getTime())
    ) {
        return null;
    }
    return { deliveredAt, guid, id };
}

async function fetchDelivery(app: GithubApp, entry: LogEntry): Promise<GithubDelivery> {
    const response = await githubRequest(
        {
            credential: { jwt: await app.signer.jwt(), kind: 'app' },
            path: `/app/hook/deliveries/${entry.id}`,
        },
        app.transport
    );
    const event = text(response.body, 'event');
    const payload = field(field(response.body, 'request'), 'payload');
    if (!event || payload === null || typeof payload !== 'object') {
        throw new Error(`GitHub delivery ${entry.id} carried no event or payload.`);
    }
    return { event, guid: entry.guid, payload, source: 'recovery' };
}

/** The guids among `guids` that this Server has not finished ingesting. */
async function notDone(db: HausDatabase, guids: string[]): Promise<Set<string>> {
    if (guids.length === 0) {
        return new Set();
    }
    const done = await db
        .select({ guid: githubWebhookDeliveriesTable.deliveryGuid })
        .from(githubWebhookDeliveriesTable)
        .where(
            and(
                inArray(githubWebhookDeliveriesTable.deliveryGuid, guids),
                eq(githubWebhookDeliveriesTable.state, 'done')
            )
        );
    const finished = new Set(done.map((row) => row.guid));
    return new Set(guids.filter((guid) => !finished.has(guid)));
}
