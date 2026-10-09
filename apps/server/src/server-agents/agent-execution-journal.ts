import type {
    AgentExecutionJournalInput,
    AgentExecutionJournalResult,
    AgentExecutionOutlines,
    AgentExecutionOutlinesInput,
} from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { ComputerConnections } from '../computers/connections.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';

export async function requestAgentExecutionJournal(
    db: HausDatabase,
    connections: ComputerConnections,
    member: HausUser | null,
    input: AgentExecutionJournalInput
): Promise<AgentExecutionJournalResult> {
    const computerId = await requireExecutionEvidenceComputer(db, member, input);
    return await connections.requestExecutionJournal(computerId, {
        agentId: input.agentId,
        runId: input.runId,
        serverId: input.serverId,
    });
}

/** Outlines of many runs in one Computer round trip, under the journal's authorization. */
export async function requestAgentExecutionOutlines(
    db: HausDatabase,
    connections: ComputerConnections,
    member: HausUser | null,
    input: AgentExecutionOutlinesInput
): Promise<AgentExecutionOutlines> {
    const computerId = await requireExecutionEvidenceComputer(db, member, input);
    return await connections.executionOutlines.request(computerId, {
        agentId: input.agentId,
        runIds: input.runIds,
        serverId: input.serverId,
    });
}

/** Owners and Admins only; the Agent's assigned Computer holds the evidence. */
export async function requireExecutionEvidenceComputer(
    db: HausDatabase,
    member: HausUser | null,
    input: { agentId: string; serverId: string }
): Promise<string> {
    const server = await requireServerMembership(db, member, input.serverId);
    if (!member || (server.role !== 'owner' && server.role !== 'admin')) {
        throw new AgentExecutionJournalAccessError(
            'Only a Server Owner or Admin can inspect Agent execution details.'
        );
    }
    const [agent] = await db
        .select({ computerId: agentsTable.computerId })
        .from(agentsTable)
        .where(and(eq(agentsTable.id, input.agentId), eq(agentsTable.serverId, input.serverId)))
        .limit(1);
    if (!agent?.computerId) {
        throw new AgentExecutionJournalAccessError('No Agent exists with that id.');
    }
    return agent.computerId;
}

export class AgentExecutionJournalAccessError extends Error {}
