import type { ProjectUpdateInput } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { requireChatWritable } from '../chats/chat-access.ts';
import { prepareLifecycleEvent } from '../chats/lifecycle-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { violatesConstraint } from '../postgres/constraint-violation.ts';
import { chatsTable, projectsTable, taskKeysTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { projectUpdatedTopic } from '../realtime/topics.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { ChannelNameTakenError, ProjectNotFoundError } from './project-errors.ts';
import { renameProjectKey } from './project-key.ts';
import { readProjectResult } from './project-read.ts';

const channelFields = ['color', 'description', 'icon', 'name'] as const;

export async function updateProject(
    db: HausDatabase,
    member: HausUser | null,
    input: ProjectUpdateInput
) {
    const changed = await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireServerMembership(tx, member, input.serverId);
        await requireChatWritable(tx, input);
        const [current] = await tx
            .select({
                color: chatsTable.color,
                description: chatsTable.description,
                icon: chatsTable.icon,
                key: taskKeysTable.key,
                name: chatsTable.name,
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
            .where(
                and(
                    eq(projectsTable.serverId, input.serverId),
                    eq(projectsTable.chatId, input.chatId)
                )
            );
        if (!current) {
            throw new ProjectNotFoundError();
        }

        const edits = Object.fromEntries(
            channelFields.flatMap((field) =>
                input[field] === undefined || input[field] === current[field]
                    ? []
                    : [[field, input[field]]]
            )
        );
        const channel = Object.keys(edits).length > 0;
        if (channel) {
            await updateChannelRow(tx, input, edits);
        }
        const key = input.key === undefined || input.key === current.key ? null : input.key;
        if (key !== null) {
            await renameProjectKey(tx, {
                key,
                serverId: input.serverId,
                taskKeyId: current.taskKeyId,
            });
        }
        return { channel, key: key !== null };
    });

    const target = { chatId: input.chatId, serverId: input.serverId };
    const events: PreparedRealtimeEvent[] = [
        ...(changed.channel ? [prepareLifecycleEvent(target, 'updated')] : []),
        ...(changed.channel || changed.key
            ? [projectUpdatedTopic.prepare({ projectId: input.chatId, serverId: input.serverId })]
            : []),
    ];
    return { ...(await readProjectResult(db, member, target)), events };
}

async function updateChannelRow(
    tx: Pick<HausDatabase, 'update'>,
    input: { chatId: string; serverId: string },
    edits: Partial<typeof chatsTable.$inferInsert>
) {
    try {
        await tx
            .update(chatsTable)
            .set(edits)
            .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)));
    } catch (error) {
        if (violatesConstraint(error, 'chats_server_channel_name_key')) {
            throw new ChannelNameTakenError();
        }
        throw error;
    }
}
