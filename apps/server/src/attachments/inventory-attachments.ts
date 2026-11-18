import type { AttachmentInventory } from '@haus/api';
import { asc, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { attachmentsTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import type { AttachmentRoot } from './attachment-root.ts';

export class AttachmentInventoryDeniedError extends Error {
    constructor() {
        super('Only a Server Owner or Admin can inventory attachments.');
        this.name = 'AttachmentInventoryDeniedError';
    }
}

export async function inventoryServerAttachments(
    db: HausDatabase,
    root: AttachmentRoot,
    member: HausUser | null,
    serverId: string
): Promise<AttachmentInventory> {
    const server = await requireServerMembership(db, member, serverId);
    if (server.role !== 'owner' && server.role !== 'admin') {
        throw new AttachmentInventoryDeniedError();
    }

    const rows = await db
        .select({
            attachmentId: attachmentsTable.id,
            messageId: attachmentsTable.messageId,
            stagingKey: attachmentsTable.stagingKey,
            state: attachmentsTable.state,
        })
        .from(attachmentsTable)
        .where(eq(attachmentsTable.serverId, serverId))
        .orderBy(asc(attachmentsTable.id));
    const files = await root.listKeys(serverId);

    return {
        attachments: rows.map((row) => ({
            attachmentId: row.attachmentId,
            expectedObjectKey: root.objectKey(serverId, row.attachmentId),
            expectedStagingKey: row.stagingKey ? root.stagingKey(serverId, row.stagingKey) : null,
            messageId: row.messageId,
            state: row.state,
        })),
        objectKeys: files.objectKeys,
        serverId,
        stagingKeys: files.stagingKeys,
    };
}
