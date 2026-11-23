import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { ComputerSetupDeniedError } from './service.ts';

export async function requireComputerSteward(
    db: HausDatabase,
    member: HausUser | null,
    input: { computerId: string; serverId: string }
) {
    const { computer, role } = await readStewardedComputer(db, member, input);
    if (!(member && isComputerSteward(role, computer.attachedByUserId, member.id))) {
        throw new ComputerSetupDeniedError(
            'Only the person who attached this Computer, an Owner, or an Admin can change what runs on it.'
        );
    }
    return { ...computer, stewardUserId: member.id };
}

export async function requireComputerAttacher(
    db: HausDatabase,
    member: HausUser | null,
    input: { computerId: string; serverId: string },
    refusal: string
) {
    const { computer } = await readStewardedComputer(db, member, input);
    if (!(member && computer.attachedByUserId === member.id)) {
        throw new ComputerSetupDeniedError(refusal);
    }
    return { ...computer, attacherUserId: member.id };
}

export function isComputerSteward(
    role: string,
    attachedByUserId: string,
    memberId: string | undefined
) {
    return (
        role === 'owner' ||
        role === 'admin' ||
        (memberId !== undefined && attachedByUserId === memberId)
    );
}

async function readStewardedComputer(
    db: HausDatabase,
    member: HausUser | null,
    input: { computerId: string; serverId: string }
) {
    const server = await requireServerMembership(db, member, input.serverId);
    const [computer] = await db
        .select({
            agentAccessScope: computersTable.agentAccessScope,
            attachedByUserId: computersTable.attachedByUserId,
            computerUseEnabled: computersTable.computerUseEnabled,
            id: computersTable.id,
            workerLimit: computersTable.workerLimit,
            workersEnabled: computersTable.workersEnabled,
        })
        .from(computersTable)
        .where(
            and(
                eq(computersTable.serverId, input.serverId),
                eq(computersTable.id, input.computerId)
            )
        )
        .limit(1)
        .for('update');
    if (!computer) {
        throw new ComputerSetupDeniedError('That Computer no longer exists.');
    }
    return { computer, role: server.role };
}
