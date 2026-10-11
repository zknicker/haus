import { and, eq, exists } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentMcpConnectionGrantsTable, mcpConnectionsTable } from '../postgres/schema.ts';
import { mcpUpdatedTopic } from '../realtime/topics.ts';
import type { AgentScope } from './agent-access.ts';

export function toolSnapshot(names: readonly string[]): string[] {
    return [...new Set(names)].sort();
}

export async function recordToolSnapshot(
    db: HausDatabase,
    scope: AgentScope,
    connectionId: string,
    names: readonly string[]
): Promise<void> {
    const incoming = toolSnapshot(names);
    if (incoming.length === 0) {
        return;
    }
    const where = and(
        eq(mcpConnectionsTable.serverId, scope.serverId),
        eq(mcpConnectionsTable.id, connectionId),
        eq(mcpConnectionsTable.connected, true),
        exists(
            db
                .select({ connectionId: agentMcpConnectionGrantsTable.connectionId })
                .from(agentMcpConnectionGrantsTable)
                .where(
                    and(
                        eq(agentMcpConnectionGrantsTable.serverId, scope.serverId),
                        eq(agentMcpConnectionGrantsTable.agentId, scope.agentId),
                        eq(agentMcpConnectionGrantsTable.connectionId, connectionId)
                    )
                )
        )
    );
    const [current] = await db
        .select({ tools: mcpConnectionsTable.tools })
        .from(mcpConnectionsTable)
        .where(where)
        .limit(1);
    if (!current?.tools) {
        return;
    }
    const tools = toolSnapshot([...current.tools, ...incoming]);
    if (sameNames(tools, current.tools)) {
        return;
    }
    const updated = await db
        .update(mcpConnectionsTable)
        .set({ tools })
        .where(and(where, eq(mcpConnectionsTable.tools, current.tools)))
        .returning({ id: mcpConnectionsTable.id });
    if (updated.length > 0) {
        mcpUpdatedTopic.announce({ serverId: scope.serverId });
    }
}

function sameNames(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((name, index) => name === right[index]);
}
