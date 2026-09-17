import type { HausAgentMessage, MessageBodyKind } from '@haus/api';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { readAsksForMessages } from '../asks/ask-shape.ts';
import { readMessageAttachments } from '../attachments/message-attachments.ts';
import { readInlineReplyContexts } from '../chats/reply-context.ts';
import { readCloudAgentWorkForMessages } from '../cloud-agents/cloud-agent-shape.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    chatMessagesTable,
    chatsTable,
    serverMembershipsTable,
    usersTable,
} from '../postgres/schema.ts';
import { readCreatedAgentsForMessages } from '../server-agents/agent-created-shape.ts';
import { listMessageTaskMap } from '../tasks/task-shape.ts';
import { readMessageReactions } from './message-reactions.ts';
import { agentMessageBodies } from './message-view-bodies.ts';

export interface MessageRow {
    authorAgentId: string | null;
    authorUserId: string | null;
    bodyKind: MessageBodyKind;
    chatId: string;
    content: string;
    createdAt: Date;
    id: string;
    nonce: string;
    replyRootMessageId: string | null;
    replyToMessageId: string | null;
    sequence: number;
}

export const messageSelection = {
    authorAgentId: chatMessagesTable.authorAgentId,
    authorUserId: chatMessagesTable.authorUserId,
    bodyKind: chatMessagesTable.bodyKind,
    chatId: chatMessagesTable.chatId,
    content: chatMessagesTable.content,
    createdAt: chatMessagesTable.createdAt,
    id: chatMessagesTable.id,
    nonce: chatMessagesTable.nonce,
    replyRootMessageId: chatMessagesTable.replyRootMessageId,
    replyToMessageId: chatMessagesTable.replyToMessageId,
    sequence: chatMessagesTable.sequence,
};

export async function toAgentMessages(
    db: HausDatabase,
    serverId: string,
    rows: MessageRow[]
): Promise<HausAgentMessage[]> {
    const messageIds = rows.map(({ id }) => id);
    // Sequential, not Promise.all: `db` is often the caller's transaction, and
    // overlapping reads on that one connection deadlocked Agent delivery
    // against the Server row lock its own transaction already held.
    const tasksByMessage = await listMessageTaskMap(db, serverId, messageIds);
    const asksByMessage = await readAsksForMessages(db, serverId, messageIds);
    const cloudAgentWorkByMessage = await readCloudAgentWorkForMessages(db, serverId, messageIds);
    const createdAgentByMessage = await readCreatedAgentsForMessages(db, serverId, messageIds);
    const agentIds = [
        ...new Set(
            rows
                .flatMap((row) => row.authorAgentId ?? [])
                .concat([...tasksByMessage.values()].flatMap((task) => task.assigneeAgentId ?? []))
        ),
    ];
    const agents =
        agentIds.length === 0
            ? []
            : await db
                  .select({
                      description: agentsTable.description,
                      displayName: agentsTable.displayName,
                      handle: agentsTable.handle,
                      id: agentsTable.id,
                  })
                  .from(agentsTable)
                  .where(
                      and(eq(agentsTable.serverId, serverId), inArray(agentsTable.id, agentIds))
                  );
    const agentById = new Map(agents.map((agent) => [agent.id, agent]));
    const humanIds = [
        ...new Set(
            rows
                .flatMap((row) => row.authorUserId ?? [])
                .concat([...tasksByMessage.values()].flatMap((task) => task.assigneeUserId ?? []))
                .concat([...asksByMessage.values()].map((ask) => ask.addresseeUserId))
        ),
    ];
    const humans =
        humanIds.length === 0
            ? []
            : await db
                  .select({
                      description: usersTable.description,
                      displayName: usersTable.displayName,
                      handle: serverMembershipsTable.handle,
                      id: usersTable.id,
                  })
                  .from(serverMembershipsTable)
                  .innerJoin(usersTable, eq(usersTable.id, serverMembershipsTable.userId))
                  .where(
                      and(
                          eq(serverMembershipsTable.serverId, serverId),
                          inArray(serverMembershipsTable.userId, humanIds)
                      )
                  );
    const humanById = new Map(humans.map((human) => [human.id, human]));
    const attachmentsByMessage = await readMessageAttachments(db, serverId, messageIds);
    const reactionsByMessage = await readMessageReactions(db, serverId, messageIds);
    const repliesByMessage = await readInlineReplyContexts(db, serverId, rows);
    return rows.map((row) => {
        const agent = row.authorAgentId ? agentById.get(row.authorAgentId) : undefined;
        const human = row.authorUserId ? humanById.get(row.authorUserId) : undefined;
        const handle = agent?.handle ?? human?.handle ?? null;
        const label = agent?.displayName ?? human?.displayName ?? 'Human';
        const task = tasksByMessage.get(row.id);
        const ask = asksByMessage.get(row.id);
        const cloudAgentWork = cloudAgentWorkByMessage.get(row.id);
        const createdAgent = createdAgentByMessage.get(row.id);
        const taskAssigneeAgent = task?.assigneeAgentId
            ? agentById.get(task.assigneeAgentId)
            : undefined;
        const taskAssigneeHuman = task?.assigneeUserId
            ? humanById.get(task.assigneeUserId)
            : undefined;
        return {
            attachments: attachmentsByMessage.get(row.id) ?? [],
            author: {
                id: row.authorAgentId ?? row.authorUserId ?? '',
                kind: agent ? 'agent' : 'user',
                label,
                metadata: {},
            },
            body_kind: row.bodyKind,
            chat_id: row.chatId,
            content: row.content,
            created_at: row.createdAt.toISOString(),
            deleted_at: null,
            delivery_id: null,
            id: row.id,
            metadata: {},
            nonce: row.nonce,
            role: agent ? 'assistant' : 'user',
            reactions: reactionsByMessage.get(row.id) ?? [],
            reply: repliesByMessage.get(row.id) ?? null,
            sender: {
                description: agent?.description ?? human?.description ?? null,
                handle,
                type: agent ? 'agent' : 'human',
            },
            sequence: row.sequence,
            ...(ask
                ? {
                      ask: {
                          addressee_handle: humanById.get(ask.addresseeUserId)?.handle ?? null,
                          id: ask.id,
                          options: ask.options,
                          status: ask.status,
                          title: ask.title,
                      },
                  }
                : {}),
            ...agentMessageBodies({ cloudAgentWork, createdAgent }),
            ...(task
                ? {
                      task: {
                          assignee: task.assigneeAgentId
                              ? {
                                    handle: taskAssigneeAgent?.handle ?? null,
                                    id: task.assigneeAgentId,
                                }
                              : task.assigneeUserId
                                ? {
                                      handle: taskAssigneeHuman?.handle ?? null,
                                      id: task.assigneeUserId,
                                  }
                                : null,
                          claimed_at: task.claimedAt,
                          created_at: task.createdAt,
                          labels: task.labels,
                          number: task.number,
                          origin: task.origin,
                          priority: task.priority,
                          status: task.status,
                          updated_at: task.updatedAt,
                      },
                  }
                : {}),
        };
    });
}

export async function targetForChat(
    db: HausDatabase,
    serverId: string,
    chatId: string
): Promise<string> {
    const [chat] = await db
        .select({
            anchorMessageId: chatsTable.anchorMessageId,
            kind: chatsTable.kind,
            dmMemberOneUserId: chatsTable.dmMemberOneUserId,
            name: chatsTable.name,
            parentChatId: chatsTable.parentChatId,
        })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, serverId), eq(chatsTable.id, chatId)))
        .limit(1);
    if (!chat) {
        return '#unknown';
    }
    if (chat.kind === 'dm') {
        const [human] = chat.dmMemberOneUserId
            ? await db
                  .select({ handle: serverMembershipsTable.handle })
                  .from(serverMembershipsTable)
                  .where(
                      and(
                          eq(serverMembershipsTable.serverId, serverId),
                          eq(serverMembershipsTable.userId, chat.dmMemberOneUserId)
                      )
                  )
                  .limit(1)
            : [];
        if (!human?.handle) {
            throw new Error('This DM human does not have an active Server handle.');
        }
        return `dm:@${human.handle}`;
    }
    if (chat.kind === 'channel') {
        return `#${chat.name}`;
    }
    const parent = chat.parentChatId
        ? await targetForChat(db, serverId, chat.parentChatId)
        : '#unknown';
    return `${parent}:${shortMessageId(chat.anchorMessageId ?? '')}`;
}

export function visibleChatSql(runner: ResolvedRunner) {
    return sql`(
        (${chatsTable.kind} = 'dm' and ${chatsTable.dmAgentId} = ${runner.agentId})
        or (
            ${chatsTable.kind} = 'channel'
            and exists (
                select 1 from channel_agent_participants cap
                where cap.server_id = ${runner.serverId}
                  and cap.chat_id = ${chatsTable.id}
                  and cap.agent_id = ${runner.agentId}
            )
        )
        or (
            ${chatsTable.kind} = 'thread'
            and (
                exists (
                    select 1 from channel_agent_participants cap
                    where cap.server_id = ${runner.serverId}
                      and cap.chat_id = ${chatsTable.parentChatId}
                      and cap.agent_id = ${runner.agentId}
                )
                or exists (
                    select 1 from chats parent_dm
                    where parent_dm.server_id = ${runner.serverId}
                      and parent_dm.id = ${chatsTable.parentChatId}
                      and parent_dm.kind = 'dm'
                      and parent_dm.dm_agent_id = ${runner.agentId}
                )
            )
        )
    )`;
}

function shortMessageId(id: string) {
    return id.startsWith('msg_') ? id.slice(4, 12) : id;
}
