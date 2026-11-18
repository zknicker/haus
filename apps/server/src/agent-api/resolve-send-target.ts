import { and, eq, isNull, sql } from 'drizzle-orm';

import { ensureAgentDmRecord } from '../chats/ensure-agent-dm.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { serverMembershipsTable } from '../postgres/schema.ts';
import {
    AgentTargetError,
    MessageTargetRefusedError,
    resolveAgentTarget,
} from './resolve-target.ts';

/**
 * Send-only resolver: beyond the strict targets an Agent may already read, a
 * send may open the DM with a human it has not written to yet. A DM is between
 * a human and an Agent, so `dm:@<agent-handle>` resolves to nothing here.
 */
export async function resolveAgentSendTarget(
    db: HausDatabase,
    runner: ResolvedRunner,
    target: string
): Promise<string> {
    try {
        return await resolveAgentTarget(db, runner, target);
    } catch (cause) {
        if (!(cause instanceof AgentTargetError) || cause instanceof MessageTargetRefusedError) {
            throw cause;
        }
    }

    const directHumanHandle = parseDirectHumanHandle(target);
    if (directHumanHandle) {
        const [human] = await db
            .select({ userId: serverMembershipsTable.userId })
            .from(serverMembershipsTable)
            .where(
                and(
                    eq(serverMembershipsTable.serverId, runner.serverId),
                    sql`lower(${serverMembershipsTable.handle}) = lower(${directHumanHandle})`,
                    isNull(serverMembershipsTable.revokedAt)
                )
            )
            .limit(2);
        if (human) {
            return (
                await ensureAgentDmRecord(db, {
                    agentId: runner.agentId,
                    serverId: runner.serverId,
                    userId: human.userId,
                })
            ).id;
        }
    }
    throw new AgentTargetError();
}

function parseDirectHumanHandle(target: string) {
    if (!target.startsWith('dm:@')) {
        return null;
    }
    const value = target.slice('dm:@'.length);
    return value && !value.includes(':') ? value : null;
}
