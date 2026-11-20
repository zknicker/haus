import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { seedServerWithAllChannelAgent } from './all-homed-agent-seed.ts';
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
