import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, computerAgentAccessTable } from '../postgres/schema.ts';

type Reader = Pick<HausDatabase, 'select'>;

export async function isAgentAllowedOn(
    db: Reader,
    input: { agentId: string; computerId: string; serverId: string }
) {
    const [home] = await db
        .select({ id: agentsTable.id })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, input.serverId),
                eq(agentsTable.id, input.agentId),
                eq(agentsTable.computerId, input.computerId)
            )
        )
        .limit(1);
    if (home) {
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
