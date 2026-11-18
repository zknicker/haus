import type { AgentSelfProfileUpdateInput } from '@haus/api';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, serverMembershipsTable, usersTable } from '../postgres/schema.ts';
import { writeAgentConversationStyle } from '../server-agents/agent-conversation-style.ts';
import { assertAgentDescriptionWrite } from '../server-agents/errors.ts';
import { AgentTargetError } from './resolve-target.ts';

export async function readAgentProfile(db: HausDatabase, runner: ResolvedRunner, target?: string) {
    const handle = stripAt(target ?? '');
    const [agent] = await db
        .select({
            conversationStyle: agentsTable.conversationStyle,
            description: agentsTable.description,
            handle: agentsTable.handle,
            id: agentsTable.id,
            signatureEmoji: agentsTable.signatureEmoji,
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
    const profile = { description: agent.description, handle: agent.handle };
    // The conversation style is private: only the Agent itself reads it here.
    return agent.id === runner.agentId
        ? {
              profile: {
                  ...profile,
                  conversationStyle: agent.conversationStyle,
                  isSelf: true,
                  signatureEmoji: agent.signatureEmoji,
              },
          }
        : { profile: { ...profile, isSelf: false } };
}

/**
 * An Agent's write of its own profile; there is no target, so it can only change itself. One
 * transaction holds the Agent row, so a refused field leaves every other field unwritten.
 */
export async function updateAgentProfile(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: AgentSelfProfileUpdateInput
) {
    const self = { agentId: runner.agentId, serverId: runner.serverId };
    return await db.transaction(async (tx) => {
        const [current] = await tx
            .select({ description: agentsTable.description })
            .from(agentsTable)
            .where(
                and(
                    eq(agentsTable.serverId, runner.serverId),
                    eq(agentsTable.id, runner.agentId),
                    isNull(agentsTable.retiredAt)
                )
            )
            .limit(1)
            .for('update');
        if (!current) {
            throw new AgentTargetError('This Agent is not active.');
        }
        if (input.description !== undefined) {
            assertAgentDescriptionWrite(input.description, current.description);
        }
        const style = await writeAgentConversationStyle(tx, self, input);
        const [agent] = await tx
            .update(agentsTable)
            .set({ description: input.description ?? current.description })
            .where(
                and(eq(agentsTable.serverId, runner.serverId), eq(agentsTable.id, runner.agentId))
            )
            .returning({ description: agentsTable.description, handle: agentsTable.handle });
        if (!agent) {
            throw new AgentTargetError('This Agent is not active.');
        }
        return { profile: { ...agent, ...style, isSelf: true } };
    });
}

function stripAt(value: string) {
    return value.startsWith('@') ? value.slice(1) : value;
}
