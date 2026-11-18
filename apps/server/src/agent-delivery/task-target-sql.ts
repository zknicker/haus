import { type SQL, sql } from 'drizzle-orm';

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
