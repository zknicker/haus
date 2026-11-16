import { type SQL, sql } from 'drizzle-orm';
import { visibleChats } from '../chats/chat-visibility.ts';
import { chatsTable } from '../postgres/schema.ts';
import type { TaskActor } from './task-actor.ts';

/**
 * The Chats a Task actor can read, as a predicate on `chats`: the human rule
 * (`visibleChats`) for a person, and for an Agent its own DM, the Channels it
 * participates in, and Threads under either (the `requireAgentChatAccess` rule).
 * A Task is visible to everyone; the messages that mention it are not, so
 * Mentioned in, the Task Inbox context message, and Convert to Task all read
 * messages through this.
 */
export function actorVisibleChats(actor: TaskActor): SQL {
    return actor.kind === 'user' ? visibleChats(actor.userId) : agentVisibleChats(actor.agentId);
}

function agentVisibleChats(agentId: string): SQL {
    return sql`(
        (${chatsTable.kind} = 'dm' and ${chatsTable.dmAgentId} = ${agentId})
        or exists (
            select 1 from channel_agent_participants participant
            where participant.server_id = ${chatsTable.serverId}
                and participant.chat_id = ${chatsTable.id}
                and participant.agent_id = ${agentId}
        )
        or (
            ${chatsTable.kind} = 'thread'
            and exists (
                select 1 from chats parent
                where parent.server_id = ${chatsTable.serverId}
                    and parent.id = ${chatsTable.parentChatId}
                    and parent.deleted_at is null
                    and (
                        (parent.kind = 'dm' and parent.dm_agent_id = ${agentId})
                        or exists (
                            select 1 from channel_agent_participants parent_participant
                            where parent_participant.server_id = parent.server_id
                                and parent_participant.chat_id = parent.id
                                and parent_participant.agent_id = ${agentId}
                        )
                    )
            )
        )
    )`;
}
