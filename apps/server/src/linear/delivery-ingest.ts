import { and, eq, ne } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    linearIdentitiesTable,
    linearIdentitySecretsTable,
    linearWebhookDeliveriesTable,
    linearWorkspacesTable,
} from '../postgres/schema.ts';
import type { LinearIdentityReceiver, LinearWebhookReceivers } from './webhook-route.ts';

/** One delivery whose signature, freshness, and receiver binding have verified. */
export interface LinearVerifiedDelivery {
    /** `Linear-Delivery`: dedupes retries, scoped to the receiver. */
    deliveryId: string;
    /** `Linear-Event`, such as `Issue` or `AgentSessionEvent`. */
    event: string;
    payload: Record<string, unknown>;
    receivedAt: Date;
    /** `app` for the Haus app's URL, else the identity id from the URL. */
    receiver: string;
    webhookTimestamp: Date;
}

export type LinearIngestOutcome =
    | { kind: 'accepted'; queued: boolean; receiverKind: 'app' | 'identity' }
    | { kind: 'duplicate'; receiverKind: 'app' | 'identity' };

/**
 * Durable ingest (specs/linear-app.md#durable-ingest): in one transaction,
 * records the delivery with its raw verified body and advances the receiver's
 * last-delivery time, before the endpoint answers. No routing happens here; a
 * delivery for an organization bound nowhere is stored `ignored` with no body
 * and no Server, and the endpoint answers it exactly like a bound one.
 */
export async function ingestLinearDelivery(
    db: HausDatabase,
    delivery: LinearVerifiedDelivery
): Promise<LinearIngestOutcome> {
    const receiverKind = delivery.receiver === 'app' ? 'app' : 'identity';
    return await db.transaction(async (tx) => {
        const route = await resolveRoute(tx, delivery);
        const now = delivery.receivedAt;
        const inserted = await tx
            .insert(linearWebhookDeliveriesTable)
            .values({
                action: text(delivery.payload.action),
                body: route ? delivery.payload : null,
                deliveryId: delivery.deliveryId,
                event: delivery.event,
                id: createOpaqueId('lnd'),
                ignoredReason: route ? null : 'unknown_workspace',
                nextAttemptAt: now,
                organizationId: text(delivery.payload.organizationId),
                processedAt: route ? null : now,
                receivedAt: now,
                receiver: delivery.receiver,
                serverId: route?.serverId ?? null,
                state: route ? 'queued' : 'ignored',
                webhookTimestamp: delivery.webhookTimestamp,
                workspaceId: route?.workspaceId ?? null,
            })
            .onConflictDoNothing({
                target: [
                    linearWebhookDeliveriesTable.receiver,
                    linearWebhookDeliveriesTable.deliveryId,
                ],
            })
            .returning({ id: linearWebhookDeliveriesTable.id });
        await touchReceiver(tx, delivery, route, now);
        if (inserted.length === 0) {
            return { kind: 'duplicate', receiverKind } as const;
        }
        return { kind: 'accepted', queued: route !== null, receiverKind } as const;
    });
}

/**
 * The receivers the webhook route verifies against: the Haus app's env
 * secrets, and each live identity's stored secret plus its previous one for
 * 24 hours after a rotation.
 */
export function linearWebhookReceivers(
    db: HausDatabase,
    input: { appSecret: string | null; appSecretPrevious: string | null; clock: { now(): Date } }
): LinearWebhookReceivers {
    const appSecrets = input.appSecret
        ? [input.appSecret, ...(input.appSecretPrevious ? [input.appSecretPrevious] : [])]
        : null;
    return {
        appSecrets: () => appSecrets,
        identity: (identityId) => readIdentityReceiver(db, identityId, input.clock.now()),
    };
}

async function readIdentityReceiver(
    db: HausDatabase,
    identityId: string,
    now: Date
): Promise<LinearIdentityReceiver | null> {
    const [row] = await db
        .select({
            appUserId: linearIdentitiesTable.appUserId,
            oauthClientId: linearIdentitiesTable.oauthClientId,
            organizationId: linearIdentitiesTable.organizationId,
            previousExpiresAt: linearIdentitySecretsTable.previousExpiresAt,
            previousSecret: linearIdentitySecretsTable.previousWebhookSecret,
            secret: linearIdentitySecretsTable.webhookSecret,
        })
        .from(linearIdentitiesTable)
        .innerJoin(
            linearIdentitySecretsTable,
            eq(linearIdentitySecretsTable.identityId, linearIdentitiesTable.id)
        )
        .where(
            and(
                eq(linearIdentitiesTable.id, identityId),
                ne(linearIdentitiesTable.status, 'removed')
            )
        )
        .limit(1);
    if (!row) {
        return null;
    }
    const previousLive =
        row.previousSecret !== null &&
        row.previousExpiresAt !== null &&
        row.previousExpiresAt.getTime() > now.getTime();
    return {
        appUserId: row.appUserId,
        identityId,
        oauthClientId: row.oauthClientId,
        organizationId: row.organizationId,
        secrets: [row.secret, ...(previousLive && row.previousSecret ? [row.previousSecret] : [])],
    };
}

/**
 * The Haus app routes by the payload's organization to its one live binding;
 * an identity URL routes to the identity's own workspace (the route already
 * bound the payload's organization to it).
 */
async function resolveRoute(
    tx: HausDatabase,
    delivery: LinearVerifiedDelivery
): Promise<{ serverId: string; workspaceId: string } | null> {
    if (delivery.receiver !== 'app') {
        const [identity] = await tx
            .select({
                serverId: linearIdentitiesTable.serverId,
                workspaceId: linearIdentitiesTable.workspaceId,
            })
            .from(linearIdentitiesTable)
            .where(
                and(
                    eq(linearIdentitiesTable.id, delivery.receiver),
                    ne(linearIdentitiesTable.status, 'removed')
                )
            )
            .limit(1);
        return identity ?? null;
    }
    const organizationId = text(delivery.payload.organizationId);
    if (!organizationId) {
        return null;
    }
    const [workspace] = await tx
        .select({ serverId: linearWorkspacesTable.serverId, workspaceId: linearWorkspacesTable.id })
        .from(linearWorkspacesTable)
        .where(
            and(
                eq(linearWorkspacesTable.organizationId, organizationId),
                ne(linearWorkspacesTable.status, 'removed')
            )
        )
        .limit(1);
    return workspace ?? null;
}

/** "Last delivery received" on the Linear page: the only sign a webhook still works. */
async function touchReceiver(
    tx: HausDatabase,
    delivery: LinearVerifiedDelivery,
    route: { workspaceId: string } | null,
    now: Date
): Promise<void> {
    if (!route) {
        return;
    }
    if (delivery.receiver === 'app') {
        await tx
            .update(linearWorkspacesTable)
            .set({ lastDeliveryAt: now })
            .where(eq(linearWorkspacesTable.id, route.workspaceId));
        return;
    }
    await tx
        .update(linearIdentitiesTable)
        .set({ lastDeliveryAt: now })
        .where(eq(linearIdentitiesTable.id, delivery.receiver));
}

function text(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}
