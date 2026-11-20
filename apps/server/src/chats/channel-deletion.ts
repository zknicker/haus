import { and, eq, inArray, isNotNull, or } from 'drizzle-orm';
import type { AttachmentRoot } from '../attachments/attachment-root.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    attachmentsTable,
    chatsTable,
    remindersTable,
    triggersTable,
} from '../postgres/schema.ts';
import { publishRealtime } from '../realtime/topic.ts';
import { remindersAnchoredIn } from '../reminders/anchored-reminders.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { deleteTasksOfRemovedChats } from '../tasks/task-chat-removal.ts';
import { prepareTaskLinkEvents, readReminderTaskIds } from '../tasks/task-reference-links.ts';

interface DeletedChannelTarget {
    chatId: string;
    serverId: string;
}

export async function purgeDeletedChannels(db: HausDatabase, root: AttachmentRoot) {
    const channels = await db
        .select({ chatId: chatsTable.id, serverId: chatsTable.serverId })
        .from(chatsTable)
        .where(
            and(
                eq(chatsTable.kind, 'channel'),
                eq(chatsTable.isAll, false),
                isNotNull(chatsTable.deletedAt)
            )
        );
    for (const channel of channels) {
        await purgeDeletedChannel(db, root, channel);
    }
}

export async function purgeDeletedChannel(
    db: HausDatabase,
    root: AttachmentRoot,
    input: DeletedChannelTarget
) {
    const chats = await db
        .select({ id: chatsTable.id })
        .from(chatsTable)
        .where(
            and(
                eq(chatsTable.serverId, input.serverId),
                or(eq(chatsTable.id, input.chatId), eq(chatsTable.parentChatId, input.chatId))
            )
        );
    const chatIds = chats.map(({ id }) => id);
    if (chatIds.length === 0) {
        return [];
    }

    await root.discardAttachments(
        input.serverId,
        async () =>
            await db
                .select({
                    attachmentId: attachmentsTable.id,
                    stagingKey: attachmentsTable.stagingKey,
                })
                .from(attachmentsTable)
                .where(
                    and(
                        eq(attachmentsTable.serverId, input.serverId),
                        inArray(attachmentsTable.chatId, chatIds)
                    )
                )
    );

    const purged = await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const [deleted] = await tx
            .select({ id: chatsTable.id })
            .from(chatsTable)
            .where(
                and(
                    eq(chatsTable.serverId, input.serverId),
                    eq(chatsTable.id, input.chatId),
                    eq(chatsTable.kind, 'channel'),
                    isNotNull(chatsTable.deletedAt)
                )
            );
        if (!deleted) {
            return { events: [], workerFrames: [] };
        }

        const anchored = remindersAnchoredIn(tx, { chatIds, serverId: input.serverId });
        // The links cascade with the Reminders, so read them first.
        const reminders = await tx
            .select({ id: remindersTable.id })
            .from(remindersTable)
            .where(anchored);
        const events = await prepareTaskLinkEvents(tx, {
            serverId: input.serverId,
            taskIds: await readReminderTaskIds(tx, {
                reminderIds: reminders.map((reminder) => reminder.id),
                serverId: input.serverId,
            }),
        });
        await tx.delete(remindersTable).where(anchored);
        // Triggers anchored in the aggregate, tombstones included, go with it;
        // their fires cascade and message causes keep their own snapshots.
        await tx
            .delete(triggersTable)
            .where(
                and(
                    eq(triggersTable.serverId, input.serverId),
                    inArray(triggersTable.anchorChatId, chatIds)
                )
            );
        const deletedTasks = await deleteTasksOfRemovedChats(tx, {
            chatIds,
            serverId: input.serverId,
        });
        await rehomeRetiredAgents(tx, input);
        const childIds = chatIds.filter((id) => id !== input.chatId);
        if (childIds.length > 0) {
            await tx.delete(chatsTable).where(inArray(chatsTable.id, childIds));
        }
        await tx
            .delete(chatsTable)
            .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)));
        return {
            events: [...events, ...deletedTasks.events],
            workerFrames: deletedTasks.workerFrames,
        };
    });
    publishRealtime(purged.events);
    return purged.workerFrames;
}

/** Deletion refuses a Project with home Agents; a retired Agent homed here keeps no home. */
async function rehomeRetiredAgents(tx: HausDatabase, input: DeletedChannelTarget) {
    const homedHere = and(
        eq(agentsTable.serverId, input.serverId),
        eq(agentsTable.homeProjectId, input.chatId)
    );
    const [homed] = await tx
        .select({ id: agentsTable.id })
        .from(agentsTable)
        .where(homedHere)
        .limit(1);
    if (homed) {
        await tx.update(agentsTable).set({ homeProjectId: null }).where(homedHere);
    }
}
