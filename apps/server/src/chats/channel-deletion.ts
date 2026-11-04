import { and, eq, inArray, isNotNull, or } from 'drizzle-orm';
import type { AttachmentRoot } from '../attachments/attachment-root.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    attachmentsTable,
    chatsTable,
    remindersTable,
    serverOnboardingTable,
    triggersTable,
} from '../postgres/schema.ts';
import { publishRealtime } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
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
    if (await isOnboardingChannel(db, input)) {
        // Deletion now refuses this channel; a tombstone from before that
        // refusal is restored instead of purged, before any bytes are discarded.
        await db
            .update(chatsTable)
            .set({ deletedAt: null, deletedByUserId: null })
            .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)));
        return;
    }

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
        return;
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

    const taskEvents = await db.transaction(async (tx) => {
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
            return [];
        }

        const anchored = and(
            eq(remindersTable.serverId, input.serverId),
            inArray(remindersTable.anchorChatId, chatIds)
        );
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
        const childIds = chatIds.filter((id) => id !== input.chatId);
        if (childIds.length > 0) {
            await tx.delete(chatsTable).where(inArray(chatsTable.id, childIds));
        }
        await tx
            .delete(chatsTable)
            .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)));
        return events;
    });
    publishRealtime(taskEvents);
}

/** The durable onboarding record names this channel forever, so it is never purged. */
export async function isOnboardingChannel(db: HausDatabase, input: DeletedChannelTarget) {
    const [row] = await db
        .select({ channelId: serverOnboardingTable.channelId })
        .from(serverOnboardingTable)
        .where(
            and(
                eq(serverOnboardingTable.serverId, input.serverId),
                eq(serverOnboardingTable.channelId, input.chatId)
            )
        );
    return row !== undefined;
}
