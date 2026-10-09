import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { AttachmentRoot } from '../attachments/attachment-root.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    agentsTable,
    attachmentsTable,
    chatMessagesTable,
    chatsTable,
} from '../postgres/schema.ts';
import previewPath from './seed-attachments/cove-avatar-experiment.png' with { type: 'file' };

const seedNonce = 'dev-image-preview';
const stagingKey = 'upl_devimagepreview0';

/** Keeps one real hosted image in the development transcript for visual checks. */
export async function ensureDevelopmentChatAttachment(
    db: HausDatabase,
    root: AttachmentRoot,
    serverId: string
) {
    const bytes = new Uint8Array(await Bun.file(previewPath).arrayBuffer());
    const sha256 = digest(bytes);

    const attachmentId = await db.transaction(async (tx) => {
        const [agent] = await tx
            .select({ id: agentsTable.id })
            .from(agentsTable)
            .where(
                and(
                    eq(agentsTable.serverId, serverId),
                    eq(agentsTable.handle, 'blippy'),
                    isNull(agentsTable.retiredAt)
                )
            )
            .limit(1);
        if (!agent) {
            throw new Error('The development image attachment needs Blippy.');
        }

        const [existingAttachment] = await tx
            .select()
            .from(attachmentsTable)
            .where(
                and(
                    eq(attachmentsTable.serverId, serverId),
                    eq(attachmentsTable.uploaderAgentId, agent.id),
                    eq(attachmentsTable.uploadNonce, seedNonce)
                )
            )
            .limit(1);
        if (existingAttachment) {
            if (
                existingAttachment.serverId !== serverId ||
                existingAttachment.byteSize !== bytes.byteLength ||
                existingAttachment.sha256 !== sha256 ||
                existingAttachment.state !== 'ready'
            ) {
                throw new Error('The development image attachment does not match its seed.');
            }
            return existingAttachment.id;
        }

        const [chat] = await tx
            .select({
                id: chatsTable.id,
                lastMessageSequence: chatsTable.lastMessageSequence,
            })
            .from(chatsTable)
            .where(and(eq(chatsTable.serverId, serverId), eq(chatsTable.isAll, true)))
            .limit(1)
            .for('update');
        if (!chat) {
            throw new Error('The development image attachment needs the #all Chat.');
        }

        const now = new Date();
        const nextAttachmentId = createOpaqueId('att');
        const messageId = createOpaqueId('msg');
        const sequence = chat.lastMessageSequence + 1;
        await tx.insert(chatMessagesTable).values({
            authorAgentId: agent.id,
            chatId: chat.id,
            content:
                'Here’s a generated avatar image so the attachment preview stays easy to inspect.',
            id: messageId,
            nonce: seedNonce,
            replyRootMessageId: messageId,
            sequence,
            serverId,
        });
        await tx.insert(attachmentsTable).values({
            byteSize: bytes.byteLength,
            chatId: chat.id,
            filename: 'cove-avatar-experiment.png',
            id: nextAttachmentId,
            mediaType: 'image/png',
            messageId,
            messagePosition: 0,
            readyAt: now,
            serverId,
            sha256,
            state: 'ready',
            uploadNonce: seedNonce,
            uploaderAgentId: agent.id,
        });
        await tx
            .update(chatsTable)
            .set({ lastActivityAt: now, lastMessageSequence: sequence })
            .where(and(eq(chatsTable.serverId, serverId), eq(chatsTable.id, chat.id)));
        return nextAttachmentId;
    });

    await ensureAttachmentBytes(root, serverId, attachmentId, bytes, sha256);
}

async function ensureAttachmentBytes(
    root: AttachmentRoot,
    serverId: string,
    attachmentId: string,
    bytes: Uint8Array,
    expectedSha256: string
) {
    const existing = await readAttachmentBytes(root, serverId, attachmentId);
    if (existing) {
        if (existing.byteLength !== bytes.byteLength || digest(existing) !== expectedSha256) {
            throw new Error('The development image attachment bytes do not match their seed.');
        }
        return;
    }

    await root.discardStagingFile(serverId, stagingKey);
    const staged = await root.createStagingFile(serverId, stagingKey);
    let finalized = false;
    try {
        await staged.writeFile(bytes);
        await staged.sync();
        await staged.close();
        await root.finalize(serverId, attachmentId, stagingKey);
        finalized = true;
    } finally {
        await staged.close().catch(() => undefined);
        if (!finalized) {
            await root.discardStagingFile(serverId, stagingKey).catch(() => undefined);
        }
    }
}

async function readAttachmentBytes(root: AttachmentRoot, serverId: string, attachmentId: string) {
    try {
        const file = await root.openObject(serverId, attachmentId);
        try {
            return new Uint8Array(await file.readFile());
        } finally {
            await file.close();
        }
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}

function digest(bytes: Uint8Array) {
    return createHash('sha256').update(bytes).digest('hex');
}
