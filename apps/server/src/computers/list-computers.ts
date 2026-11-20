import type { ComputerWorkerSettings } from '@haus/api';
import { and, desc, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { presentComputer } from './computer-presence.ts';
import { isComputerSteward } from './computer-steward.ts';
import type { ComputerConnections } from './connections.ts';

export async function listServerComputers(
    db: HausDatabase,
    connections: ComputerConnections,
    member: HausUser | null,
    serverId: string
) {
    const server = await requireServerMembership(db, member, serverId);
    const seesEvery = server.role === 'owner' || server.role === 'admin';
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
            workerLimit: computersTable.workerLimit,
            workersEnabled: computersTable.workersEnabled,
        })
        .from(computersTable)
        .where(
            and(
                eq(computersTable.serverId, serverId),
                seesEvery ? undefined : eq(computersTable.attachedByUserId, member?.id ?? '')
            )
        )
        .orderBy(desc(computersTable.createdAt));
    return computers.map(({ attachedByUserId, workerLimit, workersEnabled, ...computer }) => {
        const workers: ComputerWorkerSettings = {
            canChangeWorkers: isComputerSteward(server.role, attachedByUserId, member?.id),
            workerLimit,
            workersEnabled,
        };
        return {
            ...presentComputer(computer, connections),
            ...workers,
            name: computer.reportedInventory?.name ?? null,
            attachedByCurrentUser: attachedByUserId === member?.id,
            diskStatus: connections.diskStatus(computer.id),
        };
    });
}
