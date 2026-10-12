import { and, eq } from 'drizzle-orm';
import { requireChatAccess } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { attachmentsTable } from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import type { AttachmentRoot } from './attachment-root.ts';
import { AttachmentUploadError } from './upload-attachment.ts';

export async function openAttachmentDownload(
    db: HausDatabase,
    root: AttachmentRoot,
    member: HausUser | null,
    input: { attachmentId: string; serverId: string }
) {
    const [attachment] = await db
        .select()
        .from(attachmentsTable)
        .where(
            and(
                eq(attachmentsTable.serverId, input.serverId),
                eq(attachmentsTable.id, input.attachmentId)
            )
        )
        .limit(1);

    if (!attachment) {
        throw new AttachmentUploadError('No attachment was found in that Server.', 'not_found');
    }

    if (!attachment.chatId) {
        throw new AttachmentUploadError(
            'That attachment is not available for download.',
            'forbidden'
        );
    }
    await requireChatAccess(db, member, {
        chatId: attachment.chatId,
        serverId: attachment.serverId,
    });

    if (
        attachment.state !== 'ready' ||
        attachment.byteSize === null ||
        (attachment.messageId === null && attachment.uploaderUserId !== member?.id)
    ) {
        throw new AttachmentUploadError(
            'That attachment is not available for download.',
            'forbidden'
        );
    }

    const file = await root.openObject(attachment.serverId, attachment.id);
    const stat = await file.stat();
    if (stat.size !== attachment.byteSize) {
        await file.close();
        throw new Error('Attachment bytes do not match their PostgreSQL metadata.');
    }

    return {
        file,
        filename: attachment.filename,
        mediaType: attachment.mediaType,
        sizeBytes: attachment.byteSize,
    };
}
