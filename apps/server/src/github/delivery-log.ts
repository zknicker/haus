import { and, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { githubWebhookDeliveriesTable } from '../postgres/schema.ts';
import type { GithubDelivery } from './delivery-ingest.ts';
import { field, type Payload, text } from './event-projection/payload.ts';
import { type GithubJsonReviver, githubRequest } from './github-api.ts';
import type { GithubApp } from './github-app.ts';

// The App's own delivery log as recovery reads it (GET /app/hook/deliveries
// and /app/hook/deliveries/{id}), and which of its guids Haus has finished.

/** One entry of the App's delivery log; redeliveries share a guid. */
export interface GithubDeliveryLogEntry {
    deliveredAt: Date;
    event: string | null;
    guid: string;
    /** Decimal digits exactly as GitHub sent them; real ids exceed 2^53. */
    id: string;
}

/**
 * Parses log `id`s from their source text: GitHub sends them as bare integers
 * past 2^53, which a plain `JSON.parse` rounds into another delivery's id.
 */
export const githubDeliveryLogReviver: GithubJsonReviver = (key, value, context) =>
    key === 'id' && typeof value === 'number' && context?.source ? context.source : value;

export function readGithubDeliveryLogEntry(entry: Payload): GithubDeliveryLogEntry | null {
    const id = field(entry, 'id');
    const guid = text(entry, 'guid');
    const deliveredAt = new Date(text(entry, 'delivered_at') ?? Number.NaN);
    if (
        typeof id !== 'string' ||
        !/^\d+$/u.test(id) ||
        !guid ||
        guid.length > 64 ||
        Number.isNaN(deliveredAt.getTime())
    ) {
        return null;
    }
    return { deliveredAt, event: text(entry, 'event'), guid, id };
}

/** The logged delivery's event and payload, ready for ingest as `recovery`. */
export async function fetchGithubLoggedDelivery(
    app: GithubApp,
    entry: GithubDeliveryLogEntry
): Promise<GithubDelivery> {
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
export async function unfinishedGithubDeliveries(
    db: HausDatabase,
    guids: string[]
): Promise<Set<string>> {
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
