import type { AgentHome, AgentSetHomeInput } from '@haus/api';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { requireChatWriteAccess } from '../chats/chat-access.ts';
import { prepareLifecycleEvent } from '../chats/lifecycle-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, chatsTable, projectsTable, taskKeysTable } from '../postgres/schema.ts';
import { projectUpdatedTopic } from '../realtime/topics.ts';
import { AgentConfigDeniedError } from '../server-agents/agent-config-errors.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { CoveHomeFixedError, ProjectNotFoundError } from './project-errors.ts';

export async function setAgentHome(
    db: HausDatabase,
    member: HausUser | null,
    input: AgentSetHomeInput
) {
    const home = await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireHomeProject(tx, member, input);
        const [agent] = await tx
            .select({
                factoryKind: agentsTable.factoryKind,
                homeProjectId: agentsTable.homeProjectId,
                retiredAt: agentsTable.retiredAt,
            })
            .from(agentsTable)
            .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)))
            .limit(1);
        if (!agent) {
            throw new AgentConfigDeniedError('That Agent does not exist on this Server.');
        }
        if (agent.retiredAt) {
            throw new AgentConfigDeniedError('A retired Agent has no home to move.');
        }
        if (agent.factoryKind === 'cove' && agent.homeProjectId !== input.projectId) {
            throw new CoveHomeFixedError();
        }
        if (agent.homeProjectId !== input.projectId) {
            await moveAgentHome(tx, input);
        }
        return {
            agentId: input.agentId,
            homeProjectId: input.projectId,
            previousProjectId: agent.homeProjectId,
        } satisfies AgentHome;
    });
    const moved = home.previousProjectId !== home.homeProjectId;
    const events = moved
        ? homeChangeEvents(input.serverId, [home.previousProjectId, home.homeProjectId])
        : [];
    return { events, home };
}

export async function moveAgentHome(
    db: Pick<HausDatabase, 'execute' | 'update'>,
    input: { agentId: string; projectId: string; serverId: string }
) {
    await db
        .update(agentsTable)
        .set({ homeProjectId: input.projectId })
        .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)));
    await openAgentHomeReads(db, input);
}

export function homeChangeEvents(serverId: string, projectIds: readonly string[]) {
    return projectIds.flatMap((projectId) => [
        prepareLifecycleEvent({ chatId: projectId, serverId }, 'updated'),
        projectUpdatedTopic.prepare({ projectId, serverId }),
    ]);
}

export async function openAgentHomeReads(
    db: Pick<HausDatabase, 'execute'>,
    input: { agentId: string; projectId: string; serverId: string }
) {
    await db.execute(sql`
        insert into agent_chat_reads (server_id, agent_id, chat_id, sequence)
        select heard.server_id, ${input.agentId}, heard.id, heard.last_message_sequence
        from chats heard
        where heard.server_id = ${input.serverId}
          and heard.deleted_at is null
          and (heard.id = ${input.projectId} or heard.parent_chat_id = ${input.projectId})
        on conflict (server_id, agent_id, chat_id) do update
        set sequence = greatest(agent_chat_reads.sequence, excluded.sequence), updated_at = now()
    `);
}

export async function requireHomeProject(
    db: HausDatabase,
    member: HausUser | null,
    input: { projectId: string; serverId: string }
) {
    await requireChatWriteAccess(db, member, { chatId: input.projectId, serverId: input.serverId });
    const [project] = await db
        .select({ id: projectsTable.chatId })
        .from(projectsTable)
        .where(
            and(
                eq(projectsTable.serverId, input.serverId),
                eq(projectsTable.chatId, input.projectId)
            )
        )
        .limit(1);
    if (!project) {
        throw new ProjectNotFoundError();
    }
}

export async function findLiveProjectByKey(
    db: Pick<HausDatabase, 'select'>,
    input: { key: string; serverId: string }
) {
    const [project] = await db
        .select({ id: projectsTable.chatId, key: taskKeysTable.key })
        .from(projectsTable)
        .innerJoin(
            taskKeysTable,
            and(
                eq(taskKeysTable.serverId, projectsTable.serverId),
                eq(taskKeysTable.id, projectsTable.taskKeyId)
            )
        )
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, projectsTable.serverId),
                eq(chatsTable.id, projectsTable.chatId)
            )
        )
        .where(
            and(
                eq(projectsTable.serverId, input.serverId),
                eq(taskKeysTable.key, input.key),
                isNull(chatsTable.archivedAt),
                isNull(chatsTable.deletedAt)
            )
        )
        .limit(1);
    return project ?? null;
}

export async function readAgentHomeKey(
    db: Pick<HausDatabase, 'select'>,
    input: { agentId: string; serverId: string }
) {
    const [home] = await db
        .select({ key: taskKeysTable.key })
        .from(agentsTable)
        .innerJoin(
            projectsTable,
            and(
                eq(projectsTable.serverId, agentsTable.serverId),
                eq(projectsTable.chatId, agentsTable.homeProjectId)
            )
        )
        .innerJoin(
            taskKeysTable,
            and(
                eq(taskKeysTable.serverId, projectsTable.serverId),
                eq(taskKeysTable.id, projectsTable.taskKeyId)
            )
        )
        .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)))
        .limit(1);
    if (!home) {
        throw new Error(`Agent ${input.agentId} has no home Project.`);
    }
    return home.key;
}
