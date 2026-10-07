import type { ServerTurnsInput, ServerTurnsPage } from '@haus/api';
import { and, desc, eq, inArray, lt, or } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentTurnsTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { readSettledTurns } from './list-agent-turns.ts';

/**
 * Every Agent's settled turns on one Server, newest first, for the Server-wide
 * Activity page. Any member sees every Agent (as `agent.list` and `agent.turns`
 * allow); each trigger keeps `agent.turns`' Chat-visibility gate. Pages are
 * keyset-paginated on `(startedAt, runId)`.
 */
export async function listServerTurns(
    db: HausDatabase,
    member: HausUser | null,
    input: ServerTurnsInput
): Promise<ServerTurnsPage> {
    await requireServerMembership(db, member, input.serverId);
    const before = input.before;
    const beforeAt = before ? new Date(before.startedAt) : null;

    const turns = await readSettledTurns(db, member, {
        limit: input.limit + 1,
        orderBy: [desc(agentTurnsTable.startedAt), desc(agentTurnsTable.runId)],
        where: and(
            eq(agentTurnsTable.serverId, input.serverId),
            input.agentIds ? inArray(agentTurnsTable.agentId, input.agentIds) : undefined,
            before && beforeAt
                ? or(
                      lt(agentTurnsTable.startedAt, beforeAt),
                      and(
                          eq(agentTurnsTable.startedAt, beforeAt),
                          lt(agentTurnsTable.runId, before.runId)
                      )
                  )
                : undefined
        ),
    });
    const page = turns.slice(0, input.limit);
    const last = page.at(-1);
    return {
        nextBefore:
            turns.length > input.limit && last
                ? { runId: last.runId, startedAt: last.startedAt }
                : null,
        turns: page,
    };
}
