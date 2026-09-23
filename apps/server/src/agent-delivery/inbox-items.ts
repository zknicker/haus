import type {
    AgentInboxItem,
    AgentThreadContext,
    CloudAgentWorkAttention,
    HausAgentMessage,
} from '@haus/api';
import { and, eq, inArray } from 'drizzle-orm';
import {
    messageSelection,
    targetForChat as targetForAgentChat,
    toAgentMessages,
} from '../agent-api/message-view.ts';
import { readCloudAgentWorkAttentions } from '../cloud-agents/read-cloud-agent-work-attentions.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable } from '../postgres/schema.ts';
import { listMessageTaskMap } from '../tasks/task-shape.ts';
import { inboxSender } from './inbox-sender.ts';
import type * as store from './store.ts';
import { readThreadContexts, withoutVisibleThreads } from './thread-context.ts';

/**
 * Renders queued rows as the canonical envelopes the Computer projects. Bodies
 * always ride the frame; which of them reach the model is the lane decision.
 * A frame that may drain these rows names its Agent, so a Thread mention it has
 * no visible context for carries that Thread's context package.
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
    const cloudAgentWorkByRun =
        serverId && rows.some((row) => row.source === 'cloud_agent_work')
            ? await readCloudAgentWorkAttentions(
                  db,
                  serverId,
                  rows
                      .filter((row) => row.source === 'cloud_agent_work')
                      .map((row) => row.dedupeKey)
              )
            : new Map<string, CloudAgentWorkAttention>();
    const sequenceByMessageId = new Map(
        messageRows.map((message) => [message.id, message.sequence])
    );
    const taskByMessage = serverId
        ? await listMessageTaskMap(
              db,
              serverId,
              rows.map((row) => row.dedupeKey)
          )
        : new Map();
    const threadContexts = drainAgentId
        ? await withoutVisibleThreads(db, {
              agentId: drainAgentId,
              contexts: await readThreadContexts(db, rows),
              rows,
          })
        : new Map<string, AgentThreadContext>();
    const targetByChatId = new Map<string, string>();
    for (const chatId of new Set(rows.map((row) => row.chatId))) {
        targetByChatId.set(
            chatId,
            serverId ? await targetForAgentChat(db, serverId, chatId) : '#unknown'
        );
    }
    return rows.map((row) =>
        toInboxItem(row, {
            apiMessage: apiMessageById.get(row.dedupeKey),
            cloudAgentWork:
                row.source === 'cloud_agent_work'
                    ? requireAttention(row, cloudAgentWorkByRun)
                    : undefined,
            sequence: sequenceByMessageId.get(row.dedupeKey) ?? 1,
            target: targetByChatId.get(row.chatId) ?? '#unknown',
            task: taskByMessage.get(row.dedupeKey),
            threadContext: threadContexts.get(row.id),
        })
    );
}

interface InboxItemFacets {
    apiMessage: HausAgentMessage | undefined;
    cloudAgentWork: CloudAgentWorkAttention | undefined;
    sequence: number;
    target: string;
    task: AgentInboxItem['task'];
    threadContext: AgentThreadContext | undefined;
}

function toInboxItem(row: store.InboxItemRow, facets: InboxItemFacets): AgentInboxItem {
    const { apiMessage, cloudAgentWork, target } = facets;
    const attention = Boolean(cloudAgentWork);
    return {
        ...messageFacets(apiMessage),
        ...(row.addressedReason ? { addressed: true, addressedReason: row.addressedReason } : {}),
        ...(cloudAgentWork ? { cloudAgentWork } : {}),
        ...(row.mentioned ? { mentioned: true } : {}),
        ...(row.threadFollowReactivated ? { threadFollowReactivated: true } : {}),
        ...(facets.task ? { task: facets.task } : {}),
        ...(facets.threadContext ? { threadContext: facets.threadContext } : {}),
        ...inboxSender({ attention, message: apiMessage, source: row.source, target }),
        chatId: row.chatId,
        content: attention ? '' : row.content,
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
        ...(apiMessage.ask
            ? {
                  ask: {
                      addresseeHandle: apiMessage.ask.addressee_handle,
                      status: apiMessage.ask.status,
                  },
              }
            : {}),
        ...(apiMessage.reply ? { reply: apiMessage.reply } : {}),
        ...(apiMessage.sender.description
            ? { senderDescription: apiMessage.sender.description }
            : {}),
    };
}

/** A Cloud Agent row whose attention vanished cannot be rendered truthfully. */
function requireAttention(
    row: store.InboxItemRow,
    attentions: Map<string, CloudAgentWorkAttention>
): CloudAgentWorkAttention {
    const attention = attentions.get(row.dedupeKey);
    if (!attention) {
        throw new Error(`Cloud Agent attention ${row.dedupeKey} is missing.`);
    }
    return attention;
}
