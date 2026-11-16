import { type AgentTurnRejectedItem, isChatlessInboxSource } from '@haus/api';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentInboxTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { decodeTaskAssignment } from '../tasks/task-assignment-envelope.ts';
import { buildInboxItems } from './inbox-items.ts';
import * as store from './store.ts';

const reasonMaxLength = 500;

interface AgentScope {
    agentId: string;
    serverId: string;
}

/**
 * Settles items that can never reach the model, so they stop failing every
 * batch they join, and tells the Agent about each one with an ordinary inbox
 * item of its own (specs/cloud-agent-run-lifecycle.md). The note is built from
 * plain row fields, never the item's content, so it cannot fail the same way.
 * Rows settle `seen` because every other reader treats anything unseen as live.
 */
export async function markItemsUndeliverable(
    db: HausDatabase,
    scope: AgentScope,
    items: readonly AgentTurnRejectedItem[]
): Promise<number> {
    const reasonById = new Map(items.map((item) => [item.id, item.reason]));
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, scope.serverId);
        const rows = await tx
            .select({
                chatId: agentInboxTable.chatId,
                dedupeKey: agentInboxTable.dedupeKey,
                id: agentInboxTable.id,
                source: agentInboxTable.source,
            })
            .from(agentInboxTable)
            .where(
                and(
                    eq(agentInboxTable.agentId, scope.agentId),
                    inArray(agentInboxTable.dedupeKey, [...reasonById.keys()]),
                    ne(agentInboxTable.state, 'seen')
                )
            );
        for (const row of rows) {
            const reason = (reasonById.get(row.dedupeKey) ?? 'unknown').slice(0, reasonMaxLength);
            await tx
                .update(agentInboxTable)
                .set({ seenAt: new Date(), state: 'seen', undeliveredReason: reason })
                .where(eq(agentInboxTable.id, row.id));
            if (row.chatId) {
                await store.enqueueInboxItem(tx, {
                    ...scope,
                    chatId: row.chatId,
                    content: `1 item wasn't delivered: ${itemLabel(row)}, reason: ${reason}`,
                    dedupeKey: `undelivered:${row.id}`,
                    source: 'delivery_problem',
                });
            }
        }
        return rows.length;
    });
}

/**
 * Finds the queued items that fail to render by trying each alone, once a whole
 * batch has failed. Returns how many it set aside; zero means the failure lies
 * elsewhere and the caller should keep it.
 */
export async function isolateUnrenderableItems(
    db: HausDatabase,
    scope: AgentScope
): Promise<number> {
    const rows = await db
        .select(store.inboxItemColumns)
        .from(agentInboxTable)
        .where(store.queuedFor(scope.agentId))
        .orderBy(asc(agentInboxTable.createdAt));
    const failed: AgentTurnRejectedItem[] = [];
    for (const row of rows) {
        try {
            await renderAlone(db, row);
        } catch (cause) {
            failed.push({ id: row.dedupeKey, reason: failureReason(cause) });
        }
    }
    return failed.length > 0 ? await markItemsUndeliverable(db, scope, failed) : 0;
}

/**
 * Renders one row the way its run would. A chatless attention never becomes an
 * inbox envelope (its run frames it alone), so only a Task assignment, whose run
 * decodes its body, can fail here; a dream or heartbeat carries nothing to render.
 */
async function renderAlone(db: HausDatabase, row: store.InboxItemRow): Promise<void> {
    if (!isChatlessInboxSource(row.source)) {
        await buildInboxItems(db, [row]);
        return;
    }
    if (row.source === 'task_assignment') {
        decodeTaskAssignment(row.content);
    }
}

function itemLabel(row: { dedupeKey: string; source: string }): string {
    if (row.source === 'cloud_agent_work') {
        return `cloud agent notice ${row.dedupeKey}`;
    }
    return row.source === 'human'
        ? `message ${row.dedupeKey} from a person`
        : `${row.source} item ${row.dedupeKey}`;
}

function failureReason(cause: unknown): string {
    return cause instanceof Error ? `${cause.name}: ${cause.message}` : 'it could not be rendered';
}
