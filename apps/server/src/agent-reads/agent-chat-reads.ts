import { sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';

type ReadWriter = Pick<HausDatabase, 'execute'>;

interface AgentChat {
    agentId: string;
    chatId: string;
    serverId: string;
}

/**
 * An Agent's durable read position in one Chat (`agent_chat_reads`): what
 * `haus inbox check` counts unread against and where `message read --unread`
 * starts. Every write here is monotonic. A missing row reads as 0.
 *
 * Per-Chat sequences are allocated by `update chats ... + 1` inside the
 * sending transaction, so the Chat row lock serializes them through commit:
 * no reader can see sequence N+1 before N. Raft's 3s settle window exists for
 * a store without that guarantee, so Haus advances without one.
 */
export async function readAgentChatRead(db: ReadWriter, input: AgentChat): Promise<number> {
    const rows = (await db.execute(sql`
        select sequence from agent_chat_reads
        where server_id = ${input.serverId}
          and agent_id = ${input.agentId}
          and chat_id = ${input.chatId}
    `)) as Array<{ sequence: number }>;
    return rows[0]?.sequence ?? 0;
}

/**
 * Starts (or restarts) the read position when the Agent becomes a member: a
 * channel join, a DM, a Thread follow. History from before the membership is
 * not unread. A membership caused by a message — a reply or @mention that
 * follows the Agent into a Thread — leaves that message unread.
 */
export async function openAgentChatRead(
    db: ReadWriter,
    input: AgentChat & { causeMessageId?: string | null }
) {
    await db.execute(sql`
        insert into agent_chat_reads (server_id, agent_id, chat_id, sequence)
        select chat.server_id, ${input.agentId}, chat.id, greatest(0, coalesce(
            (
                select cause.sequence - 1 from chat_messages cause
                where cause.server_id = chat.server_id
                  and cause.chat_id = chat.id
                  and cause.id = ${input.causeMessageId ?? null}
            ),
            chat.last_message_sequence
        ))
        from chats chat
        where chat.server_id = ${input.serverId} and chat.id = ${input.chatId}
        on conflict (server_id, agent_id, chat_id) do update
        set sequence = greatest(agent_chat_reads.sequence, excluded.sequence), updated_at = now()
    `);
}

/** Moves the read position through `through`: an `--unread` read. */
export async function advanceAgentChatRead(db: ReadWriter, input: AgentChat & { through: number }) {
    await db.execute(sql`
        insert into agent_chat_reads (server_id, agent_id, chat_id, sequence)
        values (${input.serverId}, ${input.agentId}, ${input.chatId}, ${input.through})
        on conflict (server_id, agent_id, chat_id) do update
        set sequence = greatest(agent_chat_reads.sequence, excluded.sequence), updated_at = now()
    `);
}

/**
 * A plain history page `[from, through]` moves the read position only when it
 * continues it: no message sits between the position and `from`. Browsing
 * with `--after` above older unread leaves the position where it is.
 */
export async function advanceAgentChatReadContiguous(
    db: ReadWriter,
    input: AgentChat & { from: number; through: number }
) {
    await db.execute(sql`
        insert into agent_chat_reads (server_id, agent_id, chat_id, sequence)
        select ${input.serverId}, ${input.agentId}, ${input.chatId}, ${input.through}
        where not exists (
            select 1 from chat_messages skipped
            where skipped.server_id = ${input.serverId}
              and skipped.chat_id = ${input.chatId}
              and skipped.sequence < ${input.from}
              and skipped.sequence > coalesce((
                  select position.sequence from agent_chat_reads position
                  where position.server_id = ${input.serverId}
                    and position.agent_id = ${input.agentId}
                    and position.chat_id = ${input.chatId}
              ), 0)
        )
        on conflict (server_id, agent_id, chat_id) do update
        set sequence = greatest(agent_chat_reads.sequence, excluded.sequence), updated_at = now()
    `);
}

/**
 * Delivery-seen, and the Agent's own send or task create (Raft's
 * `markAgentOwnSendRead`): after exact visibility records bodies the model was shown,
 * each Chat's read position moves to the highest S such that every message in
 * (position, S] written by someone else is exactly visible to this Agent in
 * its current session. Earlier sessions advanced the position when they
 * recorded their own visibility.
 */
export async function advanceAgentChatReadsSeen(
    db: ReadWriter,
    input: { agentId: string; chatIds: string[]; serverId: string }
) {
    const chatIds = [...new Set(input.chatIds)];
    if (chatIds.length === 0) {
        return;
    }
    await db.execute(sql`
        insert into agent_chat_reads (server_id, agent_id, chat_id, sequence)
        select ${input.serverId}, ${input.agentId}, boundary.chat_id, boundary.through
        from (
            select target.chat_id, position.sequence as base, coalesce(
                (
                    select min(unseen.sequence) - 1 from chat_messages unseen
                    where unseen.server_id = ${input.serverId}
                      and unseen.chat_id = target.chat_id
                      and unseen.sequence > position.sequence
                      and unseen.author_agent_id is distinct from ${input.agentId}
                      and not exists (
                          select 1 from agent_inbox_exact_visibility visible
                          where visible.server_id = unseen.server_id
                            and visible.agent_id = ${input.agentId}
                            and visible.session_generation = agent.session_generation
                            and visible.chat_id = unseen.chat_id
                            and visible.message_id = unseen.id
                      )
                ),
                (
                    select max(latest.sequence) from chat_messages latest
                    where latest.server_id = ${input.serverId}
                      and latest.chat_id = target.chat_id
                )
            ) as through
            from unnest(array[${sql.join(
                chatIds.map((chatId) => sql`${chatId}`),
                sql`, `
            )}]::text[]) as target(chat_id)
            join agents agent on agent.server_id = ${input.serverId}
                and agent.id = ${input.agentId}
            cross join lateral (
                select coalesce((
                    select read.sequence from agent_chat_reads read
                    where read.server_id = ${input.serverId}
                      and read.agent_id = ${input.agentId}
                      and read.chat_id = target.chat_id
                ), 0) as sequence
            ) position
        ) boundary
        where boundary.through > boundary.base
        on conflict (server_id, agent_id, chat_id) do update
        set sequence = greatest(agent_chat_reads.sequence, excluded.sequence), updated_at = now()
    `);
}
