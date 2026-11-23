import { and, eq } from 'drizzle-orm';
import { isComputerSteward } from '../computers/computer-steward.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable } from '../postgres/schema.ts';
import {
    requireServerMembership,
    ServerAccessDeniedError,
    ServerNotFoundError,
} from '../servers/server-access.ts';
import { RepoFolderRefusalError } from './repo-errors.ts';

type Reader = Pick<HausDatabase, 'select'>;

export async function readRepoFolderAccess(
    db: Reader,
    userId: string | null,
    input: { computerId: string; serverId: string }
) {
    const server = await requireMember(db, userId, input.serverId);
    const [computer] = await db
        .select({
            attachedByUserId: computersTable.attachedByUserId,
            inventory: computersTable.reportedInventory,
        })
        .from(computersTable)
        .where(
            and(
                eq(computersTable.serverId, input.serverId),
                eq(computersTable.id, input.computerId)
            )
        )
        .limit(1);
    if (!computer) {
        throw new RepoFolderRefusalError(
            'missing',
            'That Computer is not attached to this Server.'
        );
    }
    return {
        canAdd: userId !== null && computer.attachedByUserId === userId,
        canRemove: isComputerSteward(server.role, computer.attachedByUserId, userId ?? undefined),
        computerId: input.computerId,
        name: computer.inventory?.name?.trim() || 'this Device',
        serverId: input.serverId,
    };
}

export async function requireRepoFolderAdder(
    db: Reader,
    userId: string | null,
    input: { computerId: string; serverId: string }
) {
    const access = await readRepoFolderAccess(db, userId, input);
    if (!(access.canAdd && userId)) {
        throw new RepoFolderRefusalError(
            'denied',
            `Only the person who attached ${access.name} can add a folder there, because a folder lets Workers and Captains into their own checkout.`
        );
    }
    return { ...access, userId };
}

export async function requireRepoFolderRemover(
    db: Reader,
    userId: string | null,
    input: { computerId: string; serverId: string }
) {
    const access = await readRepoFolderAccess(db, userId, input);
    if (!access.canRemove) {
        throw new RepoFolderRefusalError(
            'denied',
            `Only the person who attached ${access.name}, an Owner, or an Admin can remove a folder there.`
        );
    }
    return access;
}

async function requireMember(db: Reader, userId: string | null, serverId: string) {
    try {
        return await requireServerMembership(db, userId ? { id: userId } : null, serverId);
    } catch (cause) {
        if (cause instanceof ServerNotFoundError || cause instanceof ServerAccessDeniedError) {
            throw new RepoFolderRefusalError('denied', 'You are not a member of this Server.');
        }
        throw cause;
    }
}
