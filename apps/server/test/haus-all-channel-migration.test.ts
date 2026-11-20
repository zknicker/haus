import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';

test('0140 names the everyone channel #all again and moves a user #all aside', async () => {
    const cluster = await startEmptyDatabase();
    const folder = await mkdtemp(join(tmpdir(), 'haus-all-channel-'));
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
        await writeFile(journalPath, through(139));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seedRenamedServer(database);

        await writeFile(journalPath, through(140));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0140_all-channel-returns',
        ]);

        expect(
            await database`SELECT id, name, is_all FROM chats WHERE kind = 'channel' ORDER BY id`
        ).toEqual([
            { id: 'cht_everyone', is_all: true, name: 'all' },
            { id: 'cht_user_all', is_all: false, name: 'all-3' },
            { id: 'cht_user_all2', is_all: false, name: 'all-2' },
        ]);
        expect(
            await database`SELECT id, chat_id FROM chat_messages ORDER BY id`
        ).toEqual([
            { chat_id: 'cht_everyone', id: 'msg_everyone' },
            { chat_id: 'cht_user_all', id: 'msg_user_all' },
        ]);
        await expect(
            database`INSERT INTO chats (id, server_id, kind, name, is_all)
                VALUES ('cht_bad', 'srv_all', 'channel', 'haus', true)`
        ).rejects.toThrow(/chats_shape/u);
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
});

async function seedRenamedServer(database: SQL) {
    await database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO servers (id, slug, display_name) VALUES ('srv_all', 'all-hq', 'All HQ')`;
        await tx`INSERT INTO users (id, auth_subject) VALUES ('usr_owner', 'subject-owner')`;
        await tx`INSERT INTO chats (id, server_id, kind, name, is_all, last_message_sequence)
            VALUES ('cht_everyone', 'srv_all', 'channel', 'haus', true, 1),
                   ('cht_user_all', 'srv_all', 'channel', 'all', false, 1),
                   ('cht_user_all2', 'srv_all', 'channel', 'all-2', false, 0)`;
        await tx`INSERT INTO chat_messages (id, server_id, chat_id, author_user_id, content, nonce, sequence)
            VALUES ('msg_everyone', 'srv_all', 'cht_everyone', 'usr_owner', 'hello all', 'n1', 1),
                   ('msg_user_all', 'srv_all', 'cht_user_all', 'usr_owner', 'hello user all', 'n2', 1)`;
    });
}
