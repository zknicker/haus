import { and, eq } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, chatsTable, tasksTable } from '../postgres/schema.ts';
import { AgentTargetError, resolveAgentTarget } from './resolve-target.ts';

/**
 * Send-only resolver (ADR 0062): an agent reads any Captain or Task chat, but sends with
 * `message send` only into its own. Other agents reach a Task with `haus task send`, and a Task
 * agent posts nowhere but its own chat.
 */
export async function resolveAgentSendTarget(
    db: HausDatabase,
    runner: ResolvedRunner,
    target: string
): Promise<string> {
    const chatId = await resolveAgentTarget(db, runner, target);
    const [chat] = await db
        .select({
            captainAgentId: chatsTable.captainAgentId,
            kind: chatsTable.kind,
            taskAgentId: tasksTable.agentId,
        })
        .from(chatsTable)
        .leftJoin(
            tasksTable,
            and(eq(tasksTable.serverId, chatsTable.serverId), eq(tasksTable.chatId, chatsTable.id))
        )
        .where(and(eq(chatsTable.serverId, runner.serverId), eq(chatsTable.id, chatId)))
        .limit(1);
    const [sender] = await db
        .select({ kind: agentsTable.kind })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, runner.serverId), eq(agentsTable.id, runner.agentId)))
        .limit(1);
    if (!(chat && sender)) {
        throw new AgentTargetError();
    }
    if (chat.kind === 'captain' && chat.captainAgentId !== runner.agentId) {
        throw new AgentTargetError(
            'Only that Captain posts in its chat. Reach it with an @mention in a Project chat.'
        );
    }
    if (chat.kind === 'task' && chat.taskAgentId !== runner.agentId) {
        throw new AgentTargetError(
            `Only that Task posts in its own chat. Message it with haus task send <id>.`
        );
    }
    if (sender.kind === 'task' && chat.kind !== 'task') {
        throw new AgentTargetError('A Task posts only in its own chat.');
    }
    return chatId;
}
