import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { mcpConnectionsTable } from '../postgres/schema.ts';
import type { McpToolDefinition } from './runtime.ts';
import { type listAllTools, modelToolName } from './tool-catalog.ts';

type ListedTool = Awaited<ReturnType<typeof listAllTools>>[number];

/**
 * Shapes a granted connection's live listing for an Agent, first syncing the stored tool
 * snapshot that invocation authorizes against. Without the sync, tools an upstream server
 * started serving after discovery are listed but rejected as not granted.
 */
export async function agentToolDefinitions(
    db: HausDatabase,
    connection: { id: string; name: string; tools: readonly string[] },
    listed: readonly ListedTool[]
): Promise<McpToolDefinition[]> {
    await syncToolSnapshot(db, connection, listed);
    return listed.map((tool) => ({
        description: `${connection.name}: ${tool.description ?? `Run ${tool.name}.`}`,
        inputSchema: tool.inputSchema as Record<string, unknown>,
        name: modelToolName(connection.id, tool.name),
        title: tool.annotations?.title ?? null,
    }));
}

/** Rewrites a drifted snapshot; only a still-connected row, so a concurrent disconnect wins. */
async function syncToolSnapshot(
    db: HausDatabase,
    connection: { id: string; tools: readonly string[] },
    listed: readonly ListedTool[]
): Promise<void> {
    const tools = [...new Set(listed.map((tool) => tool.name))].sort();
    const stored = [...new Set(connection.tools)].sort();
    if (tools.length === stored.length && tools.every((tool, index) => tool === stored[index])) {
        return;
    }
    await db
        .update(mcpConnectionsTable)
        .set({ tools })
        .where(
            and(eq(mcpConnectionsTable.id, connection.id), eq(mcpConnectionsTable.connected, true))
        );
}
