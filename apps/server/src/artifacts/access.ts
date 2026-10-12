import { and, eq, isNull } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, serversTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { ArtifactError } from './storage.ts';

export type ArtifactActor =
    | { kind: 'agent'; runner: ResolvedRunner }
    | { kind: 'human'; member: HausUser | null; serverId: string };
export async function artifactAccess(db: HausDatabase, actor: ArtifactActor) {
    if (actor.kind === 'human') {
        const server = await requireServerMembership(db, actor.member, actor.serverId);
        if (!actor.member) {
            throw new ArtifactError('Server membership is required.', 403, 'FORBIDDEN');
        }
        return {
            agentId: null,
            authorKey: `user:${actor.member.id}`,
            isAdmin: server.role === 'owner' || server.role === 'admin',
            serverId: server.id,
            slug: server.slug,
            userId: actor.member.id,
        };
    }
    const [row] = await db
        .select({ slug: serversTable.slug })
        .from(serversTable)
        .innerJoin(agentsTable, eq(agentsTable.serverId, serversTable.id))
        .where(
            and(
                eq(serversTable.id, actor.runner.serverId),
                eq(agentsTable.id, actor.runner.agentId),
                isNull(serversTable.deletedAt),
                isNull(agentsTable.retiredAt)
            )
        )
        .limit(1);
    if (!row) {
        throw new ArtifactError('Agent is no longer a Server member.', 403, 'FORBIDDEN');
    }
    return {
        agentId: actor.runner.agentId,
        authorKey: `agent:${actor.runner.agentId}`,
        isAdmin: false,
        serverId: actor.runner.serverId,
        slug: row.slug,
        userId: null,
    };
}
export type ArtifactAccess = Awaited<ReturnType<typeof artifactAccess>>;
