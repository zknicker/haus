import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';

const productionThrough = 128;

test('every migration after 0128 applies in one transaction with an Agent homed in #all', async () => {
    const cluster = await startEmptyDatabase();
    const folder = await mkdtemp(join(tmpdir(), 'haus-chain-from-0128-'));
    const database = new SQL({ max: 1, url: cluster.databaseUrl });
    try {
        await cp(join(import.meta.dir, '../drizzle/postgres'), folder, { recursive: true });
        const journalPath = join(folder, 'meta/_journal.json');
        const fullJournal = await readFile(journalPath, 'utf8');
        const journal = JSON.parse(fullJournal) as { entries: { idx: number; tag: string }[] };
        await writeFile(
            journalPath,
            JSON.stringify({
                ...journal,
                entries: journal.entries.filter((entry) => entry.idx <= productionThrough),
            })
        );
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seedServerWithAllChannelAgent(database);

        await writeFile(journalPath, fullJournal);
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual(
            journal.entries
                .filter((entry) => entry.idx > productionThrough)
                .map((entry) => entry.tag)
        );

        expect(
            await database`SELECT agent.id, home.name AS home
                FROM agents agent JOIN chats home ON home.id = agent.home_project_id`
        ).toEqual([{ home: 'general', id: 'agt_homed' }]);
        expect(await database`SELECT name, is_all FROM chats WHERE id = 'cht_all'`).toEqual([
            { is_all: true, name: 'all' },
        ]);
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
});

async function seedServerWithAllChannelAgent(database: SQL) {
    await database.begin(async (tx) => {
        await tx`INSERT INTO servers (id, slug, display_name) VALUES ('srv_a', 'hq', 'HQ')`;
        await tx`INSERT INTO users (id, auth_subject) VALUES ('usr_a', 'subject-a')`;
        await tx`INSERT INTO server_memberships (id, server_id, user_id, role)
            VALUES ('mem_a', 'srv_a', 'usr_a', 'owner')`;
        await tx`INSERT INTO chats (id, server_id, kind, name, is_all)
            VALUES ('cht_all', 'srv_a', 'channel', 'all', true)`;
        await tx`INSERT INTO agents (id, server_id, handle, display_name, home_timezone)
            VALUES ('agt_homed', 'srv_a', 'homed', 'Homed', 'UTC')`;
    });
}
