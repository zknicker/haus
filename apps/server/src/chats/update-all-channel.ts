import type { AllChannelUpdateInput } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable } from '../postgres/schema.ts';
import { HausProjectNameError, ProjectNotFoundError } from '../projects/project-errors.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireChatWriteAccess } from './chat-access.ts';
import { getChat } from './get-chat.ts';
import { prepareLifecycleEvent } from './lifecycle-events.ts';

const editableFields = ['color', 'description', 'icon'] as const;

export async function updateAllChannel(
    db: HausDatabase,
    member: HausUser | null,
    input: AllChannelUpdateInput
) {
    const changed = await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireChatWriteAccess(tx, member, input);
        const [current] = await tx
            .select({
                color: chatsTable.color,
                description: chatsTable.description,
                icon: chatsTable.icon,
                name: chatsTable.name,
            })
            .from(chatsTable)
            .where(
                and(
                    eq(chatsTable.serverId, input.serverId),
                    eq(chatsTable.id, input.chatId),
                    eq(chatsTable.isAll, true)
                )
            );
        if (!current) {
            throw new ProjectNotFoundError();
        }
        if (input.name !== undefined && input.name !== current.name) {
            throw new HausProjectNameError();
        }
        const edits = Object.fromEntries(
            editableFields.flatMap((field) =>
                input[field] === undefined || input[field] === current[field]
                    ? []
                    : [[field, input[field]]]
            )
        );
        if (Object.keys(edits).length === 0) {
            return false;
        }
        await tx
            .update(chatsTable)
            .set(edits)
            .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)));
        return true;
    });

    const target = { chatId: input.chatId, serverId: input.serverId };
    return {
        chat: await getChat(db, member, target),
        events: changed ? [prepareLifecycleEvent(target, 'updated')] : [],
    };
}
