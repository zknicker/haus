import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TASK_DESCRIPTION_MAX_CHARS, TASK_TITLE_MAX_CHARS } from '@haus/api';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startPostgresCluster } from './postgres-cluster.ts';

/**
 * Task limits count UTF-16 units and Postgres counts code points, so 0115 must
 * trim astral text to what a read accepts, or one migrated claim breaks every
 * read of the General board.
 */
test('0115 trims migrated claims to the limits a Task read enforces', async () => {
    const cluster = await startPostgresCluster();
    const folder = await mkdtemp(join(tmpdir(), 'haus-task-limits-'));
    const database = new SQL({ max: 1, url: cluster.databaseUrl });
    try {
        await cp(join(import.meta.dir, '../drizzle/postgres'), folder, { recursive: true });
        const journalPath = join(folder, 'meta/_journal.json');
        const journal = JSON.parse(await readFile(journalPath, 'utf8'));
        const through = (idx: number) =>
            JSON.stringify({
                ...journal,
                entries: journal.entries.filter((entry: { idx: number }) => entry.idx <= idx),
            });
        await writeFile(journalPath, through(114));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);

        const astralContent = '🔑'.repeat(15_000);
        await database.begin(async (tx) => {
            await tx`SET LOCAL session_replication_role = replica`;
            await tx`INSERT INTO servers (id, slug, display_name) VALUES ('srv_one', 'one', 'One')`;
            await tx`INSERT INTO users (id, auth_subject) VALUES ('usr_one', 'subject-one')`;
            await tx`INSERT INTO server_memberships (id, server_id, user_id, role)
                VALUES ('mem_one', 'srv_one', 'usr_one', 'owner')`;
            await tx`INSERT INTO chat_messages (id, server_id, chat_id, author_user_id, content, nonce, sequence)
                VALUES ('msg_astral', 'srv_one', 'cht_one', 'usr_one', ${astralContent}, 'n1', 1)`;
            await tx`INSERT INTO message_claims
                (server_id, chat_id, message_id, number, origin, status, priority,
                 created_by_user_id, created_at, updated_at)
                VALUES ('srv_one', 'cht_one', 'msg_astral', 1, 'composed', 'todo', 'none',
                        'usr_one', now(), now())`;
        });

        await writeFile(journalPath, through(115));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);

        const [task] = await database`SELECT title, description FROM tasks`;
        expect(task.title.length).toBeGreaterThan(0);
        expect(task.title.length).toBeLessThanOrEqual(TASK_TITLE_MAX_CHARS);
        expect(task.description.length).toBeGreaterThan(0);
        expect(task.description.length).toBeLessThanOrEqual(TASK_DESCRIPTION_MAX_CHARS);
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
}, 60_000);
