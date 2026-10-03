import { and, eq, isNull, sql } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, serverMembershipsTable, usersTable } from '../postgres/schema.ts';
import { assertAgentDescriptionWrite } from '../server-agents/errors.ts';
import { AgentTargetError } from './resolve-target.ts';

export async function readAgentProfile(db: HausDatabase, runner: ResolvedRunner, target?: string) {
    const handle = stripAt(target ?? '');
    const [agent] = await db
        .select({
            description: agentsTable.description,
            handle: agentsTable.handle,
            id: agentsTable.id,
        })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, runner.serverId),
                target
                    ? sql`lower(${agentsTable.handle}) = lower(${handle})`
                    : eq(agentsTable.id, runner.agentId),
                isNull(agentsTable.retiredAt)
            )
        )
        .limit(1);
    if (!agent) {
        if (target) {
            const [human] = await db
                .select({
                    description: usersTable.description,
                    handle: serverMembershipsTable.handle,
                })
                .from(serverMembershipsTable)
                .innerJoin(usersTable, eq(usersTable.id, serverMembershipsTable.userId))
                .where(
                    and(
                        eq(serverMembershipsTable.serverId, runner.serverId),
                        sql`lower(${serverMembershipsTable.handle}) = lower(${handle})`,
                        isNull(serverMembershipsTable.revokedAt)
                    )
                )
                .limit(1);
            if (human?.handle) {
                return { profile: { ...human, isSelf: false } };
            }
        }
        throw new AgentTargetError('No visible participant has that handle.');
    }
    return {
        profile: {
            description: agent.description,
            handle: agent.handle,
            isSelf: agent.id === runner.agentId,
        },
    };
}

export async function updateAgentProfile(
    db: HausDatabase,
    runner: ResolvedRunner,
    description: string
) {
    const [current] = await db
        .select({ description: agentsTable.description })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, runner.serverId), eq(agentsTable.id, runner.agentId)))
        .limit(1);
    assertAgentDescriptionWrite(description, current?.description ?? null);
    const [agent] = await db
        .update(agentsTable)
        .set({ description })
        .where(
            and(
                eq(agentsTable.serverId, runner.serverId),
                eq(agentsTable.id, runner.agentId),
                isNull(agentsTable.retiredAt)
            )
        )
        .returning({ description: agentsTable.description, handle: agentsTable.handle });
    if (!agent) {
        throw new AgentTargetError('This Agent is not active.');
    }
    return { profile: { ...agent, isSelf: true } };
}

function stripAt(value: string) {
    return value.startsWith('@') ? value.slice(1) : value;
}
