import { and, asc, eq, isNull } from 'drizzle-orm';
import { requireChatWritable } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, chatsTable, projectsTable, taskKeysTable } from '../postgres/schema.ts';
import { TaskInvariantError, TaskProjectNotHomeError } from './task-errors.ts';

type Reader = Pick<HausDatabase, 'select'>;

/** The refusal for work in a Project that is not the Captain's home (ADR 0055). */
export async function notHomeProjectError(
    db: Reader,
    input: { projectId: string; serverId: string }
) {
    const project = await readProject(db, input);
    return new TaskProjectNotHomeError({
        channelName: project.name,
        homeAgentHandles: await readHomeAgentHandles(db, input),
    });
}

export async function requireFilingProject(
    db: Reader,
    input: { projectId: string; serverId: string }
) {
    const project = await readProject(db, input);
    await requireChatWritable(db, { chatId: project.projectId, serverId: input.serverId });
    return { projectId: project.projectId };
}

const projectColumns = {
    name: chatsTable.name,
    projectId: projectsTable.chatId,
};

async function readProject(db: Reader, input: { projectId: string; serverId: string }) {
    const [project] = await db
        .select(projectColumns)
        .from(projectsTable)
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
                eq(projectsTable.chatId, input.projectId),
                isNull(chatsTable.deletedAt)
            )
        )
        .limit(1);
    return requireNamed(project, 'That Project does not exist on this Server.');
}

export async function readProjectByKey(db: Reader, input: { key: string; serverId: string }) {
    const [project] = await db
        .select(projectColumns)
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
        .where(
            and(
                eq(projectsTable.serverId, input.serverId),
                eq(taskKeysTable.key, input.key),
                isNull(chatsTable.deletedAt)
            )
        )
        .limit(1);
    return requireNamed(project, `No Project has the key ${input.key}.`);
}

async function readHomeAgentHandles(db: Reader, input: { projectId: string; serverId: string }) {
    const agents = await db
        .select({ handle: agentsTable.handle })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, input.serverId),
                eq(agentsTable.homeProjectId, input.projectId),
                isNull(agentsTable.retiredAt)
            )
        )
        .orderBy(asc(agentsTable.createdAt), asc(agentsTable.id));
    return agents.map(({ handle }) => handle);
}

function requireNamed<Project extends { name: string | null }>(
    project: Project | undefined,
    missing: string
) {
    if (!project) {
        throw new TaskInvariantError(missing);
    }
    if (project.name === null) {
        throw new Error('A Project channel must have a name.');
    }
    return { ...project, name: project.name };
}
