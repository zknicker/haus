import { expect, test } from 'bun:test';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startPostgresCluster } from './postgres-cluster.ts';

test('reports each migration applied to a fresh database exactly once', async () => {
    const cluster = await startPostgresCluster();
    const database = new SQL(cluster.databaseUrl);
    const databaseName = 'haus_migration_report_test';
    const databaseUrl = new URL(cluster.databaseUrl);
    databaseUrl.pathname = `/${databaseName}`;

    try {
        await database.unsafe(`CREATE DATABASE ${databaseName}`);
        const applied = await migrateHausDatabase(databaseUrl.toString(), 'haus', 'haus');
        const migratedDatabase = new SQL(databaseUrl.toString());
        let migrationRows: { total: number }[];
        try {
            migrationRows = (await migratedDatabase`
                    SELECT count(*)::int AS total
                    FROM drizzle.__drizzle_migrations
                `) as { total: number }[];
        } finally {
            await migratedDatabase.close();
        }
        expect(applied.length).toBeGreaterThan(0);
        expect(new Set(applied).size).toBe(applied.length);
        expect(migrationRows).toEqual([{ total: applied.length }]);
        await expect(migrateHausDatabase(databaseUrl.toString(), 'haus', 'haus')).resolves.toEqual(
            []
        );
    } finally {
        await database.unsafe(`DROP DATABASE IF EXISTS ${databaseName}`);
        await database.close();
        await cluster.stop();
    }
});
