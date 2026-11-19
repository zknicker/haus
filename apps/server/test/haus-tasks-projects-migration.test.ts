import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';
import { seedTasksBeforeProjects } from './tasks-projects-migration-seed.ts';

const migrationTag = '0131_tasks-belong-to-projects';

test('0131 puts every Task in a Project, moves its origin onto it, and homes every Agent', async () => {
    const cluster = await startEmptyDatabase();
    const folder = await mkdtemp(join(tmpdir(), 'haus-tasks-projects-'));
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
        await writeFile(journalPath, through(130));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seedTasksBeforeProjects(database);

        await writeFile(journalPath, through(131));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            migrationTag,
        ]);

        const tasks = await readTasks(database);
        expect(tasks).toEqual([
            task('tsk_gone', 'cht_sec', 'cht_gone', 'msg_gone', 'canceled', null),
            task('tsk_held', 'cht_ops', null, null, 'done', null),
            task('tsk_ops', 'cht_ops', 'cht_ops', 'msg_ops', 'open', 'cht_t_ops'),
            task('tsk_orphan', 'cht_haus', null, null, 'done', null),
            task('tsk_sec', 'cht_sec', 'cht_sec', 'msg_sec', 'open', 'cht_t_sec'),
        ]);
        expect(
            await database`SELECT id, home_project_id FROM agents ORDER BY id COLLATE "C"`
        ).toEqual([
            { home_project_id: 'cht_haus', id: 'agt_ada' },
            { home_project_id: 'cht_b_haus', id: 'agt_bob' },
        ]);
        expect(
            await database`SELECT column_name FROM information_schema.columns
                WHERE table_name = 'chats' AND column_name = 'anchor_message_id'`
        ).toEqual([]);

        await expect(
            settle(database`UPDATE tasks SET origin_message_id = null WHERE id = 'tsk_sec'`)
        ).rejects.toThrow(/tasks_origin_shape/u);
        await expect(
            settle(database`UPDATE tasks SET project_id = null WHERE id = 'tsk_sec'`)
        ).rejects.toThrow(/project_id/u);
        await expect(
            settle(database`UPDATE tasks SET project_id = 'cht_ops' WHERE id = 'tsk_sec'`)
        ).rejects.toThrow(/tasks_chat_project_fk/u);
        await expect(
            settle(database`UPDATE tasks SET origin_message_id = 'msg_ops' WHERE id = 'tsk_sec'`)
        ).rejects.toThrow(/tasks_origin_fk/u);
        await expect(
            settle(database`UPDATE agents SET home_project_id = 'cht_gone' WHERE id = 'agt_ada'`)
        ).rejects.toThrow(/agents_home_project_fk/u);
        await database`DELETE FROM chat_messages WHERE id = 'msg_sec'`;
        expect(
            await database`SELECT origin_chat_id, origin_message_id FROM tasks WHERE id = 'tsk_sec'`
        ).toEqual([{ origin_chat_id: null, origin_message_id: null }]);
        const afterOriginDelete = await readTasks(database);

        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([]);
        const replayed = await readFile(join(folder, `${migrationTag}.sql`), 'utf8');
        for (const statement of replayed.split('--> statement-breakpoint')) {
            await database.unsafe(statement);
        }
        expect(await readTasks(database)).toEqual(afterOriginDelete);
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
});

async function readTasks(database: SQL) {
    return await database`
        SELECT id, project_id, origin_chat_id, origin_message_id, state, chat_id, version
        FROM tasks ORDER BY id COLLATE "C"`;
}

function task(
    id: string,
    projectId: string,
    originChatId: string | null,
    originMessageId: string | null,
    state: string,
    chatId: string | null
) {
    return {
        chat_id: chatId,
        id,
        origin_chat_id: originChatId,
        origin_message_id: originMessageId,
        project_id: projectId,
        state,
        version: id === 'tsk_gone' ? 2 : 1,
    };
}

async function settle(query: PromiseLike<unknown>) {
    return await query;
}
