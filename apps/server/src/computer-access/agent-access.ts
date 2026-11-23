import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, computerAgentAccessTable, computersTable } from '../postgres/schema.ts';

type Reader = Pick<HausDatabase, 'select'>;

export async function isAgentAllowedOn(
    db: Reader,
    input: { agentId: string; computerId: string; serverId: string }
) {
    const [agent] = await db
        .select({ computerId: agentsTable.computerId, retiredAt: agentsTable.retiredAt })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)))
        .limit(1);
    if (!agent || agent.retiredAt !== null) {
        return false;
    }
    if (agent.computerId === input.computerId) {
        return true;
    }
    const [grant] = await db
        .select({ agentId: computerAgentAccessTable.agentId })
        .from(computerAgentAccessTable)
        .where(
            and(
                eq(computerAgentAccessTable.serverId, input.serverId),
                eq(computerAgentAccessTable.computerId, input.computerId),
                eq(computerAgentAccessTable.agentId, input.agentId)
            )
        )
        .limit(1);
    return grant !== undefined;
}

export async function readGrantedComputerIds(
    db: Reader,
    input: { agentId: string; serverId: string }
) {
    const rows = await db
        .select({ computerId: computerAgentAccessTable.computerId })
        .from(computerAgentAccessTable)
        .where(
            and(
                eq(computerAgentAccessTable.serverId, input.serverId),
                eq(computerAgentAccessTable.agentId, input.agentId)
            )
        );
    return new Set(rows.map(({ computerId }) => computerId));
}

export async function readAgentsBarredFrom(db: Reader, computerId: string) {
    const rows = await db
        .select({
            agentId: agentsTable.id,
            granted: computerAgentAccessTable.agentId,
            homeComputerId: agentsTable.computerId,
            retiredAt: agentsTable.retiredAt,
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
        .filter(
            (row) =>
                row.retiredAt !== null ||
                (row.homeComputerId !== computerId && row.granted === null)
        )
        .map(({ agentId, serverId }) => ({ agentId, serverId }));
}
