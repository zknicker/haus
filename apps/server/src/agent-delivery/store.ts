import type { AddressedReason, AgentReasoningEffort } from '@haus/api';
import { and, eq, inArray, isNotNull, isNull, lt, lte, ne, notInArray, or, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    agentDeliveryTable,
    agentInboxTable,
    agentsTable,
    chatMessagesTable,
    messageTasksTable,
} from '../postgres/schema.ts';
import { bodilessInboxSources, concreteInboxSources } from './inbox-lanes.ts';
import { retireRemovedTriggerItemsForRun } from './retire-removed-trigger-items.ts';

export interface AgentDeliveryRow {
    acceptedAt: Date | null;
    activeRunChatId: string | null;
    activeRunComputerId: string | null;
    activeRunId: string | null;
    activeRunModelId: string | null;
    activeRunReasoningEffort: AgentReasoningEffort | null;
    activeRunRuntimeId: string | null;
    agentChainTurns: number;
    agentId: string;
    consecutiveFailures: number;
    retryAfter: Date | null;
    serverId: string;
    stopped: boolean;
}

export interface InboxItemRow {
    /** Why this item names the Agent personally; null is an ambient delivery. */
    addressedReason: AddressedReason | null;
    chatId: string;
    content: string;
    createdAt: Date;
    dedupeKey: string;
    id: string;
    mentioned: boolean;
    noticeRunId: string | null;
    serverId: string;
    source: string;
    threadFollowReactivated: boolean;
}

/** The digest is a hint, not an index: a long tail of chats stays bounded. */
const maxUnreadElsewhereChats = 50;

/** The one projection every queue read returns, so a new column lands once. */
const inboxItemColumns = {
    addressedReason: agentInboxTable.addressedReason,
    chatId: agentInboxTable.chatId,
    content: agentInboxTable.content,
    createdAt: agentInboxTable.createdAt,
    dedupeKey: agentInboxTable.dedupeKey,
    id: agentInboxTable.id,
    mentioned: agentInboxTable.mentioned,
    noticeRunId: agentInboxTable.noticeRunId,
    serverId: agentInboxTable.serverId,
    source: agentInboxTable.source,
    threadFollowReactivated: agentInboxTable.threadFollowReactivated,
} as const;

export async function readAgentServerId(db: HausDatabase, agentId: string): Promise<string | null> {
    const [row] = await db
        .select({ serverId: agentsTable.serverId })
        .from(agentsTable)
        .where(eq(agentsTable.id, agentId))
        .limit(1);
    return row?.serverId ?? null;
}

export async function readDeliveryState(
    db: HausDatabase,
    agentId: string
): Promise<AgentDeliveryRow | null> {
    const [row] = await db
        .select()
        .from(agentDeliveryTable)
        .where(eq(agentDeliveryTable.agentId, agentId))
        .limit(1);
    return row ?? null;
}

/** Creates the Agent's delivery row if it has none. Idempotent. */
export async function ensureDeliveryState(
    db: HausDatabase,
    input: { agentId: string; serverId: string }
): Promise<void> {
    await db
        .insert(agentDeliveryTable)
        .values({ agentId: input.agentId, serverId: input.serverId })
        .onConflictDoNothing({ target: agentDeliveryTable.agentId });
}

export async function setStopped(
    db: HausDatabase,
    input: { agentId: string; serverId: string; stopped: boolean }
): Promise<void> {
    await ensureDeliveryState(db, input);
    await db
        .update(agentDeliveryTable)
        .set({ stopped: input.stopped, updatedAt: new Date() })
        .where(eq(agentDeliveryTable.agentId, input.agentId));
}

/**
 * Records one inbox item, ignoring a duplicate delivery of the same
 * message: the `(server, agent, dedupeKey)` uniqueness makes a re-emitted wake
 * a no-op instead of a second inbox row.
 */
export async function enqueueInboxItem(
    db: HausDatabase,
    input: {
        addressedReason?: AddressedReason | null;
        agentId: string;
        chatId: string;
        content: string;
        createdAt?: Date;
        dedupeKey: string;
        mentioned?: boolean;
        serverId: string;
        source: string;
        threadFollowReactivated?: boolean;
    }
): Promise<void> {
    await db
        .insert(agentInboxTable)
        .values({
            addressedReason: input.addressedReason ?? null,
            agentId: input.agentId,
            chatId: input.chatId,
            content: input.content,
            ...(input.createdAt ? { createdAt: input.createdAt } : {}),
            dedupeKey: input.dedupeKey,
            id: createOpaqueId('inb'),
            mentioned: input.mentioned ?? false,
            serverId: input.serverId,
            source: input.source,
            threadFollowReactivated: input.threadFollowReactivated ?? false,
        })
        .onConflictDoNothing();
}

export async function countQueuedInboxItems(db: HausDatabase, agentId: string): Promise<number> {
    const [row] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(agentInboxTable)
        .where(queuedFor(agentId));
    return row?.total ?? 0;
}

export async function countQueuedMessageItems(db: HausDatabase, agentId: string): Promise<number> {
    const [row] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(agentInboxTable)
        .where(
            and(queuedFor(agentId), notInArray(agentInboxTable.source, [...bodilessInboxSources]))
        );
    return row?.total ?? 0;
}

/** Counts work represented by a notice; concrete onboarding work is not notice-only. */
export async function countQueuedNoticeItems(db: HausDatabase, agentId: string): Promise<number> {
    const [row] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(agentInboxTable)
        .where(and(queuedFor(agentId), ne(agentInboxTable.source, 'onboarding')));
    return row?.total ?? 0;
}

/** Per-chat queued counts behind the unread-elsewhere digest. */
export async function countQueuedItemsByChat(
    db: HausDatabase,
    input: { agentId: string; excludeChatIds: string[]; excludeItemIds: string[] }
): Promise<Array<{ chatId: string; count: number }>> {
    const rows = await db
        .select({ chatId: agentInboxTable.chatId, total: sql<number>`count(*)::int` })
        .from(agentInboxTable)
        .where(
            and(
                queuedFor(input.agentId),
                ne(agentInboxTable.source, 'onboarding'),
                input.excludeChatIds.length > 0
                    ? notInArray(agentInboxTable.chatId, input.excludeChatIds)
                    : undefined,
                input.excludeItemIds.length > 0
                    ? notInArray(agentInboxTable.id, input.excludeItemIds)
                    : undefined
            )
        )
        .groupBy(agentInboxTable.chatId)
        .orderBy(agentInboxTable.chatId)
        .limit(maxUnreadElsewhereChats);
    return rows.map((row) => ({ chatId: row.chatId, count: row.total }));
}

/**
 * Associates an explicit in-turn pull with the accepted run that received it.
 * Settlement can then advance `seen` for the pulled rows, while an unsettled
 * run keeps them durable and replayable under the same run id.
 */
export async function attachQueuedItemsToRun(
    db: HausDatabase,
    input: { agentId: string; itemIds: string[]; runId: string }
): Promise<void> {
    if (input.itemIds.length === 0) {
        return;
    }
    await db
        .update(agentInboxTable)
        .set({ runId: input.runId, state: 'accepted' })
        .where(and(queuedFor(input.agentId), inArray(agentInboxTable.id, input.itemIds)));
}

/** Records the Computer ack for every row already attached to the acknowledged run. */
async function markInboxItemsAccepted(
    db: HausDatabase,
    input: { agentId: string; runId: string }
): Promise<void> {
    await db
        .update(agentInboxTable)
        .set({ acceptedAt: new Date() })
        .where(
            and(
                eq(agentInboxTable.agentId, input.agentId),
                eq(agentInboxTable.runId, input.runId),
                isNull(agentInboxTable.acceptedAt)
            )
        );
}

/**
 * Concrete work is served when the Computer accepts its model-visible run
 * inbox: an action attention, an automation fire, or a task assignment rides
 * in the run's own prompt, so acceptance already put its body in front of the
 * model and no pull can add anything.
 */
async function markConcreteItemsServed(
    db: HausDatabase,
    input: { agentId: string; runId: string }
): Promise<void> {
    await db
        .update(agentInboxTable)
        .set({ servedAt: new Date(), state: 'served' })
        .where(
            and(
                eq(agentInboxTable.agentId, input.agentId),
                eq(agentInboxTable.runId, input.runId),
                inArray(agentInboxTable.source, [...concreteInboxSources]),
                eq(agentInboxTable.state, 'accepted'),
                isNull(agentInboxTable.servedAt)
            )
        );
}

/**
 * Records that exact attached rows were handed to the model during the run. A
 * pull only reaches an accepted run, so a row attached after the ack takes its
 * acceptance stamp here rather than losing it.
 */
export async function markInboxItemsServed(
    db: HausDatabase,
    input: { agentId: string; itemIds: string[]; runId: string }
): Promise<void> {
    if (input.itemIds.length === 0) {
        return;
    }
    const now = new Date();
    await db
        .update(agentInboxTable)
        .set({
            acceptedAt: sql`coalesce(${agentInboxTable.acceptedAt}, ${now})`,
            servedAt: now,
            state: 'served',
        })
        .where(
            and(
                eq(agentInboxTable.agentId, input.agentId),
                eq(agentInboxTable.runId, input.runId),
                ne(agentInboxTable.state, 'seen'),
                inArray(agentInboxTable.id, input.itemIds)
            )
        );
}

export async function listInboxItemsForRun(
    db: HausDatabase,
    input: { agentId: string; runId: string }
): Promise<InboxItemRow[]> {
    return await db
        .select(inboxItemColumns)
        .from(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.agentId, input.agentId),
                eq(agentInboxTable.runId, input.runId),
                ne(agentInboxTable.state, 'seen')
            )
        )
        .orderBy(...inboxOrder());
}

export async function listQueuedItems(
    db: HausDatabase,
    agentId: string,
    limit: number
): Promise<InboxItemRow[]> {
    return await db
        .select(inboxItemColumns)
        .from(agentInboxTable)
        .where(queuedFor(agentId))
        .orderBy(...inboxOrder())
        .limit(limit);
}

/** Concrete work stays eligible for a concrete continuation after a busy notice. */
export async function listQueuedConcreteItems(
    db: HausDatabase,
    agentId: string,
    limit: number
): Promise<InboxItemRow[]> {
    return await db
        .select(inboxItemColumns)
        .from(agentInboxTable)
        .where(and(queuedFor(agentId), inArray(agentInboxTable.source, [...concreteInboxSources])))
        .orderBy(...inboxOrder())
        .limit(limit);
}

export async function listNoticedItemsForRun(
    db: HausDatabase,
    input: { agentId: string; runId: string }
): Promise<InboxItemRow[]> {
    return await db
        .select(inboxItemColumns)
        .from(agentInboxTable)
        .where(and(queuedFor(input.agentId), eq(agentInboxTable.startNoticeRunId, input.runId)))
        .orderBy(...inboxOrder());
}

export async function listOfferedItemsForRun(
    db: HausDatabase,
    input: { agentId: string; runId: string }
): Promise<InboxItemRow[]> {
    return await db
        .select(inboxItemColumns)
        .from(agentInboxTable)
        .where(and(queuedFor(input.agentId), eq(agentInboxTable.noticeRunId, input.runId)))
        .orderBy(...inboxOrder());
}

export async function listInboxItemsByDedupeKeys(
    db: HausDatabase,
    input: { agentId: string; dedupeKeys: string[]; runId: string }
): Promise<InboxItemRow[]> {
    if (input.dedupeKeys.length === 0) {
        return [];
    }
    return await db
        .select(inboxItemColumns)
        .from(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.agentId, input.agentId),
                inArray(agentInboxTable.dedupeKey, input.dedupeKeys),
                or(
                    and(isNull(agentInboxTable.runId), eq(agentInboxTable.state, 'queued')),
                    eq(agentInboxTable.runId, input.runId)
                )
            )
        );
}

/** Delivery effects that have not yet reached the model in this run. */
export async function listUnservedThreadFollowReactivationIds(
    db: HausDatabase,
    input: { agentId: string; dedupeKeys: string[]; runId: string }
): Promise<string[]> {
    if (input.dedupeKeys.length === 0) {
        return [];
    }
    const rows = await db
        .select({ dedupeKey: agentInboxTable.dedupeKey })
        .from(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.agentId, input.agentId),
                inArray(agentInboxTable.dedupeKey, input.dedupeKeys),
                eq(agentInboxTable.threadFollowReactivated, true),
                isNull(agentInboxTable.servedAt),
                or(
                    and(isNull(agentInboxTable.runId), eq(agentInboxTable.state, 'queued')),
                    eq(agentInboxTable.runId, input.runId)
                )
            )
        );
    return rows.map((row) => row.dedupeKey);
}

/** Ordinary Chat rows queryable through the Agent message surfaces. */
export async function listQueuedMessageItems(
    db: HausDatabase,
    agentId: string,
    limit: number
): Promise<InboxItemRow[]> {
    return await db
        .select(inboxItemColumns)
        .from(agentInboxTable)
        .where(
            and(queuedFor(agentId), notInArray(agentInboxTable.source, [...bodilessInboxSources]))
        )
        .orderBy(...inboxOrder())
        .limit(limit);
}

/** Marks exact queued identities as offered to the current turn, without making bodies visible. */
export async function markInboxItemsNoticed(
    db: HausDatabase,
    input: { agentId: string; initial?: boolean; itemIds: string[]; runId: string }
): Promise<void> {
    if (input.itemIds.length === 0) {
        return;
    }
    await db
        .update(agentInboxTable)
        .set({
            noticeRunId: input.runId,
            ...(input.initial ? { startNoticeRunId: input.runId } : {}),
        })
        .where(and(queuedFor(input.agentId), inArray(agentInboxTable.id, input.itemIds)));
}

/**
 * Returns still-queued typed work to the drain after the run it was offered to
 * settles. A deferred Chat message stays deferred: the model was told about it
 * and can still read it from Chat history, so re-driving would spin. A typed
 * delivery — an automation fire, a task assignment — exists nowhere but this
 * row, so a run that ended without pulling it must not bury it. The run that
 * was *started* for the row keeps its notice, which bounds the redelivery at
 * one dedicated wake per identity.
 */
export async function releaseUnservedTypedItems(
    db: HausDatabase,
    input: { agentId: string; runId: string; serverId: string }
): Promise<void> {
    await db.execute(sql`
        update agent_inbox item
        set notice_run_id = null, start_notice_run_id = null
        where item.server_id = ${input.serverId}
          and item.agent_id = ${input.agentId}
          and item.state = 'queued'
          and item.run_id is null
          and item.served_at is null
          and item.notice_run_id = ${input.runId}
          and item.start_notice_run_id is distinct from ${input.runId}
          and not exists (
              select 1 from chat_messages message
              where message.server_id = item.server_id
                and message.id = item.dedupe_key
          )
    `);
}

/**
 * Drops queued work whose typed identity is gone — a deleted Trigger's fires, a
 * canceled Reminder's. The envelope lives only in this row, so nothing else
 * could retire it and it would be re-offered on every wake forever.
 */
export async function retireQueuedItemsByDedupeKeys(
    db: HausDatabase,
    input: { dedupeKeys: string[]; serverId: string }
): Promise<void> {
    if (input.dedupeKeys.length === 0) {
        return;
    }
    await db
        .delete(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.serverId, input.serverId),
                eq(agentInboxTable.state, 'queued'),
                isNull(agentInboxTable.runId),
                inArray(agentInboxTable.dedupeKey, input.dedupeKeys)
            )
        );
}

export async function clearInboxNotices(
    db: HausDatabase,
    input: { agentId: string; runId?: string }
): Promise<void> {
    await db
        .update(agentInboxTable)
        .set({ noticeRunId: null, startNoticeRunId: null })
        .where(
            and(
                queuedFor(input.agentId),
                input.runId ? eq(agentInboxTable.noticeRunId, input.runId) : undefined
            )
        );
}

export async function listUnnoticedQueuedItems(
    db: HausDatabase,
    agentId: string,
    limit: number
): Promise<InboxItemRow[]> {
    return await db
        .select(inboxItemColumns)
        .from(agentInboxTable)
        .where(and(queuedFor(agentId), isNull(agentInboxTable.noticeRunId)))
        .orderBy(...inboxOrder())
        .limit(limit);
}

export async function deleteQueuedOrdinaryItems(
    db: HausDatabase,
    input: { agentId: string; chatIds: string[]; serverId: string }
): Promise<void> {
    if (input.chatIds.length === 0) {
        return;
    }
    await db.delete(agentInboxTable).where(
        and(
            queuedFor(input.agentId),
            eq(agentInboxTable.serverId, input.serverId),
            inArray(agentInboxTable.chatId, input.chatIds),
            eq(agentInboxTable.mentioned, false),
            // Only Chat chatter is ordinary. Typed work — an automation fire, a
            // task assignment, an action attention — is keyed by its own
            // identity, reaches the Agent nowhere else, and survives a mute.
            sql`exists (
                    select 1 from ${chatMessagesTable} message
                    where message.server_id = ${agentInboxTable.serverId}
                      and message.id = ${agentInboxTable.dedupeKey}
                )`,
            sql`not exists (
                    select 1 from ${messageTasksTable} task
                    where task.server_id = ${agentInboxTable.serverId}
                      and task.message_id = ${agentInboxTable.dedupeKey}
                      and task.assignee_agent_id = ${agentInboxTable.agentId}
                )`
        )
    );
}

export async function beginActiveRun(
    db: HausDatabase,
    input: {
        agentId: string;
        chatId: string;
        computerId: string;
        modelId: string;
        reasoningEffort: AgentReasoningEffort;
        runId: string;
        runtimeId: string;
    }
): Promise<void> {
    await db
        .update(agentDeliveryTable)
        .set({
            acceptedAt: null,
            activeRunChatId: input.chatId,
            activeRunComputerId: input.computerId,
            activeRunId: input.runId,
            activeRunModelId: input.modelId,
            activeRunReasoningEffort: input.reasoningEffort,
            activeRunRuntimeId: input.runtimeId,
            dispatchedAt: new Date(),
            updatedAt: new Date(),
        })
        .where(eq(agentDeliveryTable.agentId, input.agentId));
}

/** Records the Computer's local-acceptance ack. Idempotent and match-guarded. */
export async function markAccepted(
    db: HausDatabase,
    input: { agentId: string; runId: string }
): Promise<void> {
    await db
        .update(agentDeliveryTable)
        .set({ acceptedAt: new Date(), updatedAt: new Date() })
        .where(
            and(
                eq(agentDeliveryTable.agentId, input.agentId),
                eq(agentDeliveryTable.activeRunId, input.runId),
                isNull(agentDeliveryTable.acceptedAt)
            )
        );
    await markInboxItemsAccepted(db, input);
    await markConcreteItemsServed(db, input);
}

export async function markDispatched(
    db: HausDatabase,
    input: { agentId: string; runId: string }
): Promise<void> {
    await db
        .update(agentDeliveryTable)
        .set({ dispatchedAt: new Date(), updatedAt: new Date() })
        .where(
            and(
                eq(agentDeliveryTable.agentId, input.agentId),
                eq(agentDeliveryTable.activeRunId, input.runId)
            )
        );
}

export async function clearActiveRun(db: HausDatabase, agentId: string): Promise<void> {
    await db
        .update(agentDeliveryTable)
        .set({
            acceptedAt: null,
            activeRunChatId: null,
            activeRunComputerId: null,
            activeRunId: null,
            activeRunModelId: null,
            activeRunReasoningEffort: null,
            activeRunRuntimeId: null,
            dispatchedAt: null,
            updatedAt: new Date(),
        })
        .where(eq(agentDeliveryTable.agentId, agentId));
}

/** Records a run failure: bumps the failure count and sets the next retry (or degraded). */
export async function recordDeliveryFailure(
    db: HausDatabase,
    input: { agentId: string; consecutiveFailures: number; retryAfter: Date | null }
): Promise<void> {
    await db
        .update(agentDeliveryTable)
        .set({
            consecutiveFailures: input.consecutiveFailures,
            retryAfter: input.retryAfter,
            updatedAt: new Date(),
        })
        .where(eq(agentDeliveryTable.agentId, input.agentId));
}

/** Clears the failure backoff — a success or fresh human intent re-enables dispatch. */
export async function clearDeliveryFailures(db: HausDatabase, agentId: string): Promise<void> {
    await db
        .update(agentDeliveryTable)
        .set({ consecutiveFailures: 0, retryAfter: null, updatedAt: new Date() })
        .where(eq(agentDeliveryTable.agentId, agentId));
}

export async function setAgentChainTurns(
    db: HausDatabase,
    input: { agentId: string; turns: number }
): Promise<void> {
    await db
        .update(agentDeliveryTable)
        .set({ agentChainTurns: input.turns, updatedAt: new Date() })
        .where(eq(agentDeliveryTable.agentId, input.agentId));
}

/**
 * Consumes a settled run's claimed work. The rows leave the live queue for
 * good, but stay readable as the turn's delivery evidence: a turn that read a
 * message and answered nothing is only provable from a retained `seen` row.
 */
export async function markInboxItemsSeenForRun(
    db: HausDatabase,
    input: { agentId: string; runId: string }
): Promise<void> {
    await db
        .update(agentInboxTable)
        .set({
            servedAt: sql`coalesce(${agentInboxTable.servedAt}, ${new Date()})`,
            seenAt: new Date(),
            settledRunId: input.runId,
            state: 'seen',
        })
        .where(
            and(
                eq(agentInboxTable.agentId, input.agentId),
                eq(agentInboxTable.runId, input.runId),
                ne(agentInboxTable.state, 'seen')
            )
        );
}
/** Returns a failed or stopped run's claimed work to the queue so it is redelivered. */
export async function requeueInboxItemsForRun(
    db: HausDatabase,
    input: { agentId: string; runId: string }
): Promise<void> {
    await db
        .update(agentInboxTable)
        .set({ acceptedAt: null, runId: null, servedAt: null, state: 'queued' })
        .where(
            and(
                eq(agentInboxTable.agentId, input.agentId),
                eq(agentInboxTable.runId, input.runId),
                ne(agentInboxTable.state, 'seen')
            )
        );
    await retireRemovedTriggerItemsForRun(db, input.agentId);
}

/**
 * Every Agent the retry sweep should re-examine: one with an unacknowledged
 * in-flight run, or one with queued work and no active run that is not stopped,
 * not inside its failure backoff, and not degraded (`maxFailures` reached).
 */
export async function listDispatchCandidates(
    db: HausDatabase,
    maxFailures: number
): Promise<{ agentId: string; serverId: string }[]> {
    const now = new Date();
    const unacknowledged = await db
        .select({ agentId: agentDeliveryTable.agentId, serverId: agentDeliveryTable.serverId })
        .from(agentDeliveryTable)
        .innerJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, agentDeliveryTable.serverId),
                eq(agentsTable.id, agentDeliveryTable.agentId)
            )
        )
        .where(
            and(
                isNotNull(agentDeliveryTable.activeRunId),
                isNull(agentDeliveryTable.acceptedAt),
                isNull(agentsTable.retiredAt)
            )
        );
    const queued = await db
        .selectDistinct({
            agentId: agentDeliveryTable.agentId,
            serverId: agentDeliveryTable.serverId,
        })
        .from(agentInboxTable)
        .innerJoin(agentDeliveryTable, eq(agentDeliveryTable.agentId, agentInboxTable.agentId))
        .innerJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, agentDeliveryTable.serverId),
                eq(agentsTable.id, agentDeliveryTable.agentId)
            )
        )
        .where(
            and(
                isNull(agentInboxTable.runId),
                eq(agentInboxTable.state, 'queued'),
                isNull(agentDeliveryTable.activeRunId),
                eq(agentDeliveryTable.stopped, false),
                isNull(agentsTable.retiredAt),
                lt(agentDeliveryTable.consecutiveFailures, maxFailures),
                or(isNull(agentDeliveryTable.retryAfter), lte(agentDeliveryTable.retryAfter, now))
            )
        );

    const byAgent = new Map<string, { agentId: string; serverId: string }>();
    for (const row of [...unacknowledged, ...queued]) {
        byAgent.set(row.agentId, row);
    }
    return [...byAgent.values()];
}

/**
 * Inbox items normally share a database timestamp when one Chat operation
 * enqueues several messages. Use the canonical Chat sequence as the stable
 * tie-breaker so a task arrives before its assignment handoff in the Agent
 * prompt and message-check drain; typed work with no Chat message sorts last.
 */
function inboxOrder() {
    return [
        agentInboxTable.createdAt,
        sql`coalesce((
            select message.sequence
            from ${chatMessagesTable} message
            where message.server_id = ${agentInboxTable.serverId}
              and message.id = ${agentInboxTable.dedupeKey}
        ), 2147483647)`,
        agentInboxTable.id,
    ] as const;
}

/** The live queue predicate: the only rows a dispatch may still deliver. */
function queuedFor(agentId: string) {
    return and(
        eq(agentInboxTable.agentId, agentId),
        eq(agentInboxTable.state, 'queued'),
        isNull(agentInboxTable.runId)
    );
}
