import type { AttachmentMetadata } from '@haus/api';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { attachmentsTable } from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';

type AttachmentReader = Pick<HausDatabase, 'select'>;
type AttachmentWriter = AttachmentReader & Pick<HausDatabase, 'update'>;

export class AttachmentAssociationError extends Error {
    constructor() {
        super('Every attachment must be ready, unassociated, and owned by this message author.');
        this.name = 'AttachmentAssociationError';
    }
}

export async function requireMessageAttachments(
    db: AttachmentReader,
    member: HausUser,
    input: {
        attachmentIds: string[];
        chatId: string;
        serverId: string;
    }
) {
    if (input.attachmentIds.length === 0) {
        return [];
    }

    const rows = await db
        .select()
        .from(attachmentsTable)
        .where(
            and(
                eq(attachmentsTable.serverId, input.serverId),
                eq(attachmentsTable.chatId, input.chatId),
                inArray(attachmentsTable.id, input.attachmentIds)
            )
        );
    const byId = new Map(rows.map((row) => [row.id, row]));
    const ordered = input.attachmentIds.map((id) => byId.get(id));

    if (
        ordered.some(
            (attachment) =>
                !attachment ||
                attachment.state !== 'ready' ||
                attachment.messageId !== null ||
                attachment.uploaderUserId !== member.id ||
                attachment.byteSize === null
        )
    ) {
        throw new AttachmentAssociationError();
    }

    return ordered as (typeof attachmentsTable.$inferSelect & { byteSize: number })[];
}

export async function requireAgentMessageAttachments(
    db: AttachmentReader,
    agentId: string,
    input: { attachmentIds: string[]; chatId: string; serverId: string }
) {
    if (input.attachmentIds.length === 0) {
        return [];
    }
    const rows = await db
        .select()
        .from(attachmentsTable)
        .where(
            and(
                eq(attachmentsTable.serverId, input.serverId),
                inArray(attachmentsTable.id, input.attachmentIds)
            )
        );
    const byId = new Map(rows.map((row) => [row.id, row]));
    const ordered = input.attachmentIds.map((id) => byId.get(id));
    if (
        ordered.some(
            (attachment) =>
                !attachment ||
                attachment.state !== 'ready' ||
                attachment.messageId !== null ||
                attachment.uploaderAgentId !== agentId ||
                attachment.byteSize === null ||
                (attachment.chatId !== null && attachment.chatId !== input.chatId)
        )
    ) {
        throw new AttachmentAssociationError();
    }
    return ordered as (typeof attachmentsTable.$inferSelect & { byteSize: number })[];
}

export async function associateMessageAttachments(
    db: AttachmentWriter,
    attachments: (typeof attachmentsTable.$inferSelect)[],
    messageId: string,
    chatId: string
) {
    for (const [position, attachment] of attachments.entries()) {
        const [associated] = await db
            .update(attachmentsTable)
            .set({
                chatId,
                messageId,
                messagePosition: position,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(attachmentsTable.serverId, attachment.serverId),
                    eq(attachmentsTable.id, attachment.id),
                    eq(attachmentsTable.state, 'ready'),
                    isNull(attachmentsTable.messageId)
                )
            )
            .returning({ id: attachmentsTable.id });

        if (!associated) {
            throw new AttachmentAssociationError();
        }
    }
}

export async function readMessageAttachments(
    db: AttachmentReader,
    serverId: string,
    messageIds: string[]
) {
    const byMessage = new Map<string, AttachmentMetadata[]>();
    if (messageIds.length === 0) {
        return byMessage;
    }

    const rows = await db
        .select({
            byteSize: attachmentsTable.byteSize,
            filename: attachmentsTable.filename,
            id: attachmentsTable.id,
            mediaType: attachmentsTable.mediaType,
            messageId: attachmentsTable.messageId,
        })
        .from(attachmentsTable)
        .where(
            and(
                eq(attachmentsTable.serverId, serverId),
                inArray(attachmentsTable.messageId, messageIds),
                eq(attachmentsTable.state, 'ready')
            )
        )
        .orderBy(asc(attachmentsTable.messagePosition));

    for (const row of rows) {
        if (row.messageId === null || row.byteSize === null) {
            throw new Error('Associated attachment metadata is incomplete.');
        }
        const metadata = {
            filename: row.filename,
            id: row.id,
            mediaType: row.mediaType,
            sizeBytes: row.byteSize,
        };
        const existing = byMessage.get(row.messageId) ?? [];
        existing.push(metadata);
        byMessage.set(row.messageId, existing);
    }

    return byMessage;
}

export function attachmentMetadata(
    attachments: (typeof attachmentsTable.$inferSelect & { byteSize: number })[]
) {
    return attachments.map((attachment) => ({
        filename: attachment.filename,
        id: attachment.id,
        mediaType: attachment.mediaType,
        sizeBytes: attachment.byteSize,
    }));
}
