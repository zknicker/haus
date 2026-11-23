import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, computerAgentAccessTable, computersTable } from '../postgres/schema.ts';

type Reader = Pick<HausDatabase, 'select'>;

export async function isAgentAllowedOn(
    db: Reader,
    input: { agentId: string; computerId: string; serverId: string }
) {
    const [row] = await db
        .select({
            granted: computerAgentAccessTable.agentId,
            machineId: agentsTable.computerId,
            retiredAt: agentsTable.retiredAt,
            scope: computersTable.agentAccessScope,
        })
        .from(agentsTable)
        .innerJoin(
            computersTable,
            and(
                eq(computersTable.serverId, agentsTable.serverId),
                eq(computersTable.id, input.computerId)
            )
        )
        .leftJoin(
            computerAgentAccessTable,
            and(
                eq(computerAgentAccessTable.computerId, computersTable.id),
                eq(computerAgentAccessTable.agentId, agentsTable.id)
            )
        )
        .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)))
        .limit(1);
    if (!row || row.retiredAt !== null) {
        return false;
    }
    return accessAllows({ ...row, computerId: input.computerId });
}

export async function readAccessibleComputerIds(
    db: Reader,
    input: { agentId: string; serverId: string }
) {
    const rows = await db
        .select({
            computerId: computersTable.id,
            granted: computerAgentAccessTable.agentId,
            scope: computersTable.agentAccessScope,
        })
        .from(computersTable)
        .leftJoin(
            computerAgentAccessTable,
            and(
                eq(computerAgentAccessTable.computerId, computersTable.id),
                eq(computerAgentAccessTable.agentId, input.agentId)
            )
        )
        .where(eq(computersTable.serverId, input.serverId));
    return new Set(
        rows
            .filter((row) => row.scope === 'all' || row.granted !== null)
            .map(({ computerId }) => computerId)
    );
}

export async function readAgentsBarredFrom(db: Reader, computerId: string) {
    const rows = await db
        .select({
            agentId: agentsTable.id,
            granted: computerAgentAccessTable.agentId,
            machineId: agentsTable.computerId,
            retiredAt: agentsTable.retiredAt,
            scope: computersTable.agentAccessScope,
            serverId: agentsTable.serverId,
        })
        .from(computersTable)
        .innerJoin(agentsTable, eq(agentsTable.serverId, computersTable.serverId))
        .leftJoin(
            computerAgentAccessTable,
            and(
                eq(computerAgentAccessTable.computerId, computersTable.id),
                eq(computerAgentAccessTable.agentId, agentsTable.id)
            )
        )
        .where(eq(computersTable.id, computerId));
    return rows
        .filter((row) => row.retiredAt !== null || !accessAllows({ ...row, computerId }))
        .map(({ agentId, serverId }) => ({ agentId, serverId }));
}

function accessAllows(row: {
    computerId: string;
    granted: string | null;
    machineId: string | null;
    scope: 'all' | 'selected';
}) {
    return row.machineId === row.computerId || row.scope === 'all' || row.granted !== null;
}
