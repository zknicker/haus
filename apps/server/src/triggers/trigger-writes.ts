import type { Trigger, TriggerStatus, WebhookTrigger } from '@haus/api';
import { and, eq, isNull } from 'drizzle-orm';
import { retireQueuedItemsByDedupeKeys } from '../agent-delivery/store.ts';
import { syncArmedGithubTrigger } from '../github/trigger-problem-sync.ts';
import type { GithubTriggerProblemEntered } from '../github/trigger-problems.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { triggerFiresTable, triggersTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import {
    hashTriggerSecret,
    mintTriggerSecret,
    requireWebhookTrigger,
    type TriggerClock,
    TriggerNotFoundError,
} from './trigger-model.ts';
import { readTrigger } from './trigger-queries.ts';

/**
 * The row-level trigger mutations, shared by the Agent path and the operator
 * path. Neither authorization model lives here: each caller passes the check it
 * owns, and this module owns the transaction, the server lock, the secret, the
 * version bump, and the wire view.
 */

type Transaction = HausDatabase;

/** Runs inside the transaction, behind the server lock. Throws to refuse. */
export type TriggerAuthorization = (tx: Transaction) => Promise<unknown>;

export interface TriggerAnchor {
    chatId: string;
    /** A durable event the anchor resolution wrote, to emit once the trigger commits. */
    event?: PreparedRealtimeEvent;
    /** The asking message, or null when the anchor is the Chat itself. */
    messageId: string | null;
}

export interface CreateTriggerRowInput {
    /** The human who created it, or null when the owning Agent created it itself. */
    createdByUserId: string | null;
    instruction: string | null;
    /** Only webhooks are created here; `github-trigger-writes.ts` creates `github` Triggers. */
    kind: 'webhook';
    origin: string;
    ownerAgentId: string;
    serverId: string;
    title: string;
}

/**
 * Creates one armed trigger and mints its bearer secret. `resolveAnchor` runs
 * inside the transaction: it authorizes the caller and answers where fires
 * land — the asking message for an Agent, the bare DM Chat for a human, which
 * writes nothing to the transcript. It is handed the trigger's id.
 */
export async function createTriggerRow(
    db: HausDatabase,
    input: CreateTriggerRowInput,
    resolveAnchor: (tx: Transaction, triggerId: string) => Promise<TriggerAnchor>,
    clock: TriggerClock
): Promise<{
    event: PreparedRealtimeEvent | null;
    secret: string;
    trigger: WebhookTrigger;
}> {
    const now = clock.now();
    const secret = mintTriggerSecret();
    const triggerId = createOpaqueId('trg');
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const anchor = await resolveAnchor(tx, triggerId);
        await tx.insert(triggersTable).values({
            anchorChatId: anchor.chatId,
            anchorMessageId: anchor.messageId,
            createdAt: now,
            createdByUserId: input.createdByUserId,
            id: triggerId,
            instruction: input.instruction,
            kind: input.kind,
            ownerAgentId: input.ownerAgentId,
            secretHash: hashTriggerSecret(secret),
            serverId: input.serverId,
            status: 'armed',
            title: input.title.trim(),
            updatedAt: now,
        });
        return {
            event: anchor.event ?? null,
            secret,
            trigger: requireWebhookTrigger(
                await readTrigger(tx, {
                    origin: input.origin,
                    serverId: input.serverId,
                    triggerId,
                })
            ),
        };
    });
}

/**
 * Arms or disables one trigger. Setting the status it already has changes
 * nothing, so a kill switch pressed twice does not churn the version. Arming
 * a `github` Trigger re-derives its problem, because problems only follow
 * armed Triggers; `entered` names any notice the caller should wake for.
 */
export async function setTriggerStatusRow(
    db: HausDatabase,
    input: { origin: string; serverId: string; status: TriggerStatus; triggerId: string },
    authorize: TriggerAuthorization,
    clock: TriggerClock
): Promise<{ entered: GithubTriggerProblemEntered[]; trigger: Trigger }> {
    let entered: GithubTriggerProblemEntered[] = [];
    const trigger = await writeTrigger(
        db,
        input,
        authorize,
        (current, now) =>
            current.status === input.status
                ? null
                : {
                      disabledAt: input.status === 'disabled' ? now : null,
                      status: input.status,
                  },
        clock,
        async (tx, current, now) => {
            if (current.kind === 'github' && input.status === 'armed') {
                entered = await syncArmedGithubTrigger(tx, {
                    now,
                    serverId: input.serverId,
                    triggerId: input.triggerId,
                });
            }
        }
    );
    return { entered, trigger };
}

/** Edits the human-authored fields. `instruction: null` clears the instruction. */
export async function updateTriggerRow(
    db: HausDatabase,
    input: {
        instruction?: string | null;
        origin: string;
        serverId: string;
        title?: string;
        triggerId: string;
    },
    authorize: TriggerAuthorization,
    clock: TriggerClock
): Promise<Trigger> {
    return await writeTrigger(
        db,
        input,
        authorize,
        () => ({
            ...(input.title === undefined ? {} : { title: input.title.trim() }),
            ...(input.instruction === undefined
                ? {}
                : { instruction: input.instruction?.trim() || null }),
        }),
        clock
    );
}

/** Replaces the bearer secret. The previous secret stops working immediately. */
export async function rotateTriggerSecretRow(
    db: HausDatabase,
    input: { origin: string; serverId: string; triggerId: string },
    authorize: TriggerAuthorization,
    clock: TriggerClock
): Promise<{ secret: string; trigger: WebhookTrigger }> {
    const secret = mintTriggerSecret();
    const trigger = await writeTrigger(
        db,
        input,
        authorize,
        (current) => {
            requireWebhookTrigger(current);
            return { secretHash: hashTriggerSecret(secret) };
        },
        clock
    );
    return { secret, trigger: requireWebhookTrigger(trigger) };
}

/**
 * Tombstones one trigger and retires the owner's queued fires with it. The
 * fire rows remain history until the retention sweep removes the tombstone;
 * a fire envelope lives only in the delivery queue, so a queued fire for a
 * removed trigger must not wake its Agent forever.
 */
export async function deleteTriggerRow(
    db: HausDatabase,
    input: { serverId: string; triggerId: string },
    authorize: TriggerAuthorization,
    clock: TriggerClock
): Promise<void> {
    const now = clock.now();
    await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await authorize(tx);
        const [current] = await tx
            .select()
            .from(triggersTable)
            .where(
                and(
                    eq(triggersTable.serverId, input.serverId),
                    eq(triggersTable.id, input.triggerId),
                    isNull(triggersTable.deletedAt)
                )
            )
            .for('update');
        if (!current) {
            throw new TriggerNotFoundError();
        }
        const fires = await tx
            .select({ id: triggerFiresTable.id })
            .from(triggerFiresTable)
            .where(
                and(
                    eq(triggerFiresTable.serverId, input.serverId),
                    eq(triggerFiresTable.triggerId, input.triggerId)
                )
            );
        await retireQueuedItemsByDedupeKeys(tx, {
            dedupeKeys: fires.map((fire) => fire.id),
            serverId: input.serverId,
        });
        const deleted = await tx
            .update(triggersTable)
            .set({
                deletedAt: now,
                disabledAt: current.disabledAt ?? now,
                status: 'disabled',
                updatedAt: now,
                version: current.version + 1,
            })
            .where(
                and(
                    eq(triggersTable.serverId, input.serverId),
                    eq(triggersTable.id, input.triggerId),
                    isNull(triggersTable.deletedAt)
                )
            )
            .returning({ id: triggersTable.id });
        if (deleted.length === 0) {
            throw new TriggerNotFoundError();
        }
    });
}

/**
 * One authorized edit of one trigger row. `patch` sees the current trigger and
 * answers the columns to write, or null when the request is already satisfied.
 * Every write here stamps `updated_at` and bumps `version`.
 */
async function writeTrigger(
    db: HausDatabase,
    input: { origin: string; serverId: string; triggerId: string },
    authorize: TriggerAuthorization,
    patch: (current: Trigger, now: Date) => Partial<typeof triggersTable.$inferInsert> | null,
    clock: TriggerClock,
    afterWrite?: (tx: Transaction, current: Trigger, now: Date) => Promise<void>
): Promise<Trigger> {
    const now = clock.now();
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await authorize(tx);
        const current = await readTrigger(tx, input);
        const columns = patch(current, now);
        if (!columns) {
            return current;
        }
        await tx
            .update(triggersTable)
            .set({ ...columns, updatedAt: now, version: current.version + 1 })
            .where(
                and(
                    eq(triggersTable.serverId, input.serverId),
                    eq(triggersTable.id, input.triggerId)
                )
            );
        await afterWrite?.(tx, current, now);
        return await readTrigger(tx, input);
    });
}
