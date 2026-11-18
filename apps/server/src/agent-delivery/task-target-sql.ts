import { type SQL, sql } from 'drizzle-orm';

/**
 * A scalar subquery: the `task:SEC-12` target of the Task whose Chat is
 * `chat`, or null for any other Chat. `chat` is the SQL alias of a `chats` row
 * in the enclosing query. Matches `taskTargetForChat`: the ledger entry's key
 * and the Task's number.
 */
export function taskTargetOfChatSql(chat: string): SQL {
    const alias = sql.raw(chat);
    return sql`(
        select 'task:' || task_key.key || '-' || task.number
        from tasks task
        join task_keys task_key
            on task_key.server_id = task.server_id and task_key.id = task.key_id
        where task.server_id = ${alias}.server_id and task.chat_id = ${alias}.id
    )`;
}
