import { createHash } from 'node:crypto';
import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import type { AttachmentRoot } from '../attachments/attachment-root.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    agentDeliveryTable,
    agentInboxTable,
    agentRunnerCredentialsTable,
    agentsTable,
    avatarsTable,
    computersTable,
    reminderAgentAttentionTable,
    remindersTable,
    serverDeletionsTable,
    serverInvitationsTable,
    serverMembershipsTable,
    serversTable,
} from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireServerMembership } from './server-access.ts';
import { lockServerRow } from './server-lock.ts';

export class ServerDeleteDeniedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ServerDeleteDeniedError';
    }
}

/**
 * The danger-zone first half: one current Owner, typing the immutable slug
 * exactly, disables the whole Server in a single transaction. Membership,
 * invitation, and live runner authority are revoked and every Agent is retired,
 * so humans lose access and no Computer — online or not — can keep or mint
 * authority. The `deletedAt` tombstone makes every membership gate fail closed
 * at once. The heavy row-and-file purge runs afterward and never blocks here,
 * so deletion never waits on an offline machine.
 */
export async function markServerDeleting(
    db: HausDatabase,
    member: HausUser | null,
    input: { confirmation: string; serverId: string }
): Promise<{ deletionId: string; serverId: string; status: 'pending' }> {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const server = await requireServerMembership(tx, member, input.serverId);
        if (!member || server.role !== 'owner') {
            throw new ServerDeleteDeniedError('Only a Server Owner can delete this Server.');
        }
        if (input.confirmation !== server.slug) {
            throw new ServerDeleteDeniedError('Type the Server address exactly to delete it.');
        }

        const now = new Date();
        const deletionId = createOpaqueId('sdl');
        const computers = await tx
            .select({ id: computersTable.id })
            .from(computersTable)
            .where(eq(computersTable.serverId, server.id));
        await tx.insert(serverDeletionsTable).values({
            id: deletionId,
            requestedByUserId: member.id,
            serverId: server.id,
            status: 'pending',
        });
        await tx.update(serversTable).set({ deletedAt: now }).where(eq(serversTable.id, server.id));
        await tx
            .update(serverMembershipsTable)
            .set({ revokedAt: now })
            .where(
                and(
                    eq(serverMembershipsTable.serverId, server.id),
                    isNull(serverMembershipsTable.revokedAt)
                )
            );
        await tx
            .update(serverInvitationsTable)
            .set({ revokedAt: now })
            .where(
                and(
                    eq(serverInvitationsTable.serverId, server.id),
                    isNull(serverInvitationsTable.acceptedAt),
                    isNull(serverInvitationsTable.revokedAt)
                )
            );
        await tx
            .update(agentRunnerCredentialsTable)
            .set({ revokedAt: now })
            .where(
                and(
                    eq(agentRunnerCredentialsTable.serverId, server.id),
                    isNull(agentRunnerCredentialsTable.revokedAt)
                )
            );
        await tx
            .update(agentsTable)
            .set({ retiredAt: now })
            .where(and(eq(agentsTable.serverId, server.id), isNull(agentsTable.retiredAt)));
        for (const computer of computers) {
            await tx
                .update(computersTable)
                .set({ credentialHash: revokedComputerCredential(computer.id, deletionId) })
                .where(eq(computersTable.id, computer.id));
        }
        await tx.delete(agentInboxTable).where(eq(agentInboxTable.serverId, server.id));
        await tx.delete(agentDeliveryTable).where(eq(agentDeliveryTable.serverId, server.id));
        await tx
            .delete(reminderAgentAttentionTable)
            .where(eq(reminderAgentAttentionTable.serverId, server.id));
        await tx
            .update(remindersTable)
            .set({ status: 'canceled', updatedAt: now })
            .where(
                and(eq(remindersTable.serverId, server.id), eq(remindersTable.status, 'scheduled'))
            );

        return { deletionId, serverId: server.id, status: 'pending' };
    });
}

/**
 * The danger-zone second half: purges one tombstoned Server. Deleting the row
 * cascades away every Server-scoped row in PostgreSQL; then its local
 * attachment subtree is removed. The `deletedAt` guard means a live Server is
 * never touched — a stray call can only ever finish a real deletion.
 */
export async function purgeDeletedServer(
    db: HausDatabase,
    attachmentRoot: AttachmentRoot,
    input: { deletionId: string; serverId: string }
): Promise<void> {
    try {
        await attachmentRoot.purgeServer(input.serverId);
        await db.transaction(async (tx) => {
            const worn = await tx
                .select({ avatarId: agentsTable.avatarId })
                .from(agentsTable)
                .where(
                    and(eq(agentsTable.serverId, input.serverId), isNotNull(agentsTable.avatarId))
                );
            const deleted = await tx
                .delete(serversTable)
                .where(and(eq(serversTable.id, input.serverId), isNotNull(serversTable.deletedAt)))
                .returning({ id: serversTable.id });
            if (deleted.length > 0) {
                // Avatar rows have no cascading parent: the Agent wearing one
                // cascades away and leaves its bytes behind. Purge them, guarded
                // by the delete above so a live Server is never touched.
                const avatarIds = worn.map((row) => row.avatarId).filter((id) => id !== null);
                if (avatarIds.length > 0) {
                    await tx.delete(avatarsTable).where(inArray(avatarsTable.id, avatarIds));
                }
            }
            await tx
                .update(serverDeletionsTable)
                .set({ completedAt: new Date(), error: null, status: 'completed' })
                .where(eq(serverDeletionsTable.id, input.deletionId));
        });
    } catch (error) {
        await db
            .update(serverDeletionsTable)
            .set({
                completedAt: new Date(),
                error: error instanceof Error ? error.message : 'Server purge failed.',
                status: 'failed',
            })
            .where(eq(serverDeletionsTable.id, input.deletionId));
    }
}

/**
 * Startup recovery: finishes any purge interrupted by a crash between the
 * tombstone commit and the row-and-file removal. Idempotent, so it runs on
 * every boot alongside attachment reconciliation.
 */
export async function purgeDeletedServers(
    db: HausDatabase,
    attachmentRoot: AttachmentRoot
): Promise<void> {
    const pending = await db
        .select({ deletionId: serverDeletionsTable.id, serverId: serversTable.id })
        .from(serversTable)
        .innerJoin(serverDeletionsTable, eq(serverDeletionsTable.serverId, serversTable.id))
        .where(isNotNull(serversTable.deletedAt));
    for (const deletion of pending) {
        await purgeDeletedServer(db, attachmentRoot, deletion);
    }
}

export async function readServerDeletion(
    db: HausDatabase,
    requestedByUserId: string,
    deletionId: string
) {
    const [deletion] = await db
        .select({
            completedAt: serverDeletionsTable.completedAt,
            error: serverDeletionsTable.error,
            id: serverDeletionsTable.id,
            serverId: serverDeletionsTable.serverId,
            status: serverDeletionsTable.status,
        })
        .from(serverDeletionsTable)
        .where(
            and(
                eq(serverDeletionsTable.id, deletionId),
                eq(serverDeletionsTable.requestedByUserId, requestedByUserId)
            )
        )
        .limit(1);
    if (!deletion) {
        throw new ServerDeleteDeniedError('No Server deletion was found.');
    }
    return deletion;
}

function revokedComputerCredential(computerId: string, deletionId: string) {
    return createHash('sha256').update(`deleted:${computerId}:${deletionId}`).digest('hex');
}
