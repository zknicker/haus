import type { AgentAutomationEvent } from '@haus/api';
import { recordExactMessagesServed } from '../agent-delivery/cursors.ts';
import { buildInboxItems } from '../agent-delivery/inbox-items.ts';
import {
    attachQueuedItemsToRun,
    listInboxItemsForRun,
    listQueuedItems,
    listQueuedMessageItems,
    markInboxItemsServed,
    readDeliveryState,
} from '../agent-delivery/store.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { resolveAgentMessage } from './message-read.ts';
import { targetForChat } from './message-view.ts';

const maxPulledMessages = 40;

export async function pullAgentEvents(db: HausDatabase, runner: ResolvedRunner) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        const delivery = await readDeliveryState(tx, runner.agentId);
        if (delivery?.activeRunId !== runner.runId || delivery.acceptedAt === null) {
            throw new Error('The Agent run is no longer active.');
        }

        const pending = await listQueuedMessageItems(tx, runner.agentId, maxPulledMessages + 1);
        const selected = pending.slice(0, maxPulledMessages);
        const messages: Array<{
            message: Awaited<ReturnType<typeof resolveAgentMessage>>;
            target: string;
            threadFollowReactivated?: boolean;
        }> = [];
        const automations: AgentAutomationEvent[] = [];
        // Each resolver issues several queries. Bun's transaction client must not run those
        // compound query sequences concurrently or it can wait on itself indefinitely.
        for (const row of selected) {
            const target = await targetForChat(tx, runner.serverId, row.chatId);
            // A fire or a task assignment writes no Chat message, so its
            // pending row is keyed by its own identity and carries its own
            // envelope body.
            if (!row.dedupeKey.startsWith('msg_')) {
                automations.push({
                    content: row.content,
                    createdAt: row.createdAt.toISOString(),
                    id: row.dedupeKey,
                    senderHandle: typedSenderHandle(row.source),
                    senderType: row.source === 'trigger' ? 'trigger' : 'system',
                    target,
                });
                continue;
            }
            messages.push({
                message: await resolveAgentMessage(tx, runner, row.dedupeKey),
                target,
                ...(row.threadFollowReactivated ? { threadFollowReactivated: true } : {}),
            });
        }
        await attachQueuedItemsToRun(tx, {
            agentId: runner.agentId,
            itemIds: selected.map((row) => row.id),
            runId: runner.runId,
        });
        await markInboxItemsServed(tx, {
            agentId: runner.agentId,
            itemIds: selected.map((row) => row.id),
            runId: runner.runId,
        });
        await recordExactMessagesServed(tx, {
            agentId: runner.agentId,
            messages: messages.map((row) => ({ chatId: row.message.chat_id, id: row.message.id })),
            runId: runner.runId,
            serverId: runner.serverId,
        });
        return { automations, messages, more: pending.length > maxPulledMessages };
    });
}

/**
 * Attests exact bodies the Computer put in front of the model to the active
 * turn. A pull receipt — the Computer-local `message check` cache — also serves
 * the rows it returned, as a Server pull does. A composed receipt covers a drain
 * the turn prompt itself carried and records exact visibility only, before the
 * model streams: its rows stay offered to the run so a resend recomputes the
 * same drain sets (ADR 0033), and settlement attaches and sees them.
 */
export async function attestAgentEvents(
    db: HausDatabase,
    runner: ResolvedRunner,
    identities: Array<{ chatId: string; id: string; sequence: number }>,
    options: { composed?: boolean } = {}
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, runner.serverId);
        const delivery = await readDeliveryState(tx, runner.agentId);
        if (delivery?.activeRunId !== runner.runId || delivery.acceptedAt === null) {
            throw new Error('The Agent run is no longer active.');
        }
        const requested = new Map(identities.map((identity) => [identity.id, identity]));
        const messages: Awaited<ReturnType<typeof resolveAgentMessage>>[] = [];
        // History and hold results are model-visible even when mute prevented a pending row.
        for (const identity of requested.values()) {
            const message = await resolveAgentMessage(tx, runner, identity.id);
            if (identity.chatId !== message.chat_id || identity.sequence !== message.sequence) {
                throw new Error('The local inbox receipt has a stale message boundary.');
            }
            messages.push(message);
        }
        if (!options.composed) {
            await serveReceiptRows(tx, runner, requested);
        }
        await recordExactMessagesServed(tx, {
            agentId: runner.agentId,
            messages: messages.map((message) => ({ chatId: message.chat_id, id: message.id })),
            runId: runner.runId,
            serverId: runner.serverId,
        });
        return { accepted: messages.map((message) => message.id) };
    });
}

async function serveReceiptRows(
    tx: HausDatabase,
    runner: ResolvedRunner,
    requested: Map<string, unknown>
) {
    const [pending, attached] = await Promise.all([
        listQueuedMessageItems(tx, runner.agentId, 1000),
        listInboxItemsForRun(tx, { agentId: runner.agentId, runId: runner.runId }),
    ]);
    await attachQueuedItemsToRun(tx, {
        agentId: runner.agentId,
        itemIds: pending.filter((row) => requested.has(row.dedupeKey)).map((row) => row.id),
        runId: runner.runId,
    });
    await markInboxItemsServed(tx, {
        agentId: runner.agentId,
        itemIds: [...pending, ...attached]
            .filter((row) => requested.has(row.dedupeKey))
            .map((row) => row.id),
        runId: runner.runId,
    });
}

/**
 * `haus inbox check`: the busy notice's own rows and facts, read without
 * advancing anything. Each row carries the work facts the notice tags a target
 * with, derived from the same envelopes, so the CLI and the notice print one
 * row shape (`apps/computer/src/inbox-target-row.ts`).
 */
export async function inspectAgentInbox(db: HausDatabase, runner: ResolvedRunner) {
    const pending = (await listQueuedItems(db, runner.agentId, 1000)).filter(
        (row) => row.source !== 'onboarding'
    );
    const items = await buildInboxItems(db, pending);
    const groups = new Map<string, typeof items>();
    for (const item of items) {
        groups.set(item.chatId, [...(groups.get(item.chatId) ?? []), item]);
    }
    const rows = [...groups.entries()].flatMap(([chatId, group]) => {
        const first = group[0];
        const latest = group.at(-1);
        if (!(first && latest)) {
            return [];
        }
        return [
            {
                ask: latest.ask ?? null,
                chatId,
                cloudAgentResult: group.some((item) => item.cloudAgentWork !== undefined),
                // Released Computers still read these two; current ones derive them from `target`.
                dm: latest.target.startsWith('dm:'),
                firstShortId: shortId(first.id),
                latestSender: latest.senderHandle,
                latestShortId: shortId(latest.id),
                mentioned: group.some((item) => item.mentioned === true),
                pendingCount: group.length,
                target: latest.target,
                taskNumber: latest.task?.number ?? null,
                thread: latest.target.includes(':') && !latest.target.startsWith('dm:'),
            },
        ];
    });
    return { rows, totalPending: pending.length };
}

/**
 * The handle a bodiless delivery speaks under. Only rows with no Chat message
 * reach this: automation fires, and the task assignment handoff, which is
 * Server-authored and so speaks as Haus.
 */
function typedSenderHandle(source: string): AgentAutomationEvent['senderHandle'] {
    if (source === 'trigger') {
        return 'trigger';
    }
    return source === 'reminder' ? 'reminder' : 'haus';
}

/**
 * The short id `haus inbox check` prints in a target's `first msg=`/`latest
 * msg=` slot, by the rule the notice's `shortInboxId` applies to the same item.
 * A Trigger or Reminder fire and a Cloud Agent Run have no Chat message behind
 * them, so they print `-`; a task assignment prints the task message it hands
 * over, which is the id the Agent can actually address.
 */
function shortId(id: string) {
    if (/^(?:car|rmf|trf)_/u.test(id)) {
        return '-';
    }
    const assignment = /^task-assign:(?<messageId>[^:]+):/u.exec(id);
    const subject = assignment?.groups?.messageId ?? id;
    return subject.replace(/^[a-z]+_/u, '').slice(0, 8) || '-';
}
