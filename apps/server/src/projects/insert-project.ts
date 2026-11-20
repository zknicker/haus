import type { HausDatabase } from '../postgres/connection.ts';
import { violatesConstraint } from '../postgres/constraint-violation.ts';
import { channelParticipantsTable, chatsTable, projectsTable } from '../postgres/schema.ts';
import { ChannelNameTakenError } from './project-errors.ts';
import { allocateProjectKey, insertProjectKey } from './project-key.ts';

export interface NewProject {
    chat: Omit<typeof chatsTable.$inferInsert, 'kind' | 'serverId'> & { id: string; name: string };
    key?: string;
    serverId: string;
    userIds: readonly string[];
}

export async function insertProject(tx: HausDatabase, input: NewProject) {
    const { serverId } = input;
    try {
        await tx.insert(chatsTable).values({ ...input.chat, kind: 'channel', serverId });
    } catch (error) {
        if (violatesConstraint(error, 'chats_server_channel_name_key')) {
            throw new ChannelNameTakenError();
        }
        throw error;
    }
    if (input.userIds.length > 0) {
        await tx
            .insert(channelParticipantsTable)
            .values(input.userIds.map((userId) => ({ chatId: input.chat.id, serverId, userId })));
    }
    const key = input.key ?? (await allocateProjectKey(tx, serverId, input.chat.name));
    const taskKeyId = await insertProjectKey(tx, { key, serverId });
    await tx.insert(projectsTable).values({ chatId: input.chat.id, serverId, taskKeyId });
    return { taskKeyId };
}
