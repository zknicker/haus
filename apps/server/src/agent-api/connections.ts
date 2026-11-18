import type {
    AgentConnectionAgent,
    AgentConnectionGrantInput,
    AgentConnectionGrantReceipt,
    AgentConnectionList,
} from '@haus/api';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentMcpConnectionGrantsTable,
    agentsTable,
    mcpConnectionsTable,
} from '../postgres/schema.ts';
import { ConnectionAdminRequiredError } from '../server-mcp/grant-errors.ts';
import { isConnectionAdmin, writeMcpGrant } from '../server-mcp/state.ts';

/** A name matched nothing, or more than one record, on the runner's Server. */
export class ConnectionTargetError extends Error {
    constructor(
        readonly code: 'AGENT_NOT_FOUND' | 'AMBIGUOUS_TARGET' | 'CONNECTION_NOT_FOUND',
        message: string
    ) {
        super(message);
        this.name = 'ConnectionTargetError';
    }
}

/**
 * `haus connection list`: every connection on the runner's Server with the Agents that may use
 * it. Only a connection admin may read it; it carries no URL, header names, or secrets.
 */
export async function listAgentConnections(
    db: HausDatabase,
    runner: ResolvedRunner
): Promise<AgentConnectionList> {
    if (!(await isConnectionAdmin(db, runner.serverId, runner.agentId))) {
        throw new ConnectionAdminRequiredError();
    }
    const connections = await db
        .select({
            connected: mcpConnectionsTable.connected,
            id: mcpConnectionsTable.id,
            name: mcpConnectionsTable.name,
        })
        .from(mcpConnectionsTable)
        .where(eq(mcpConnectionsTable.serverId, runner.serverId))
        .orderBy(asc(mcpConnectionsTable.name), asc(mcpConnectionsTable.id));
    const grants = await db
        .select({
            connectionId: agentMcpConnectionGrantsTable.connectionId,
            displayName: agentsTable.displayName,
            handle: agentsTable.handle,
            id: agentsTable.id,
        })
        .from(agentMcpConnectionGrantsTable)
        .innerJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, agentMcpConnectionGrantsTable.serverId),
                eq(agentsTable.id, agentMcpConnectionGrantsTable.agentId)
            )
        )
        .where(
            and(
                eq(agentMcpConnectionGrantsTable.serverId, runner.serverId),
                isNull(agentsTable.retiredAt)
            )
        )
        .orderBy(asc(agentsTable.handle));
    return {
        connections: connections.map((connection) => ({
            ...connection,
            agents: grants
                .filter((grant) => grant.connectionId === connection.id)
                .map(({ displayName, handle, id }) => ({ displayName, handle, id })),
        })),
    };
}

/**
 * `haus connection grant` / `revoke`: one Agent, one connection, through the same grant write
 * the human path uses. The authorization step (connection admin) runs inside that write.
 */
export async function changeAgentConnectionGrant(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: AgentConnectionGrantInput & { enabled: boolean }
): Promise<AgentConnectionGrantReceipt> {
    // Refuse a non-admin before resolving names, so the refusal never reveals what exists.
    if (!(await isConnectionAdmin(db, runner.serverId, runner.agentId))) {
        throw new ConnectionAdminRequiredError();
    }
    const agent = await resolveAgent(db, runner.serverId, input.agent);
    const connection = await resolveConnection(db, runner.serverId, input.connection);
    const { changed } = await writeMcpGrant(
        db,
        { agentId: runner.agentId, kind: 'agent' },
        {
            agentId: agent.id,
            connectionId: connection.id,
            enabled: input.enabled,
            serverId: runner.serverId,
        }
    );
    return { agent, changed, connection, enabled: input.enabled };
}

/** An active Agent of this Server by id, `@handle`, bare handle, or exact display name. */
async function resolveAgent(
    db: HausDatabase,
    serverId: string,
    reference: string
): Promise<AgentConnectionAgent> {
    const handle = reference.startsWith('@') ? reference.slice(1) : reference;
    const matches = await db
        .select({
            displayName: agentsTable.displayName,
            handle: agentsTable.handle,
            id: agentsTable.id,
        })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, serverId),
                isNull(agentsTable.retiredAt),
                reference.startsWith('@')
                    ? sql`lower(${agentsTable.handle}) = lower(${handle})`
                    : sql`(${agentsTable.id} = ${reference}
                        or lower(${agentsTable.handle}) = lower(${handle})
                        or lower(${agentsTable.displayName}) = lower(${reference}))`
            )
        )
        .limit(5);
    // An id or handle is unique on the Server, so it wins over a display-name collision.
    const exact = matches.find(
        (agent) => agent.id === reference || agent.handle.toLowerCase() === handle.toLowerCase()
    );
    return pickOne(exact ? [exact] : matches, reference, 'Agent', 'AGENT_NOT_FOUND');
}

/** A connection of this Server by id or exact (case-insensitive) name. */
async function resolveConnection(
    db: HausDatabase,
    serverId: string,
    reference: string
): Promise<{ id: string; name: string }> {
    const matches = await db
        .select({ id: mcpConnectionsTable.id, name: mcpConnectionsTable.name })
        .from(mcpConnectionsTable)
        .where(
            and(
                eq(mcpConnectionsTable.serverId, serverId),
                sql`(${mcpConnectionsTable.id} = ${reference}
                    or lower(${mcpConnectionsTable.name}) = lower(${reference}))`
            )
        )
        .limit(5);
    const exact = matches.find((connection) => connection.id === reference);
    return pickOne(exact ? [exact] : matches, reference, 'connection', 'CONNECTION_NOT_FOUND');
}

function pickOne<Match extends { id: string }>(
    matches: Match[],
    reference: string,
    noun: 'Agent' | 'connection',
    notFound: 'AGENT_NOT_FOUND' | 'CONNECTION_NOT_FOUND'
): Match {
    const [only, ...others] = matches;
    if (!only) {
        throw new ConnectionTargetError(
            notFound,
            `No ${noun} on this Server matches "${reference}".`
        );
    }
    if (others.length > 0) {
        throw new ConnectionTargetError(
            'AMBIGUOUS_TARGET',
            `More than one ${noun} on this Server matches "${reference}". Use its id from haus connection list.`
        );
    }
    return only;
}
