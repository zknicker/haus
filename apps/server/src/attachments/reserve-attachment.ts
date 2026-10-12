import type { AttachmentReservation, AttachmentReserveInput } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { requireChatWriteAccess } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { attachmentsTable } from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';

export const attachmentMaxSizeBytes = 50 * 1024 * 1024;

export class AttachmentNonceConflictError extends Error {
    constructor() {
        super('That attachment nonce already belongs to a different upload.');
        this.name = 'AttachmentNonceConflictError';
    }
}

export async function reserveAttachment(
    db: HausDatabase,
    member: HausUser | null,
    input: AttachmentReserveInput
): Promise<AttachmentReservation> {
    await requireChatWriteAccess(db, member, input);

    if (!member) {
        throw new Error('An attachment uploader is required.');
    }

    const [created] = await db
        .insert(attachmentsTable)
        .values({
            chatId: input.chatId,
            filename: input.filename,
            id: createOpaqueId('att'),
            mediaType: input.mediaType,
            serverId: input.serverId,
            state: 'pending',
            uploadNonce: input.nonce,
            uploaderUserId: member.id,
        })
        .onConflictDoNothing()
        .returning({ id: attachmentsTable.id, state: attachmentsTable.state });

    if (created) {
        return {
            attachmentId: created.id,
            idempotent: false,
            maxSizeBytes: attachmentMaxSizeBytes,
            state: created.state,
        };
    }

    const [existing] = await db
        .select()
        .from(attachmentsTable)
        .where(
            and(
                eq(attachmentsTable.serverId, input.serverId),
                eq(attachmentsTable.uploaderUserId, member.id),
                eq(attachmentsTable.uploadNonce, input.nonce)
            )
        )
        .limit(1);

    if (
        !existing ||
        existing.chatId !== input.chatId ||
        existing.filename !== input.filename ||
        // Finalize stores the type the bytes resolve to, so a ready row may no
        // longer carry the declared type the retried reservation repeats.
        (existing.mediaType !== input.mediaType && !isFinalizedState(existing.state))
    ) {
        throw new AttachmentNonceConflictError();
    }

    return {
        attachmentId: existing.id,
        idempotent: true,
        maxSizeBytes: attachmentMaxSizeBytes,
        state: existing.state,
    };
}

function isFinalizedState(state: AttachmentReservation['state']) {
    return state === 'finalizing' || state === 'ready';
}
