import { desc, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { presentComputer } from './computer-presence.ts';
import type { ComputerConnections } from './connections.ts';
import { ComputerSetupDeniedError } from './service.ts';

export async function listServerComputers(
    db: HausDatabase,
    connections: ComputerConnections,
    member: HausUser | null,
    serverId: string
) {
    const server = await requireServerMembership(db, member, serverId);
    if (server.role !== 'owner' && server.role !== 'admin') {
        throw new ComputerSetupDeniedError('Only a Server Owner or Admin can view Computers.');
    }
    const computers = await db
        .select({
            attachedByUserId: computersTable.attachedByUserId,
            architecture: computersTable.architecture,
            createdAt: computersTable.createdAt,
            health: computersTable.health,
            id: computersTable.id,
            lastConnectedAt: computersTable.lastConnectedAt,
            operatingSystem: computersTable.operatingSystem,
            productVersion: computersTable.productVersion,
            protocolVersion: computersTable.protocolVersion,
            reportedInventory: computersTable.reportedInventory,
            updateDetail: computersTable.updateDetail,
            updateDownloadedBytes: computersTable.updateDownloadedBytes,
            updateFailedPhase: computersTable.updateFailedPhase,
            updatePhase: computersTable.updatePhase,
            updateActiveAgentCount: computersTable.updateActiveAgentCount,
            updateTargetVersion: computersTable.updateTargetVersion,
            updateTotalBytes: computersTable.updateTotalBytes,
            updateUpdatedAt: computersTable.updateUpdatedAt,
        })
        .from(computersTable)
        .where(eq(computersTable.serverId, serverId))
        .orderBy(desc(computersTable.createdAt));
    return computers.map(({ attachedByUserId, ...computer }) => ({
        ...presentComputer(computer, connections),
        name: computer.reportedInventory?.name ?? null,
        attachedByCurrentUser: attachedByUserId === member?.id,
        diskStatus: connections.diskStatus(computer.id),
    }));
}
