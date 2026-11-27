import type {
    ComputerAgentAccessSettings,
    ComputerUseSettings,
} from '@haus/api';
import { and, desc, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { readAgentAccessGrants } from './computer-agent-access.ts';
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
            agentAccessScope: computersTable.agentAccessScope,
            attachedByUserId: computersTable.attachedByUserId,
            architecture: computersTable.architecture,
            computerUseChangedAt: computersTable.computerUseChangedAt,
            computerUseEnabled: computersTable.computerUseEnabled,
            createdAt: computersTable.createdAt,
            health: computersTable.health,
            id: computersTable.id,
            inventoryInvalidAt: computersTable.inventoryInvalidAt,
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
        .where(
            and(
                eq(computersTable.serverId, serverId),
                seesEvery ? undefined : eq(computersTable.attachedByUserId, member?.id ?? '')
            )
        )
        .orderBy(desc(computersTable.createdAt));
    const grants = await readAgentAccessGrants(
        db,
        computers.map(({ id }) => id)
    );
    return computers.map(
        ({
            agentAccessScope,
            attachedByUserId,
            computerUseChangedAt,
            computerUseEnabled,
            ...computer
        }) => {
            const steward = isComputerSteward(server.role, attachedByUserId, member?.id);
            const attacher = attachedByUserId === member?.id;
            const agentAccess: ComputerAgentAccessSettings = {
                agentAccessGrants: grants.get(computer.id) ?? [],
                agentAccessScope,
                canGrantAgentAccess: attacher,
                canRevokeAgentAccess: steward,
            };
            const computerUse: ComputerUseSettings = {
                canChangeComputerUse: steward,
                canEnableComputerUse: attacher,
                computerUseChangedAt,
                computerUseEnabled,
            };
            return {
                ...presentComputer(computer, connections),
                ...computerUse,
                ...agentAccess,
                name: computer.reportedInventory?.name ?? null,
                attachedByCurrentUser: attacher,
                diskStatus: connections.diskStatus(computer.id),
            };
        }
    );
}
