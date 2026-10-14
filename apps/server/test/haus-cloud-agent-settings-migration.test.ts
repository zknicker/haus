import { afterAll, beforeAll, expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

let cluster: PostgresCluster;
beforeAll(async () => {
    cluster = await startPostgresCluster();
});
afterAll(async () => {
    await cluster.stop();
});

test('provider settings migration preserves the existing Cursor model and its parameters', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'haus-cloud-model-upgrade-'));
    const database = new SQL(cluster.databaseUrl);
    const url = new URL(cluster.databaseUrl);
    url.pathname = '/haus_cloud_model_upgrade_test';
    let upgraded: SQL | undefined;
    try {
        await cp(join(import.meta.dir, '../drizzle/postgres'), folder, { recursive: true });
        const journalPath = join(folder, 'meta/_journal.json');
        const journal = JSON.parse(await readFile(journalPath, 'utf8'));
        journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= 85);
        await writeFile(journalPath, JSON.stringify(journal));
        await database.unsafe('CREATE DATABASE haus_cloud_model_upgrade_test');
        await migrateHausDatabase(url.toString(), 'haus', 'haus', folder);
        upgraded = new SQL(url.toString());
        await upgraded`insert into servers (id,slug,display_name,cloud_agent_model_id,cloud_agent_model_params)
            values ('srv_legacycloudmodel','legacy-cloud-model','Legacy cloud model','cursor-chosen-model', ${{ effort: 'high', fast: true }}::jsonb)`;
        await migrateHausDatabase(url.toString(), 'haus', 'haus');
        expect(
            await upgraded`select provider,model_id,model_params from cloud_agent_settings where server_id='srv_legacycloudmodel'`
        ).toEqual([
            {
                provider: 'cursor',
                model_id: 'cursor-chosen-model',
                model_params: { effort: 'high', fast: true },
            },
        ]);
        expect(
            await upgraded`select column_name from information_schema.columns where table_name='servers' and column_name like 'cloud_agent_model%'`
        ).toEqual([]);
    } finally {
        await upgraded?.close();
        await database.unsafe('DROP DATABASE IF EXISTS haus_cloud_model_upgrade_test');
        await database.close();
        await rm(folder, { recursive: true, force: true });
    }
});
