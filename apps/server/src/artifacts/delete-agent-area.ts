import { and, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, artifactsTable as artifacts } from '../postgres/schema.ts';
import { artifactUpdatedTopic } from '../realtime/topics.ts';
import { type ArtifactActor, artifactAccess } from './access.ts';
import { softDeleteArtifacts } from './delete.ts';
import { lockLiveServer } from './move.ts';
import { insideFolder, live } from './path.ts';
import { ArtifactError } from './storage.ts';

export async function deleteAgentArea(db: HausDatabase, actor: ArtifactActor, agentId: string) {
    const access = await artifactAccess(db, actor);
    const deleted = await db.transaction(async (tx) => {
        await lockLiveServer(tx, access.serverId);
        const [agent] = await tx
            .select({ handle: agentsTable.handle, id: agentsTable.id })
            .from(agentsTable)
            .where(and(eq(agentsTable.serverId, access.serverId), eq(agentsTable.id, agentId)))
            .limit(1);
        if (!agent) {
            throw new ArtifactError('Agent was not found.', 404, 'NOT_FOUND');
        }
        await tx
            .update(agentsTable)
            .set({ fullResetAt: sql`now()` })
            .where(and(eq(agentsTable.serverId, access.serverId), eq(agentsTable.id, agent.id)));
        const root = `agents/${agent.handle}`;
        const rows = await tx
            .select()
            .from(artifacts)
            .where(and(live(access.serverId), insideFolder(root)));
        await softDeleteArtifacts(
            tx,
            access.serverId,
            rows.map((artifact) => ({
                artifact,
                placement: { area: `agent:${agent.id}`, path: artifact.path, root },
            }))
        );
        return rows.map((artifact) => artifact.id);
    });
    if (deleted.length > 0) {
        artifactUpdatedTopic.announce({ artifactId: null, serverId: access.serverId });
    }
    return deleted;
}
