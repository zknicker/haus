import { and, eq } from 'drizzle-orm';
import type { AttachmentRoot } from '../attachments/attachment-root.ts';
import { uploadStagedAttachment } from '../attachments/staged-attachment-upload.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    agentInvocationPayloadsTable,
    agentInvocationsTable,
    attachmentsTable,
} from '../postgres/schema.ts';
import type { ServerRuntime } from '../server-runtime.ts';

export class InvocationPayloadError extends Error {
    constructor(
        message: string,
        readonly status: 400 | 401 | 404 | 413 | 415
    ) {
        super(message);
        this.name = 'InvocationPayloadError';
    }
}

interface ComputerIdentity {
    id: string;
    serverId: string;
}

export async function storeInvocationPayload(
    db: HausDatabase,
    root: AttachmentRoot,
    runtime: ServerRuntime,
    input: {
        computer: ComputerIdentity;
        declaredLength: number | null;
        invocationId: string;
        mediaType: string;
        stream: AsyncIterable<Uint8Array>;
    }
) {
    const invocation = await requireComputerInvocation(db, input.computer, input.invocationId);
    const attachmentId = createOpaqueId('att');
    await db.transaction(async (tx) => {
        await tx.insert(attachmentsTable).values({
            filename: 'invocation-payload',
            id: attachmentId,
            mediaType: input.mediaType,
            serverId: invocation.serverId,
            state: 'pending',
            uploadNonce: attachmentId,
            uploaderAgentId: invocation.agentId,
        });
        await tx.insert(agentInvocationPayloadsTable).values({
            attachmentId,
            invocationId: invocation.id,
            serverId: invocation.serverId,
        });
    });
    const release = root.beginServerWrite(invocation.serverId);
    try {
        await uploadStagedAttachment(db, root, runtime, {
            attachmentId,
            declaredLength: input.declaredLength,
            member: null,
            serverId: invocation.serverId,
            stream: input.stream,
        });
    } finally {
        release();
    }
    const stored = await readReadyPayload(db, invocation.serverId, attachmentId);
    return {
        attachmentId,
        mediaType: stored.mediaType,
        sha256: stored.sha256,
        sizeBytes: stored.sizeBytes,
    };
}

export async function openComputerPayload(
    db: HausDatabase,
    root: AttachmentRoot,
    input: { attachmentId: string; computer: ComputerIdentity; invocationId: string }
) {
    const invocation = await requireComputerInvocation(db, input.computer, input.invocationId);
    const [bound] = await db
        .select({ attachmentId: agentInvocationPayloadsTable.attachmentId })
        .from(agentInvocationPayloadsTable)
        .where(
            and(
                eq(agentInvocationPayloadsTable.attachmentId, input.attachmentId),
                eq(agentInvocationPayloadsTable.invocationId, invocation.id)
            )
        )
        .limit(1);
    if (!bound) {
        throw new InvocationPayloadError('That payload does not belong to this invocation.', 404);
    }
    return await openPayload(db, root, invocation.serverId, bound.attachmentId);
}

export async function openRunPayload(
    db: HausDatabase,
    root: AttachmentRoot,
    runner: Pick<ResolvedRunner, 'agentId' | 'runId' | 'serverId'>,
    attachmentId: string
) {
    const [bound] = await db
        .select({ attachmentId: agentInvocationPayloadsTable.attachmentId })
        .from(agentInvocationPayloadsTable)
        .innerJoin(
            agentInvocationsTable,
            eq(agentInvocationsTable.id, agentInvocationPayloadsTable.invocationId)
        )
        .where(
            and(
                eq(agentInvocationPayloadsTable.attachmentId, attachmentId),
                eq(agentInvocationsTable.serverId, runner.serverId),
                eq(agentInvocationsTable.agentId, runner.agentId),
                eq(agentInvocationsTable.runId, runner.runId)
            )
        )
        .limit(1);
    if (!bound) {
        throw new InvocationPayloadError('That payload does not belong to this run.', 404);
    }
    return await openPayload(db, root, runner.serverId, bound.attachmentId);
}

async function requireComputerInvocation(
    db: HausDatabase,
    computer: ComputerIdentity,
    invocationId: string
) {
    const [invocation] = await db
        .select({
            agentId: agentInvocationsTable.agentId,
            id: agentInvocationsTable.id,
            serverId: agentInvocationsTable.serverId,
        })
        .from(agentInvocationsTable)
        .where(
            and(
                eq(agentInvocationsTable.id, invocationId),
                eq(agentInvocationsTable.serverId, computer.serverId),
                eq(agentInvocationsTable.computerId, computer.id)
            )
        )
        .limit(1);
    if (!invocation) {
        throw new InvocationPayloadError('No invocation was sent to this Computer.', 404);
    }
    return invocation;
}

async function openPayload(
    db: HausDatabase,
    root: AttachmentRoot,
    serverId: string,
    attachmentId: string
) {
    const stored = await readReadyPayload(db, serverId, attachmentId);
    return { ...stored, file: await root.openObject(serverId, attachmentId) };
}

async function readReadyPayload(db: HausDatabase, serverId: string, attachmentId: string) {
    const [attachment] = await db
        .select({
            mediaType: attachmentsTable.mediaType,
            sha256: attachmentsTable.sha256,
            sizeBytes: attachmentsTable.byteSize,
            state: attachmentsTable.state,
        })
        .from(attachmentsTable)
        .where(and(eq(attachmentsTable.serverId, serverId), eq(attachmentsTable.id, attachmentId)))
        .limit(1);
    if (!(attachment?.state === 'ready' && attachment.sha256 && attachment.sizeBytes !== null)) {
        throw new InvocationPayloadError('That payload is not stored.', 404);
    }
    return {
        mediaType: attachment.mediaType,
        sha256: attachment.sha256,
        sizeBytes: attachment.sizeBytes,
    };
}
