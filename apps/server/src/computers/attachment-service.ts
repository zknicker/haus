import { and, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { computersTable, serversTable } from '../postgres/schema.ts';
import {
    requireServerMembership,
    ServerAccessDeniedError,
    ServerNotFoundError,
} from '../servers/server-access.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { findUserById } from '../users/haus-user.ts';
import { authenticateComputerLogin } from './login-session-service.ts';

export type ComputerAttachmentErrorCode =
    | 'computer_attachment_idempotency_conflict'
    | 'computer_attachment_insufficient_role'
    | 'computer_attachment_server_not_found'
    | 'computer_attachment_wrong_account';

export class ComputerAttachmentError extends Error {
    constructor(
        readonly code: ComputerAttachmentErrorCode,
        message: string,
        readonly httpStatus: number
    ) {
        super(message);
        this.name = 'ComputerAttachmentError';
    }
}

interface AttachComputerInput {
    accessToken: string;
    credentialHash: string;
    idempotencyKey: string;
    slug: string;
}

interface ComputerAttachmentRecord {
    attachedByUserId: string;
    credentialHash: string;
    id: string;
    serverId: string;
}

export async function attachComputer(db: HausDatabase, input: AttachComputerInput) {
    const login = await authenticateComputerLogin(db, { accessToken: input.accessToken });
    const member = await findUserById(db, login.userId);

    return await db.transaction(async (tx) => {
        const [server] = await tx
            .select({ id: serversTable.id })
            .from(serversTable)
            .where(and(eq(serversTable.slug, input.slug), isNull(serversTable.deletedAt)))
            .limit(1);

        if (!server) {
            throw new ComputerAttachmentError(
                'computer_attachment_server_not_found',
                `No Haus server exists at /${input.slug}. Check the Server address and try again.`,
                404
            );
        }
        await lockServerRow(tx, server.id);
        let membership: Awaited<ReturnType<typeof requireServerMembership>>;
        try {
            membership = await requireServerMembership(tx, member, server.id);
        } catch (cause) {
            if (cause instanceof ServerNotFoundError) {
                throw new ComputerAttachmentError(
                    'computer_attachment_server_not_found',
                    `No Haus server exists at /${input.slug}. Check the Server address and try again.`,
                    404
                );
            }
            if (cause instanceof ServerAccessDeniedError) {
                throw wrongAccount(input.slug);
            }
            throw cause;
        }
        if (membership.role !== 'owner' && membership.role !== 'admin') {
            throw new ComputerAttachmentError(
                'computer_attachment_insufficient_role',
                `Only a Server Owner or Admin can attach a Computer to /${input.slug}. Ask an Owner to grant access.`,
                403
            );
        }
        if (!member) {
            throw wrongAccount(input.slug);
        }

        const existing = await findAttachmentByIdempotencyKey(tx, input.idempotencyKey, true);
        if (existing) {
            return finishAttachment(existing, input, member.id, server.id, true);
        }

        const computerId = createOpaqueId('cmp');
        const [inserted] = await tx
            .insert(computersTable)
            .values({
                attachedByUserId: member.id,
                attachmentIdempotencyKey: input.idempotencyKey,
                credentialHash: input.credentialHash,
                id: computerId,
                serverId: server.id,
            })
            .onConflictDoNothing({ target: computersTable.attachmentIdempotencyKey })
            .returning({ id: computersTable.id });

        if (inserted) {
            return {
                computerId: inserted.id,
                idempotent: false,
                serverId: server.id,
                slug: input.slug,
            };
        }

        const concurrent = await findAttachmentByIdempotencyKey(tx, input.idempotencyKey, true);
        if (!concurrent) {
            throw new Error('Computer attachment issuance did not settle.');
        }
        return finishAttachment(concurrent, input, member.id, server.id, true);
    });
}

async function findAttachmentByIdempotencyKey(
    db: Pick<HausDatabase, 'select'>,
    idempotencyKey: string,
    lock: boolean
): Promise<ComputerAttachmentRecord | null> {
    const query = db
        .select({
            attachedByUserId: computersTable.attachedByUserId,
            credentialHash: computersTable.credentialHash,
            id: computersTable.id,
            serverId: computersTable.serverId,
        })
        .from(computersTable)
        .where(eq(computersTable.attachmentIdempotencyKey, idempotencyKey))
        .limit(1);
    const [attachment] = lock ? await query.for('update') : await query;
    return attachment ?? null;
}

function finishAttachment(
    attachment: ComputerAttachmentRecord,
    input: AttachComputerInput,
    memberId: string,
    serverId: string,
    idempotent: boolean
) {
    if (
        attachment.attachedByUserId !== memberId ||
        attachment.credentialHash !== input.credentialHash ||
        attachment.serverId !== serverId
    ) {
        throw new ComputerAttachmentError(
            'computer_attachment_idempotency_conflict',
            'This attachment retry key belongs to another Computer request. Start setup again.',
            409
        );
    }
    return {
        computerId: attachment.id,
        idempotent,
        serverId: attachment.serverId,
        slug: input.slug,
    };
}

function wrongAccount(slug: string) {
    return new ComputerAttachmentError(
        'computer_attachment_wrong_account',
        `The signed-in Haus account cannot attach a Computer to /${slug}. Run "haus-computer login --replace" and choose "Use another account".`,
        403
    );
}
