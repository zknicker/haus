import type {
    AgentInboxItem,
    AgentTaskContext,
    WorkerPullRequestChange,
    WorkerAttention,
    HausAgentMessage,
} from '@haus/api';
import { and, eq, inArray } from 'drizzle-orm';
import {
    messageSelection,
    targetForChat as targetForAgentChat,
    toAgentMessages,
} from '../agent-api/message-view.ts';
import { listMessageClaimMap } from '../claims/claim-shape.ts';
import { parsePullRequestChangeKey } from '../github/pull-request-change.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable } from '../postgres/schema.ts';
import {
    type WorkerTurnAttention,
    readWorkerAttentions,
} from '../workers/read-worker-attentions.ts';
import {
    isWorkerInboxSource,
    workerInboxSources,
    workerNoticeOf,
} from '../workers/worker-inbox-sources.ts';
import { chatOf } from './inbox-lanes.ts';
import { inboxSender } from './inbox-sender.ts';
import type * as store from './store.ts';
import { readTaskContexts, withoutVisibleTasks } from './task-context.ts';

/**
 * Renders queued Chat-backed rows (never a chatless attention, whose run frames
 * it separately) as the canonical envelopes the Computer projects. Bodies
 * always ride the frame; which of them reach the model is the lane decision.
 * A frame that may drain these rows names its Agent, so a Task mention it has
 * no visible context for carries that Task's context package.
 */
export async function buildInboxItems(
    db: HausDatabase,
    rows: store.InboxItemRow[],
    drainAgentId?: string
): Promise<AgentInboxItem[]> {
    const serverId = rows[0]?.serverId;
    const messageIds = rows.map((row) => row.dedupeKey).filter((id) => id.startsWith('msg_'));
    const messageRows =
        serverId && messageIds.length > 0
            ? await db
                  .select(messageSelection)
                  .from(chatMessagesTable)
                  .where(
                      and(
                          eq(chatMessagesTable.serverId, serverId),
                          inArray(chatMessagesTable.id, messageIds)
                      )
                  )
            : [];
    const apiMessages = serverId ? await toAgentMessages(db, serverId, messageRows) : [];
    const apiMessageById = new Map(apiMessages.map((message) => [message.id, message]));
    const workerByRun =
        serverId && rows.some((row) => isWorkerInboxSource(row.source))
            ? await readWorkerAttentions(
                  db,
                  serverId,
                  rows.flatMap((row) => (row.workerTurnId ? [row.workerTurnId] : []))
              )
            : new Map<string, WorkerTurnAttention>();
    const sequenceByMessageId = new Map(
        messageRows.map((message) => [message.id, message.sequence])
    );
    const claimByMessage = serverId
        ? await listMessageClaimMap(
              db,
              serverId,
              rows.map((row) => row.dedupeKey)
          )
        : new Map();
    const taskContexts = drainAgentId
        ? await withoutVisibleTasks(db, {
              agentId: drainAgentId,
              contexts: await readTaskContexts(db, rows),
              rows,
          })
        : new Map<string, AgentTaskContext>();
    const targetByChatId = new Map<string, string>();
    for (const chatId of new Set(rows.map(chatOf))) {
        targetByChatId.set(
            chatId,
            serverId ? await targetForAgentChat(db, serverId, chatId) : '#unknown'
        );
    }
    return rows.map((row) =>
        toInboxItem(row, {
            apiMessage: apiMessageById.get(row.dedupeKey),
            worker:
                isWorkerInboxSource(row.source) && row.workerTurnId
                    ? requireAttention(row, workerByRun)
                    : undefined,
            pullRequestNotice:
                row.source === workerInboxSources.pull_request && !row.workerTurnId
                    ? requirePullRequestNotice(row)
                    : undefined,
            sequence: sequenceByMessageId.get(row.dedupeKey) ?? 1,
            target: targetByChatId.get(chatOf(row)) ?? '#unknown',
            claim: claimByMessage.get(row.dedupeKey),
            taskContext: taskContexts.get(row.id),
        })
    );
}

interface InboxItemFacets {
    apiMessage: HausAgentMessage | undefined;
    claim: AgentInboxItem['claim'];
    worker: WorkerAttention | undefined;
    pullRequestNotice: WorkerPullRequestChange | undefined;
    sequence: number;
    target: string;
    taskContext: AgentTaskContext | undefined;
}

function toInboxItem(row: store.InboxItemRow, facets: InboxItemFacets): AgentInboxItem {
    const { apiMessage, worker, pullRequestNotice, target } = facets;
    const attention = Boolean(worker ?? pullRequestNotice);
    const sender = inboxSender({ attention, message: apiMessage, source: row.source, target });
    // Only a human-authored envelope carries the human's saved zone; a claim
    // assignment wrapping a human's message is a system envelope.
    const senderTimezone = sender.senderType === 'human' ? apiMessage?.sender.timezone : undefined;
    return {
        ...messageFacets(apiMessage),
        ...(row.addressedReason ? { addressed: true, addressedReason: row.addressedReason } : {}),
        ...(worker ? { worker } : {}),
        ...(pullRequestNotice ? { pullRequestNotice } : {}),
        ...(row.mentioned ? { mentioned: true } : {}),
        ...(row.taskFollowReactivated ? { taskFollowReactivated: true } : {}),
        ...(facets.claim ? { claim: facets.claim } : {}),
        ...(facets.taskContext ? { taskContext: facets.taskContext } : {}),
        ...sender,
        ...(senderTimezone ? { senderTimezone } : {}),
        chatId: chatOf(row),
        content: worker ? '' : row.content,
        createdAt: row.createdAt.toISOString(),
        id: row.dedupeKey,
        sequence: attention ? 0 : facets.sequence,
        target,
    };
}

/** The envelope facets a backing Chat message contributes; a fire has none. */
function messageFacets(apiMessage: HausAgentMessage | undefined) {
    if (!apiMessage) {
        return {};
    }
    return {
        message: apiMessage,
        ...(apiMessage.reply ? { reply: apiMessage.reply } : {}),
        ...(apiMessage.sender.description
            ? { senderDescription: apiMessage.sender.description }
            : {}),
    };
}

/** A Worker row whose attention vanished cannot be rendered truthfully. */
function requireAttention(
    row: store.InboxItemRow,
    attentions: Map<string, WorkerTurnAttention>
): WorkerAttention {
    const attention = row.workerTurnId ? attentions.get(row.workerTurnId) : undefined;
    const notice = workerNoticeOf(row.source);
    if (!(attention && notice)) {
        throw new WorkerAttentionMissingError(row.dedupeKey);
    }
    if (notice !== 'pull_request') {
        return { ...attention, notice };
    }
    const change = parsePullRequestChangeKey(row.dedupeKey);
    if (!change) {
        throw new WorkerAttentionMissingError(row.dedupeKey);
    }
    return { ...attention, notice: 'pull_request', pullRequestChange: change };
}

function requirePullRequestNotice(row: store.InboxItemRow): WorkerPullRequestChange {
    const change = parsePullRequestChangeKey(row.dedupeKey);
    if (!change) {
        throw new WorkerAttentionMissingError(row.dedupeKey);
    }
    return change;
}

/** Named so a failed dispatch's log says which item stopped it. */
class WorkerAttentionMissingError extends Error {
    override readonly name = 'WorkerAttentionMissingError';

    constructor(dedupeKey: string) {
        super(`Worker attention ${dedupeKey} is missing.`);
    }
}
