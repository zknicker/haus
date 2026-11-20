import type { Project } from '@haus/api';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { listChats } from '../chats/list-chats.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, computersTable, projectsTable, taskKeysTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { computerNameSql, defaultWorkerPlaceOf, readProjectRepos } from './project-worker-read.ts';

type Reader = Pick<HausDatabase, 'select'>;

export async function listProjects(
    db: Reader,
    member: Pick<HausUser, 'id'> | null,
    serverId: string
) {
    await requireServerMembership(db, member, serverId);
    return await readProjects(db, serverId);
}

export async function readProjectResult(
    db: HausDatabase,
    member: Pick<HausUser, 'id'> | null,
    input: { chatId: string; serverId: string }
) {
    const [project] = await readProjects(db, input.serverId, input.chatId);
    const chat = (await listChats(db, member, input.serverId)).find(
        (candidate) => candidate.id === input.chatId
    );
    if (!(chat && project)) {
        throw new Error(`Failed to reload Project ${input.chatId}.`);
    }
    return { chat, project };
}

async function readProjects(db: Reader, serverId: string, chatId?: string) {
    const rows = await db
        .select({
            chatId: projectsTable.chatId,
            defaultWorkerComputerId: projectsTable.defaultWorkerComputerId,
            defaultWorkerComputerName: computerNameSql,
            defaultWorkerPlace: projectsTable.defaultWorkerPlace,
            homeAgentIds: sql<string[]>`coalesce((
                select array_agg(agent.id order by agent.created_at, agent.id) from agents agent
                where agent.server_id = ${projectsTable.serverId}
                    and agent.home_project_id = ${projectsTable.chatId}
                    and agent.retired_at is null
            ), '{}')`,
            isHaus: chatsTable.isAll,
            key: taskKeysTable.key,
            keyEditable: sql<boolean>`not exists (
                select 1 from tasks
                where tasks.server_id = ${projectsTable.serverId}
                    and tasks.key_id = ${projectsTable.taskKeyId}
            )`,
            name: chatsTable.name,
            serverId: projectsTable.serverId,
            taskKeyId: projectsTable.taskKeyId,
        })
        .from(projectsTable)
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, projectsTable.serverId),
                eq(chatsTable.id, projectsTable.chatId)
            )
        )
        .innerJoin(
            taskKeysTable,
            and(
                eq(taskKeysTable.serverId, projectsTable.serverId),
                eq(taskKeysTable.id, projectsTable.taskKeyId)
            )
        )
        .leftJoin(
            computersTable,
            and(
                eq(computersTable.serverId, projectsTable.serverId),
                eq(computersTable.id, projectsTable.defaultWorkerComputerId)
            )
        )
        .where(
            and(
                eq(projectsTable.serverId, serverId),
                isNull(chatsTable.deletedAt),
                chatId === undefined ? undefined : eq(projectsTable.chatId, chatId)
            )
        )
        .orderBy(asc(chatsTable.name));
    const repos = await readProjectRepos(
        db,
        serverId,
        rows.map((row) => row.chatId)
    );
    return rows.map(
        ({
            defaultWorkerComputerId,
            defaultWorkerComputerName,
            defaultWorkerPlace,
            name,
            ...row
        }) => {
            if (name === null) {
                throw new Error(`Project ${row.chatId} has a channel with no name.`);
            }
            return {
                ...row,
                defaultWorkerPlace: defaultWorkerPlaceOf({
                    defaultWorkerComputerId,
                    defaultWorkerComputerName,
                    defaultWorkerPlace,
                }),
                name,
                repos: repos.get(row.chatId) ?? [],
            } satisfies Project;
        }
    );
}
