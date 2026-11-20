import type { ProjectCreateInput } from '@haus/api';
import { prepareLifecycleEvent } from '../chats/lifecycle-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { projectUpdatedTopic } from '../realtime/topics.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { insertProject } from './insert-project.ts';
import { readProjectResult } from './project-read.ts';

export async function createProject(
    db: HausDatabase,
    member: HausUser | null,
    input: ProjectCreateInput
) {
    const chatId = createOpaqueId('cht');
    await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireServerMembership(tx, member, input.serverId);
        if (!member) {
            throw new Error('Authenticated Server membership requires a Haus User.');
        }
        await insertProject(tx, {
            chat: {
                color: input.color ?? null,
                description: input.description ?? null,
                icon: input.icon ?? null,
                id: chatId,
                name: input.name,
            },
            key: input.key,
            serverId: input.serverId,
            userIds: [member.id],
        });
    });

    const target = { chatId, serverId: input.serverId };
    return {
        ...(await readProjectResult(db, member, target)),
        events: [
            prepareLifecycleEvent(target, 'created'),
            projectUpdatedTopic.prepare({ projectId: chatId, serverId: input.serverId }),
        ],
    };
}
