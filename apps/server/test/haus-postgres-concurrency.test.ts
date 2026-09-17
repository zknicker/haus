import { afterAll, beforeAll, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { jsonb, pgTable, timestamp } from 'drizzle-orm/pg-core';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

let cluster: PostgresCluster;
let connection: HausConnection;

beforeAll(async () => {
    cluster = await startPostgresCluster();
    connection = await connectHausDatabase(cluster.databaseUrl);
});

afterAll(async () => {
    await connection.close();
    await cluster.stop();
});

test('concurrent query shapes retain their results on one transaction connection', async () => {
    await connection.db.transaction(async (tx) => {
        await tx.execute(sql`SELECT ${'warm'} AS v`);
        // A cached shape surrounds an uncached shape: Bun 1.3.5 otherwise
        // resolves the middle query incorrectly and never resolves the last.
        const results = await Promise.all([
            tx.execute(sql`SELECT ${'A'} AS v`),
            tx.execute(sql`SELECT ${'B'} AS v, ${1} AS w`),
            tx.execute(sql`SELECT ${'C'} AS v`),
        ]);
        expect(results.map((rows) => [...rows])).toEqual([
            [{ v: 'A' }],
            [{ v: 'B', w: 1 }],
            [{ v: 'C' }],
        ]);
    });
});

const valuesTable = pgTable('connection_values', {
    payload: jsonb().notNull(),
    recordedAt: timestamp({ withTimezone: true }).notNull(),
});

test('round-trips Drizzle JSON and timestamp values', async () => {
    const values = {
        payload: { nested: [1, "quoted ' value", true] },
        recordedAt: new Date('2026-09-16T17:00:00.123Z'),
    };
    await connection.db.transaction(async (tx) => {
        await tx.execute(sql`CREATE TEMP TABLE connection_values (
            payload jsonb NOT NULL, "recordedAt" timestamptz NOT NULL
        ) ON COMMIT DROP`);
        await tx.insert(valuesTable).values(values);
        expect(await tx.select().from(valuesTable)).toEqual([values]);
    });
});
