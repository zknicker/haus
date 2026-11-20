import { and, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, artifactsTable as artifacts } from '../postgres/schema.ts';
import { softDeleteArtifacts } from './delete.ts';
import { lockLiveServer } from './move.ts';
import { insideFolder, live } from './path.ts';
import { ArtifactError } from './storage.ts';

export async function deleteAgentAreaIn(
    tx: HausDatabase,
    input: { agentId: string; resetBy: string; serverId: string }
) {
    await lockLiveServer(tx, input.serverId);
    const [agent] = await tx
        .update(agentsTable)
        .set({ resetGeneration: sql`${agentsTable.resetGeneration} + 1` })
        .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)))
        .returning({ handle: agentsTable.handle, id: agentsTable.id });
    if (!agent) {
        throw new ArtifactError('Agent was not found.', 404, 'NOT_FOUND');
    }
    const root = `agents/${agent.handle}`;
    const rows = await tx
        .select()
        .from(artifacts)
        .where(and(live(input.serverId), insideFolder(root)));
    await softDeleteArtifacts(
        tx,
        input.serverId,
        rows.map((artifact) => ({
            artifact,
            placement: { area: `agent:${agent.id}`, path: artifact.path, root },
        })),
        input.resetBy
    );
    return rows.length;
}
