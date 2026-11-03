import { type AgentHeartbeatAttention, heartbeatContextLimit } from '@haus/api';
import { and, asc, eq } from 'drizzle-orm';
import { listOpenLeads } from '../heartbeat/leads.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { remindersTable } from '../postgres/schema.ts';
import { readGrantedConnections } from '../server-mcp/agent-access.ts';

type HeartbeatContext = Pick<AgentHeartbeatAttention, 'connections' | 'leads' | 'reminders'>;

/**
 * What every heartbeat run would otherwise fetch first, so it need not: the Agent's
 * granted, connected connection names, the team's open leads, and the Agent's own
 * scheduled reminders. Each list is bounded; the commands still return everything.
 */
export async function readHeartbeatContext(
    db: HausDatabase,
    scope: { agentId: string; serverId: string }
): Promise<HeartbeatContext> {
    const [connections, leads, reminders] = await Promise.all([
        readGrantedConnections(db, scope),
        listOpenLeads(db, scope.serverId, heartbeatContextLimit),
        db
            .select({
                fireAt: remindersTable.fireAt,
                id: remindersTable.id,
                title: remindersTable.title,
            })
            .from(remindersTable)
            .where(
                and(
                    eq(remindersTable.serverId, scope.serverId),
                    eq(remindersTable.ownerAgentId, scope.agentId),
                    eq(remindersTable.status, 'scheduled')
                )
            )
            .orderBy(asc(remindersTable.fireAt), asc(remindersTable.id))
            .limit(heartbeatContextLimit),
    ]);
    return {
        connections: connections
            .map((connection) => connection.name)
            .sort((a, b) => a.localeCompare(b))
            .slice(0, heartbeatContextLimit),
        leads: leads.map(({ agentHandle, id, topic }) => ({ agentHandle, id, topic })),
        reminders: reminders.map((reminder) => ({
            fireAt: reminder.fireAt.toISOString(),
            id: reminder.id,
            title: reminder.title,
        })),
    };
}
