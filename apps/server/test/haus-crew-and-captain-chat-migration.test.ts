import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';

test('0164 renames Task chat dm rows to task_chat and deletes other dm rows', async () => {
    const cluster = await startEmptyDatabase();
    const folder = await mkdtemp(join(tmpdir(), 'haus-crew-captain-chat-'));
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
        await writeFile(journalPath, through(162));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seedInbox(database);

        await writeFile(journalPath, through(163));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0164_crew-and-captain-chat',
        ]);
        expect(
            await database`SELECT id, addressed_reason, delivery FROM agent_inbox ORDER BY id`
        ).toEqual([
            { addressed_reason: 'mention', delivery: 'steer', id: 'inb_mentionrow000001' },
            { addressed_reason: 'task_chat', delivery: 'steer', id: 'inb_taskchatdm000001' },
            { addressed_reason: null, delivery: 'steer', id: 'inb_unaddressed00001' },
        ]);
        await expect(insert(database, 'inb_newdmrow00000001', 'dm')).rejects.toThrow(
            /agent_inbox_addressed_reason/u
        );
        await insert(database, 'inb_captainchat00001', 'captain_chat');
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
});

async function seedInbox(database: SQL) {
    await database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO servers (id, slug, display_name) VALUES ('srv_one', 'one', 'One')`;
        await tx`INSERT INTO chats (id, server_id, kind, name) VALUES ('cht_ops', 'srv_one', 'channel', 'ops')`;
        await tx`INSERT INTO chats (id, server_id, kind, parent_chat_id, parent_chat_kind)
            VALUES ('cht_task', 'srv_one', 'task', 'cht_ops', 'channel')`;
        await tx`INSERT INTO agent_inbox (id, server_id, agent_id, chat_id, content, dedupe_key,
                source, state, addressed_reason)
            VALUES
                ('inb_taskchatdm000001', 'srv_one', 'agt_task', 'cht_task', 'go', 'msg_task',
                    'human', 'queued', 'dm'),
                ('inb_retireddm0000001', 'srv_one', 'agt_one', 'cht_gone', 'hi', 'msg_gone',
                    'human', 'seen', 'dm'),
                ('inb_mentionrow000001', 'srv_one', 'agt_one', 'cht_ops', 'hey', 'msg_ops',
                    'human', 'queued', 'mention'),
                ('inb_unaddressed00001', 'srv_one', 'agt_one', 'cht_ops', 'fyi', 'msg_fyi',
                    'human', 'queued', null)`;
    });
}

function insert(database: SQL, id: string, addressedReason: string) {
    return database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO agent_inbox (id, server_id, agent_id, chat_id, content, dedupe_key,
                source, addressed_reason)
            VALUES (${id}, 'srv_one', 'agt_one', 'cht_ops', 'x', ${id}, 'human', ${addressedReason})`;
    });
}
