import type { AgentImportSkillInput, ComputerInventory } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { ComputerConnections } from '../computers/connections.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, computersTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { AgentConfigDeniedError } from './agent-config-errors.ts';

export async function importAgentSkill(
    db: HausDatabase,
    connections: ComputerConnections,
    member: HausUser | null,
    input: AgentImportSkillInput
): Promise<{ requestId: string; status: 'accepted' }> {
    const server = await requireServerMembership(db, member, input.serverId);
    if (!member || (server.role !== 'owner' && server.role !== 'admin')) {
        throw new AgentConfigDeniedError('Only a Server Owner or Admin can import an Agent skill.');
    }
    const [target] = await db
        .select({
            computerId: agentsTable.computerId,
            inventory: computersTable.reportedInventory,
        })
        .from(agentsTable)
        .innerJoin(
            computersTable,
            and(
                eq(computersTable.serverId, agentsTable.serverId),
                eq(computersTable.id, agentsTable.computerId)
            )
        )
        .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)))
        .limit(1);
    if (!target?.computerId) {
        throw new AgentConfigDeniedError('No configured Agent exists with that id.');
    }
    const inventory = target.inventory as ComputerInventory | null;
    if (!inventory?.importableSkills?.some((source) => source.id === input.sourceId)) {
        throw new AgentConfigDeniedError('That host skill is not reported by this Computer.');
    }
    try {
        return await connections.requestSkillImport(target.computerId, {
            agentId: input.agentId,
            sourceId: input.sourceId,
        });
    } catch (cause) {
        throw new AgentConfigDeniedError(
            cause instanceof Error ? cause.message : 'The skill could not be imported.'
        );
    }
}
