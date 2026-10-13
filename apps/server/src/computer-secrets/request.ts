import type { ComputerSecretsOperation, ComputerSecretsStatus } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { ComputerConnections } from '../computers/connections.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';

export class ComputerSecretsDeniedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ComputerSecretsDeniedError';
    }
}

/**
 * Relays one Computer Secrets operation to its Computer. Only the
 * Server Owner may manage a Computer's vault: it grants every Agent on that
 * Computer read access to the vault. A `connect` token passes through this
 * call in memory only; nothing here persists or logs the operation.
 */
export async function requestComputerSecrets(
    db: HausDatabase,
    connections: ComputerConnections,
    member: HausUser | null,
    input: { computerId: string; operation: ComputerSecretsOperation; serverId: string }
): Promise<ComputerSecretsStatus> {
    const server = await requireServerMembership(db, member, input.serverId);
    if (!member || server.role !== 'owner') {
        throw new ComputerSecretsDeniedError('Only the Server Owner can manage Computer secrets.');
    }
    const [computer] = await db
        .select({ id: computersTable.id })
        .from(computersTable)
        .where(
            and(
                eq(computersTable.id, input.computerId),
                eq(computersTable.serverId, input.serverId)
            )
        )
        .limit(1);
    if (!computer) {
        throw new ComputerSecretsDeniedError('That Computer is not attached to this Server.');
    }
    return connections.secrets.request(computer.id, input.operation);
}
