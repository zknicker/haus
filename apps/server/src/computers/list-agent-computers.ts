import type { AgentComputerListResponse } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { readGrantedComputerIds } from '../computer-access/agent-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, computersTable, computerUseAgentsTable } from '../postgres/schema.ts';
import type { ComputerConnections } from './connections.ts';

type Reader = Pick<HausDatabase, 'select'>;

export async function listAgentComputers(
    db: Reader,
    connections: Pick<ComputerConnections, 'isOnline'>,
    runner: { agentId: string; serverId: string }
) {
    const [agent] = await db
        .select({ computerId: agentsTable.computerId })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, runner.serverId), eq(agentsTable.id, runner.agentId)))
        .limit(1);
    const homeId = agent?.computerId ?? null;
    const granted = await readGrantedComputerIds(db, runner);
    const named = await readNamedComputerIds(db, runner);
    const computers = await db
        .select({
            computerUseEnabled: computersTable.computerUseEnabled,
            computerUseScope: computersTable.computerUseScope,
            id: computersTable.id,
            inventory: computersTable.reportedInventory,
            operatingSystem: computersTable.operatingSystem,
        })
        .from(computersTable)
        .where(eq(computersTable.serverId, runner.serverId));
    const entries = computers.map((computer) => {
        const home = computer.id === homeId;
        const allowed = home || granted.has(computer.id);
        const listed = computer.computerUseScope === 'all' ? home : named.has(computer.id);
        return {
            allowed,
            computerId: computer.id,
            computerUse: computer.computerUseEnabled && allowed && listed,
            home,
            name: computer.inventory?.name ?? null,
            online: connections.isOnline(computer.id),
            operatingSystem: computer.operatingSystem,
        };
    });
    return { computers: entries.sort(byNameThenId) } satisfies AgentComputerListResponse;
}

async function readNamedComputerIds(db: Reader, runner: { agentId: string; serverId: string }) {
    const rows = await db
        .select({ computerId: computerUseAgentsTable.computerId })
        .from(computerUseAgentsTable)
        .where(
            and(
                eq(computerUseAgentsTable.serverId, runner.serverId),
                eq(computerUseAgentsTable.agentId, runner.agentId)
            )
        );
    return new Set(rows.map(({ computerId }) => computerId));
}

function byNameThenId(
    left: { computerId: string; name: string | null },
    right: { computerId: string; name: string | null }
) {
    if (left.name !== right.name) {
        if (left.name === null || right.name === null) {
            return left.name === null ? 1 : -1;
        }
        return left.name.localeCompare(right.name);
    }
    return left.computerId.localeCompare(right.computerId);
}
