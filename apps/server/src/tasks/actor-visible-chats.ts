import { type SQL, sql } from 'drizzle-orm';
import { visibleChats } from '../chats/chat-visibility.ts';
import { chatsTable } from '../postgres/schema.ts';
import type { TaskActor } from './task-actor.ts';

/**
 * The Chats a Task actor can read, as a predicate on `chats`: the human rule
 * (`visibleChats`) for a person, and for an Agent every Captain chat, every live
 * Project channel, and every Task Chat under one, as Projects are open (the
 * `requireAgentChatAccess` rule).
 * A Task is visible to everyone; the messages that mention it are not, so
 * Mentioned in, the Task Inbox context message, and Convert to Task all read
 * messages through this.
 */
export function actorVisibleChats(actor: TaskActor): SQL {
    return actor.kind === 'user' ? visibleChats(actor.userId) : agentVisibleChats();
}

function agentVisibleChats(): SQL {
    return sql`(
        ${chatsTable.kind} = 'captain'
        or (${chatsTable.kind} = 'channel' and ${chatsTable.deletedAt} is null)
        or (
            ${chatsTable.kind} = 'task'
            and exists (
                select 1 from chats parent
                where parent.server_id = ${chatsTable.serverId}
                    and parent.id = ${chatsTable.parentChatId}
                    and parent.deleted_at is null
            )
        )
    )`;
}
