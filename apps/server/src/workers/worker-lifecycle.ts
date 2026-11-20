import { sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';

export async function syncWorkerLifecycle(tx: HausDatabase, serverId: string, workerId: string) {
    await tx.execute(sql`
        update workers set
            status = newest.status,
            started_at = newest.started_at,
            terminal_at = newest.terminal_at
        from (
            select status, started_at, terminal_at from worker_turns
            where server_id = ${serverId} and worker_id = ${workerId}
            order by created_at desc, id desc
            limit 1
        ) as newest
        where workers.server_id = ${serverId} and workers.id = ${workerId}
    `);
}
