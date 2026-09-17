import { and, eq } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, type messageTasksTable, serverMembershipsTable } from '../postgres/schema.ts';
import { type MessageRow, targetForChat, toAgentMessages } from './message-view.ts';
import { AgentTargetError } from './resolve-target.ts';

export async function taskRow(
    db: HausDatabase,
    runner: ResolvedRunner,
    messageRow: MessageRow,
    task: typeof messageTasksTable.$inferSelect
) {
    const [message] = await toAgentMessages(db, runner.serverId, [messageRow]);
    const assignee = task.assigneeAgentId
        ? {
              handle: await agentHandle(db, { ...runner, agentId: task.assigneeAgentId }),
              id: task.assigneeAgentId,
          }
        : task.assigneeUserId
          ? {
                handle: await humanHandle(db, runner.serverId, task.assigneeUserId),
                id: task.assigneeUserId,
            }
          : null;
    return {
        assignee,
        message,
        number: task.number,
        status: task.status,
        target: await targetForChat(db, runner.serverId, task.chatId),
        version: task.version,
    };
}

export async function agentHandle(
    db: HausDatabase,
    runner: Pick<ResolvedRunner, 'agentId' | 'serverId'>
) {
    const [agent] = await db
        .select({ handle: agentsTable.handle })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, runner.serverId), eq(agentsTable.id, runner.agentId)));
    if (!agent) {
        throw new AgentTargetError('This Agent no longer exists.');
    }
    return agent.handle;
}

export async function humanHandle(db: HausDatabase, serverId: string, userId: string) {
    const [human] = await db
        .select({ handle: serverMembershipsTable.handle })
        .from(serverMembershipsTable)
        .where(
            and(
                eq(serverMembershipsTable.serverId, serverId),
                eq(serverMembershipsTable.userId, userId)
            )
        );
    return human?.handle ?? null;
}

export function stripAt(value: string) {
    return value.startsWith('@') ? value.slice(1) : value;
}
