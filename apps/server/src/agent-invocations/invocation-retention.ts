import { EXECUTION_JOURNAL_RETENTION_DAYS } from '@haus/api';
import { and, eq, inArray, isNull, lt } from 'drizzle-orm';
import type { AttachmentRoot } from '../attachments/attachment-root.ts';
import { type SweepTimers, startBootSweep } from '../boot-sweep.ts';
import { deleteExpiredComputerUseRequests } from '../computer-use/computer-use-store.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentInvocationPayloadsTable,
    agentInvocationsTable,
    attachmentsTable,
} from '../postgres/schema.ts';

const sweepIntervalMs = 60 * 60 * 1000;
const retentionMs = EXECUTION_JOURNAL_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export async function deleteExpiredInvocations(db: HausDatabase, root: AttachmentRoot, now: Date) {
    const cutoff = new Date(now.getTime() - retentionMs);
    const expired = await db
        .select({ serverId: agentInvocationsTable.serverId })
        .from(agentInvocationsTable)
        .where(lt(agentInvocationsTable.requestedAt, cutoff))
        .groupBy(agentInvocationsTable.serverId);
    for (const { serverId } of expired) {
        await root.discardAttachments(serverId, async () => {
            const payloads = await db
                .select({
                    attachmentId: agentInvocationPayloadsTable.attachmentId,
                    stagingKey: attachmentsTable.stagingKey,
                })
                .from(agentInvocationPayloadsTable)
                .innerJoin(
                    agentInvocationsTable,
                    eq(agentInvocationsTable.id, agentInvocationPayloadsTable.invocationId)
                )
                .innerJoin(
                    attachmentsTable,
                    and(
                        eq(attachmentsTable.serverId, agentInvocationPayloadsTable.serverId),
                        eq(attachmentsTable.id, agentInvocationPayloadsTable.attachmentId)
                    )
                )
                .where(
                    and(
                        eq(agentInvocationsTable.serverId, serverId),
                        lt(agentInvocationsTable.requestedAt, cutoff)
                    )
                );
            await db.transaction(async (tx) => {
                if (payloads.length > 0) {
                    await tx.delete(attachmentsTable).where(
                        and(
                            eq(attachmentsTable.serverId, serverId),
                            inArray(
                                attachmentsTable.id,
                                payloads.map((payload) => payload.attachmentId)
                            )
                        )
                    );
                }
                await tx
                    .delete(agentInvocationsTable)
                    .where(
                        and(
                            eq(agentInvocationsTable.serverId, serverId),
                            lt(agentInvocationsTable.requestedAt, cutoff)
                        )
                    );
            });
            return payloads;
        });
    }
    await deleteUnboundUploads(db, root, cutoff);
    await deleteExpiredComputerUseRequests(db, cutoff);
}

async function deleteUnboundUploads(db: HausDatabase, root: AttachmentRoot, cutoff: Date) {
    const unbound = and(
        isNull(agentInvocationPayloadsTable.invocationId),
        lt(agentInvocationPayloadsTable.uploadedAt, cutoff)
    );
    const servers = await db
        .select({ serverId: agentInvocationPayloadsTable.serverId })
        .from(agentInvocationPayloadsTable)
        .where(unbound)
        .groupBy(agentInvocationPayloadsTable.serverId);
    for (const { serverId } of servers) {
        await root.discardAttachments(serverId, async () => {
            const uploads = await db
                .select({
                    attachmentId: agentInvocationPayloadsTable.attachmentId,
                    stagingKey: attachmentsTable.stagingKey,
                })
                .from(agentInvocationPayloadsTable)
                .innerJoin(
                    attachmentsTable,
                    and(
                        eq(attachmentsTable.serverId, agentInvocationPayloadsTable.serverId),
                        eq(attachmentsTable.id, agentInvocationPayloadsTable.attachmentId)
                    )
                )
                .where(and(eq(agentInvocationPayloadsTable.serverId, serverId), unbound));
            if (uploads.length > 0) {
                await db.delete(attachmentsTable).where(
                    and(
                        eq(attachmentsTable.serverId, serverId),
                        inArray(
                            attachmentsTable.id,
                            uploads.map((upload) => upload.attachmentId)
                        )
                    )
                );
            }
            return uploads;
        });
    }
}

export function startInvocationRetentionSweep(
    db: HausDatabase,
    root: AttachmentRoot,
    clock: { now(): Date },
    timers?: SweepTimers
) {
    return startBootSweep({
        intervalMs: sweepIntervalMs,
        name: 'invocation retention sweep',
        run: () => deleteExpiredInvocations(db, root, clock.now()),
        timers,
    });
}
