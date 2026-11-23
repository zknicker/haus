import type {
    ComputerAgentAccessSettings,
    ComputerUseSettings,
    ComputerWorkerSettings,
} from '@haus/api';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable, computerUseAgentsTable } from '../postgres/schema.ts';
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
            attachedByUserId: computersTable.attachedByUserId,
            architecture: computersTable.architecture,
            computerUseChangedAt: computersTable.computerUseChangedAt,
            computerUseEnabled: computersTable.computerUseEnabled,
            computerUseScope: computersTable.computerUseScope,
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
    const named = await readNamedAgents(
        db,
        computers.filter((computer) => computer.computerUseScope === 'named').map(({ id }) => id)
    );
    const grants = await readAgentAccessGrants(
        db,
        computers.map(({ id }) => id)
    );
    return computers.map(
        ({
            attachedByUserId,
            computerUseChangedAt,
            computerUseEnabled,
            computerUseScope,
            workerLimit,
            workersEnabled,
            ...computer
        }) => {
            const steward = isComputerSteward(server.role, attachedByUserId, member?.id);
            const attacher = attachedByUserId === member?.id;
            const workers: ComputerWorkerSettings = {
                canChangeWorkers: steward,
                canEnableWorkers: attacher,
                workerLimit,
                workersEnabled,
            };
            const agentAccess: ComputerAgentAccessSettings = {
                agentAccessGrants: grants.get(computer.id) ?? [],
                canGrantAgentAccess: attacher,
                canRevokeAgentAccess: steward,
            };
            const computerUse: ComputerUseSettings = {
                canChangeComputerUse: steward,
                computerUseAgents:
                    computerUseScope === 'named'
                        ? { agentIds: named.get(computer.id) ?? [], kind: 'named' }
                        : { kind: 'all' },
                computerUseChangedAt,
                computerUseEnabled,
            };
            return {
                ...presentComputer(computer, connections),
                ...workers,
                ...computerUse,
                ...agentAccess,
                name: computer.reportedInventory?.name ?? null,
                attachedByCurrentUser: attacher,
                diskStatus: connections.diskStatus(computer.id),
            };
        }
    );
}

async function readNamedAgents(db: HausDatabase, computerIds: string[]) {
    const rows =
        computerIds.length > 0
            ? await db
                  .select({
                      agentId: computerUseAgentsTable.agentId,
                      computerId: computerUseAgentsTable.computerId,
                  })
                  .from(computerUseAgentsTable)
                  .where(inArray(computerUseAgentsTable.computerId, computerIds))
                  .orderBy(
                      asc(computerUseAgentsTable.createdAt),
                      asc(computerUseAgentsTable.agentId)
                  )
            : [];
    const named = new Map<string, string[]>();
    for (const row of rows) {
        named.set(row.computerId, [...(named.get(row.computerId) ?? []), row.agentId]);
    }
    return named;
}
