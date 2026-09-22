import type { AgentCommand } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import type { AgentDispatchConfig } from './dispatch-config.ts';
import { buildInboxItems } from './inbox-items.ts';
import { isConcreteInboxSource as isConcreteSource } from './inbox-lanes.ts';
import type { AgentDeliveryRow } from './store.ts';
import * as store from './store.ts';
import { readUnreadElsewhere } from './unread-elsewhere.ts';

/** Bounds one drain so the composed prompt stays well under command/env limits. */
export const maxDrainRows = 50;
const maxDrainChars = 24_000;

/**
 * Rebuilds an in-flight run's frame from durable state. A resend must reproduce
 * the same drain sets and digest, or a replayed run composes a prompt the
 * ledger does not expect.
 */
export async function startFrame(
    db: HausDatabase,
    state: AgentDeliveryRow,
    config: Pick<
        AgentDispatchConfig,
        'agentDescription' | 'agentName' | 'homeTimezone' | 'sessionGeneration'
    >
): Promise<AgentCommand> {
    const runRows = state.activeRunId
        ? await store.listInboxItemsForRun(db, {
              agentId: state.agentId,
              runId: state.activeRunId,
          })
        : [];
    const noticeRows =
        runRows.length === 0 && state.activeRunId
            ? (
                  await store.listNoticedItemsForRun(db, {
                      agentId: state.agentId,
                      runId: state.activeRunId,
                  })
              ).filter((row) => row.source !== 'onboarding')
            : [];
    return {
        agentId: state.agentId,
        ...(config.agentDescription ? { agentDescription: config.agentDescription } : {}),
        agentName: config.agentName,
        chatId: state.activeRunChatId ?? '',
        drainItemIds: [...runRows, ...noticeRows.filter(isAddressedHumanRow)].map(
            (row) => row.dedupeKey
        ),
        homeTimezone: config.homeTimezone,
        inbox: await buildInboxItems(db, runRows.length > 0 ? runRows : noticeRows),
        inboxDelivery: runRows.length > 0 ? 'concrete' : 'notice',
        modelId: state.activeRunModelId ?? '',
        runId: state.activeRunId ?? '',
        runtimeId: state.activeRunRuntimeId ?? '',
        sessionGeneration: config.sessionGeneration,
        totalPending: await store.countQueuedNoticeItems(db, state.agentId),
        type: 'start',
        unreadElsewhere: await readUnreadElsewhere(db, {
            agentId: state.agentId,
            drainedItemIds: runRows.map((row) => row.id),
            representedChatIds: chatIdsOf(noticeRows),
            serverId: state.serverId,
        }),
        warmDrainItemIds: noticeRows
            .filter((row) => row.source === 'human' && !isAddressedHumanRow(row))
            .map((row) => row.dedupeKey),
    };
}

/**
 * One drain never mixes the lanes, and a concrete drain never mixes kinds: a
 * fire, a task assignment, a Cloud Agent result, and Cove's bootstrap each earn
 * their own dedicated wake, which is also what keeps the sole-fire cause
 * inference readable (specs/inbox.md).
 */
export function boundedCompatibleRows(rows: store.InboxItemRow[], source: string) {
    const selected: store.InboxItemRow[] = [];
    let chars = 0;
    for (const row of rows) {
        if (isConcreteSource(source) ? row.source !== source : isConcreteSource(row.source)) {
            continue;
        }
        const nextChars = chars + row.content.length;
        if (selected.length > 0 && (selected.length >= maxDrainRows || nextChars > maxDrainChars)) {
            break;
        }
        selected.push(row);
        chars = nextChars;
    }
    return selected;
}

/**
 * A human item this Agent was named in: a DM, an @mention, or a Jev routing
 * that committed the message to it alone (ADR 0030). Raft wakes an alive Agent
 * with every human body; Haus additionally drains these on a cold start, where
 * a notice would otherwise leave a direct question unanswered (ADR 0033).
 */
export function isAddressedHumanRow(row: store.InboxItemRow): boolean {
    return row.source === 'human' && row.addressedReason !== null;
}

export function chatIdsOf(rows: store.InboxItemRow[]): string[] {
    return [...new Set(rows.map((row) => row.chatId))];
}

export function noticeWindow(
    queued: store.InboxItemRow[],
    mustInclude: store.InboxItemRow[]
): store.InboxItemRow[] {
    const selected = new Map(mustInclude.map((row) => [row.id, row]));
    for (const row of queued) {
        if (selected.size >= maxDrainRows) {
            break;
        }
        selected.set(row.id, row);
    }
    return [...selected.values()].sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime()
    );
}
