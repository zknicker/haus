import { type SQL, sql } from 'drizzle-orm';
import type { AdventFactStats } from '../fact-stats.ts';
import { type AdventScope, memberAgents } from '../year-scope.ts';
import type { MessageColumns } from './message-columns.ts';
import { type AdventReader, readRow } from './read-row.ts';

/**
 * The member's Agents. A message is addressed to an Agent when it sits in that
 * Agent's DM (or a Thread under it) or carries an `agent://` mention of it.
 * Message content is matched inside PostgreSQL and never selected out.
 */

/** A rich Agent mention, `[@Name](agent://agt_…)`; group 1 is the Agent id. */
export const agentMentionPattern = '\\(agent://([A-Za-z0-9_-]+)\\)';

/**
 * Thank-you words, matched case-insensitively on word boundaries (PostgreSQL
 * `\m` / `\M`). Kept short on purpose: a miss is cheaper than a false thanks.
 */
export const thanksPattern =
    '\\m(thanks|thank you|thank u|thankyou|thx|ty|tysm|tyvm|cheers|much appreciated|appreciate it)\\M';

/**
 * CTE `addressed(message_id, agent_id, thanked)`: each Agent a message in
 * `mine` addresses, once per message, and whether that message thanks it.
 * The only reader of `mine.content`.
 */
export function addressedCte(scope: AdventScope): SQL {
    return sql`addressed as materialized (
        select source.id as message_id, room.dm_agent_id as agent_id,
            source.content ~* ${thanksPattern} as thanked
        from mine source
        join chats room on room.server_id = ${scope.serverId} and room.id = source.room_id
        where room.dm_agent_id is not null
        union
        select source.id as message_id, mention[1] as agent_id,
            source.content ~* ${thanksPattern} as thanked
        from mine source
        cross join lateral regexp_matches(source.content, ${agentMentionPattern}, 'g') as mention
    )`;
}

/** Columns over the `addressed` CTE; the pass adds it when one is requested. */
export const agentColumns: MessageColumns<'agents-at-table' | 'most-thanked-agent'> = {
    'agents-at-table': (scope) => sql`(
        select json_build_object('count', count(distinct agent.id)::int)
        from addressed
        join agents agent on agent.server_id = ${scope.serverId} and agent.id = addressed.agent_id
        having count(distinct agent.id) > 0
    )`,
    'most-thanked-agent': (scope) => sql`(
        select json_build_object('name', agent.display_name, 'count', count(*)::int)
        from addressed
        join agents agent on agent.server_id = ${scope.serverId} and agent.id = addressed.agent_id
        where addressed.thanked
        group by agent.id, agent.display_name
        order by count(*) desc, agent.display_name asc
        limit 1
    )`,
};

/** Tokens from the daily usage cube for the member's Agents, by UTC usage date. */
export async function readTokensUsed(
    db: AdventReader,
    scope: AdventScope
): Promise<AdventFactStats['tokens-used'] | null> {
    const row = await readRow<{ tokens: number }>(
        db,
        sql`
            with member_agents as (${memberAgents(scope)})
            select coalesce(sum(usage.total_tokens), 0)::float8 as tokens
            from agent_token_usage_daily usage
            join member_agents on member_agents.id = usage.agent_id
            where ${usageInYear(scope)}
        `
    );
    return row && row.tokens > 0 ? row : null;
}

export async function readHardestWorker(
    db: AdventReader,
    scope: AdventScope
): Promise<AdventFactStats['hardest-worker'] | null> {
    return await readRow(
        db,
        sql`
            with member_agents as (${memberAgents(scope)})
            select member_agents.display_name as name, sum(usage.turn_count)::int as turns
            from agent_token_usage_daily usage
            join member_agents on member_agents.id = usage.agent_id
            where ${usageInYear(scope)}
            group by member_agents.id, member_agents.display_name
            having sum(usage.turn_count) > 0
            order by turns desc, name asc
            limit 1
        `
    );
}

function usageInYear(scope: AdventScope) {
    return sql`usage.server_id = ${scope.serverId}
        and usage.date >= make_date(${scope.year}::int, 1, 1)
        and usage.date < make_date(${scope.year + 1}::int, 1, 1)`;
}
