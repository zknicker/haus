import type { TaskAssignee } from '@haus/api';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { avatarUrlFor } from '../avatars/avatar-url.ts';
import { requireChatAccess } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, channelAgentParticipantsTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { TaskNotFoundError } from './task-errors.ts';
import { findMessageTask } from './task-shape.ts';

export async function listTaskAssignees(
    db: HausDatabase,
    member: HausUser | null,
    input: { messageId: string; serverId: string }
): Promise<TaskAssignee[]> {
    await requireServerMembership(db, member, input.serverId);
    const task = await findMessageTask(db, input.serverId, input.messageId);
    if (!task) {
        throw new TaskNotFoundError();
    }
    const chat = await requireChatAccess(db, member, {
        chatId: task.chatId,
        serverId: input.serverId,
    });
    // Only an Agent holds a task (ADR 0037); the picker lists the Chat's Agents.
    return await listAssignableAgents(db, {
        chatId: task.chatId,
        dmAgentId: chat.dmAgentId,
        kind: chat.kind,
        serverId: input.serverId,
    });
}

async function listAssignableAgents(
    db: HausDatabase,
    input: { chatId: string; dmAgentId: null | string; kind: string; serverId: string }
): Promise<TaskAssignee[]> {
    const selection = {
        agentId: agentsTable.id,
        avatarId: agentsTable.avatarId,
        displayName: agentsTable.displayName,
        handle: agentsTable.handle,
    };
    // A retired Agent will never wake, so it must never be offered.
    const active = and(eq(agentsTable.serverId, input.serverId), isNull(agentsTable.retiredAt));
    const rows =
        input.kind === 'dm'
            ? input.dmAgentId
                ? await db
                      .select(selection)
                      .from(agentsTable)
                      .where(and(active, eq(agentsTable.id, input.dmAgentId)))
                : []
            : await db
                  .select(selection)
                  .from(agentsTable)
                  .innerJoin(
                      channelAgentParticipantsTable,
                      and(
                          eq(channelAgentParticipantsTable.serverId, agentsTable.serverId),
                          eq(channelAgentParticipantsTable.agentId, agentsTable.id)
                      )
                  )
                  .where(and(active, eq(channelAgentParticipantsTable.chatId, input.chatId)))
                  .orderBy(asc(agentsTable.displayName));

    return rows.map(
        (row): TaskAssignee => ({
            agentId: row.agentId,
            avatarUrl: avatarUrlFor(row.avatarId),
            displayName: row.displayName,
            handle: row.handle,
        })
    );
}
