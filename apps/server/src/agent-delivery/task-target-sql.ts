import { type SQL, sql } from 'drizzle-orm';

export function taskTargetOfChatSql(chat: string): SQL {
    const alias = sql.raw(chat);
    return sql`(
        select 'task:' || task.short_id
        from tasks task
        where task.server_id = ${alias}.server_id and task.chat_id = ${alias}.id
    )`;
}
