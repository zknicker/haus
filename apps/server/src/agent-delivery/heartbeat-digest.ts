import {
    type AgentHeartbeatAttention,
    type HeartbeatDigestEntry,
    heartbeatDigestEntryLimit,
} from '@haus/api';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { targetForChat } from '../agent-api/message-view.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentRunTriggersTable } from '../postgres/schema.ts';

export type HeartbeatKind = AgentHeartbeatAttention['kind'];
export type HeartbeatDigest = AgentHeartbeatAttention['digest'];

/** Nothing before this window is digested when an Agent has never run a heartbeat. */
const firstRunLookbackMs = 24 * 60 * 60 * 1000;
/** Chats considered per digest, before ordering and the entry cap. */
const candidateChatLimit = 200;
const speakerLimit = 6;

/** The inbox/run-trigger source of each run kind. */
export const heartbeatSources = { daytime: 'heartbeat', nightly: 'dream' } as const;

export function heartbeatKindOf(source: string): HeartbeatKind | null {
    return source === 'dream' ? 'nightly' : source === 'heartbeat' ? 'daytime' : null;
}

/**
 * When the previous run this one continues from started: a nightly run follows
 * the last `dream`; a daytime run follows the later of the last `dream` or
 * `heartbeat`. The run's own trigger is excluded, so a resend rebuilds the same
 * cutoff. Null when the Agent has never run one.
 */
export async function readHeartbeatSince(
    db: HausDatabase,
    input: { agentId: string; kind: HeartbeatKind; runId: string; serverId: string }
): Promise<Date | null> {
    const sources = input.kind === 'nightly' ? ['dream'] : ['dream', 'heartbeat'];
    const [row] = await db
        .select({ at: agentRunTriggersTable.createdAt })
        .from(agentRunTriggersTable)
        .where(
            and(
                eq(agentRunTriggersTable.serverId, input.serverId),
                eq(agentRunTriggersTable.agentId, input.agentId),
                inArray(agentRunTriggersTable.source, sources),
                ne(agentRunTriggersTable.runId, input.runId)
            )
        )
        .orderBy(desc(agentRunTriggersTable.createdAt))
        .limit(1);
    return row?.at ?? null;
}

interface ChatRow {
    addressed: boolean;
    afterSequence: number;
    chatId: string;
    kind: 'channel' | 'dm' | 'thread';
    messageCount: number;
    name: string | null;
    parentKind: 'channel' | 'dm' | null;
    parentName: string | null;
}

interface SpeakerRow {
    chatId: string;
    lastSequence: number;
    name: string;
}

/**
 * The conversations the Agent took part in between `since` (or a day before
 * `until`, on a first run) and `until`: it posted, was mentioned or addressed, or
 * a Thread it follows moved. No bodies; the Agent reads them with
 * `haus message read`. Addressed first, then busiest, capped at 20.
 */
export async function buildHeartbeatDigest(
    db: HausDatabase,
    input: { agentId: string; serverId: string; since: Date | null; until: Date }
): Promise<HeartbeatDigest> {
    const cutoff = input.since ?? new Date(input.until.getTime() - firstRunLookbackMs);
    const chats = (await readChats(db, input, cutoff))
        .filter((chat) => chat.messageCount > 0)
        .sort(
            (a, b) =>
                Number(b.addressed) - Number(a.addressed) ||
                b.messageCount - a.messageCount ||
                a.chatId.localeCompare(b.chatId)
        );
    const shown = chats.slice(0, heartbeatDigestEntryLimit);
    const speakers = await readSpeakers(
        db,
        input,
        cutoff,
        shown.map((chat) => chat.chatId)
    );
    const entries: HeartbeatDigestEntry[] = [];
    for (const chat of shown) {
        const target = await readTarget(db, input.serverId, chat.chatId);
        if (target === null) {
            continue;
        }
        const names = (speakers.get(chat.chatId) ?? []).map(({ name }) => `@${name}`);
        entries.push({
            addressed: chat.addressed,
            afterSequence: chat.afterSequence,
            chatId: chat.chatId,
            kind: chat.kind,
            lastSpeaker: names[0] ?? null,
            messageCount: chat.messageCount,
            speakers: names.slice(0, speakerLimit),
            target,
            title: titleOf(chat),
        });
    }
    return { entries, more: Math.max(0, chats.length - shown.length) };
}

async function readChats(
    db: HausDatabase,
    input: { agentId: string; serverId: string; until: Date },
    cutoff: Date
): Promise<ChatRow[]> {
    const { agentId, serverId } = input;
    const since = cutoff.toISOString();
    const until = input.until.toISOString();
    return (await db.execute(sql`
        with mine as (
            select message.chat_id
            from chat_messages message
            where message.server_id = ${serverId}
              and message.author_agent_id = ${agentId}
              and message.created_at > ${since}::timestamptz
              and message.created_at <= ${until}::timestamptz
            union
            select item.chat_id
            from agent_inbox item
            where item.server_id = ${serverId}
              and item.agent_id = ${agentId}
              and item.chat_id is not null
              and item.created_at > ${since}::timestamptz
              and item.created_at <= ${until}::timestamptz
              and (
                  item.mentioned
                  or item.addressed_reason in ('dm', 'mention')
                  or exists (
                      select 1 from chats thread
                      where thread.server_id = item.server_id
                        and thread.id = item.chat_id
                        and thread.kind = 'thread'
                  )
              )
            limit ${candidateChatLimit}
        )
        select
            exists (
                select 1 from agent_inbox item
                where item.server_id = chat.server_id
                  and item.agent_id = ${agentId}
                  and item.chat_id = chat.id
                  and item.created_at > ${since}::timestamptz
                  and item.created_at <= ${until}::timestamptz
                  and (item.mentioned or item.addressed_reason is not null)
            ) as "addressed",
            coalesce((
                select max(message.sequence) from chat_messages message
                where message.server_id = chat.server_id
                  and message.chat_id = chat.id
                  and message.created_at <= ${since}::timestamptz
            ), 0)::int as "afterSequence",
            chat.id as "chatId",
            chat.kind as "kind",
            (
                select count(*) from chat_messages message
                where message.server_id = chat.server_id
                  and message.chat_id = chat.id
                  and message.created_at > ${since}::timestamptz
                  and message.created_at <= ${until}::timestamptz
            )::int as "messageCount",
            chat.name as "name",
            parent.kind as "parentKind",
            parent.name as "parentName"
        from chats chat
        left join chats parent
            on parent.server_id = chat.server_id and parent.id = chat.parent_chat_id
        where chat.server_id = ${serverId}
          and chat.deleted_at is null
          and chat.id in (select chat_id from mine)
    `)) as ChatRow[];
}

/** Who spoke in each chat since the cutoff, most recent speaker first. */
async function readSpeakers(
    db: HausDatabase,
    input: { serverId: string; until: Date },
    cutoff: Date,
    chatIds: string[]
): Promise<Map<string, SpeakerRow[]>> {
    const byChat = new Map<string, SpeakerRow[]>();
    if (chatIds.length === 0) {
        return byChat;
    }
    const rows = (await db.execute(sql`
        select
            message.chat_id as "chatId",
            max(message.sequence)::int as "lastSequence",
            coalesce(agent.handle, membership.handle, 'someone') as "name"
        from chat_messages message
        left join agents agent
            on agent.server_id = message.server_id and agent.id = message.author_agent_id
        left join server_memberships membership
            on membership.server_id = message.server_id and membership.user_id = message.author_user_id
        where message.server_id = ${input.serverId}
          and message.chat_id in (${sql.join(
              chatIds.map((id) => sql`${id}`),
              sql`, `
          )})
          and message.created_at > ${cutoff.toISOString()}::timestamptz
          and message.created_at <= ${input.until.toISOString()}::timestamptz
        group by message.chat_id, coalesce(agent.handle, membership.handle, 'someone')
    `)) as SpeakerRow[];
    for (const row of rows) {
        byChat.set(row.chatId, [...(byChat.get(row.chatId) ?? []), row]);
    }
    for (const list of byChat.values()) {
        list.sort((a, b) => b.lastSequence - a.lastSequence);
    }
    return byChat;
}

/**
 * The handle `--target` accepts. A DM whose human has left has no handle and
 * nothing to catch up on, so it drops out of the digest rather than failing the run.
 */
async function readTarget(
    db: HausDatabase,
    serverId: string,
    chatId: string
): Promise<string | null> {
    try {
        const target = await targetForChat(db, serverId, chatId);
        return target === '#unknown' ? null : target;
    } catch {
        return null;
    }
}

function titleOf(chat: ChatRow): string {
    if (chat.kind === 'dm') {
        return 'DM';
    }
    if (chat.kind === 'channel') {
        return `#${chat.name ?? 'unnamed'}`;
    }
    return `Thread in ${chat.parentKind === 'dm' ? 'DM' : `#${chat.parentName ?? 'unnamed'}`}`;
}
