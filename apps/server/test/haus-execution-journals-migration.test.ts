import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startPostgresCluster } from './postgres-cluster.ts';

test('execution journal tables key records by run and cascade from the Agent', async () => {
    const cluster = await startPostgresCluster();
    const folder = await mkdtemp(join(tmpdir(), 'haus-execution-journals-'));
    const database = new SQL({ max: 1, url: cluster.databaseUrl });
    try {
        await cp(join(import.meta.dir, '../drizzle/postgres'), folder, { recursive: true });
        const journalPath = join(folder, 'meta/_journal.json');
        const journal = JSON.parse(await readFile(journalPath, 'utf8'));
        const through = (idx: number) =>
            writeFile(
                journalPath,
                JSON.stringify({
                    ...journal,
                    entries: journal.entries.filter((entry: { idx: number }) => entry.idx <= idx),
                })
            );
        await through(89);
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await database`INSERT INTO servers (id, display_name, slug)
            VALUES ('srv_one', 'One', 'one')`;
        await database`INSERT INTO agents (id, server_id, handle, display_name, home_timezone)
            VALUES ('agt_one', 'srv_one', 'scout', 'Scout', 'UTC')`;

        await through(90);
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0090_agent-execution-journals',
        ]);
        await database`INSERT INTO agent_execution_journals
            (server_id, agent_id, run_id, run_started_at)
            VALUES ('srv_one', 'agt_one', 'run_one', now())`;
        await database`INSERT INTO agent_execution_journal_records
            (server_id, agent_id, run_id, sequence, record)
            VALUES ('srv_one', 'agt_one', 'run_one', 1, '{"type":"finish"}'::jsonb)`;
        const duplicate = await database`INSERT INTO agent_execution_journal_records
            (server_id, agent_id, run_id, sequence, record)
            VALUES ('srv_one', 'agt_one', 'run_one', 1, '{"type":"finish"}'::jsonb)`
            .then(() => null)
            .catch((error: Error) => error.message);
        expect(duplicate).toContain('agent_execution_journal_records_pkey');
        const orphan = await database`INSERT INTO agent_execution_journal_records
            (server_id, agent_id, run_id, sequence, record)
            VALUES ('srv_one', 'agt_one', 'run_missing', 1, '{}'::jsonb)`
            .then(() => null)
            .catch((error: Error) => error.message);
        expect(orphan).toContain('agent_execution_journal_records_run_fk');

        await database`DELETE FROM agents WHERE id = 'agt_one'`;
        const [left] = await database`SELECT
            (SELECT count(*)::int FROM agent_execution_journals) AS runs,
            (SELECT count(*)::int FROM agent_execution_journal_records) AS records`;
        expect(left).toEqual({ records: 0, runs: 0 });
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { recursive: true, force: true });
    }
}, 60_000);
