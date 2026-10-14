import { and, eq } from 'drizzle-orm';
import { requireChatAccess } from '../chats/chat-access.ts';
import { isVisibleGeneratedImage } from '../image-generation/image-generation-visibility.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { attachmentsTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
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

    // A generated image has no Chat or Message; it is visible exactly when its generation is.
    let generated = false;
    if (attachment.chatId) {
        await requireChatAccess(db, member, {
            chatId: attachment.chatId,
            serverId: attachment.serverId,
        });
    } else {
        await requireServerMembership(db, member, attachment.serverId);
        generated =
            member !== null &&
            (await isVisibleGeneratedImage(db, {
                attachmentId: attachment.id,
                serverId: attachment.serverId,
                viewer: { kind: 'user', userId: member.id },
            }));
        if (!generated) {
            throw new AttachmentUploadError(
                'That attachment is not available for download.',
                'forbidden'
            );
        }
    }

    if (
        attachment.state !== 'ready' ||
        attachment.byteSize === null ||
        (!generated && attachment.messageId === null && attachment.uploaderUserId !== member?.id)
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
