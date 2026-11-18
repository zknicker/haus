import { SQL } from 'bun';
import { migrateHausDatabase } from './migrations.ts';
import { assertHausDatabaseRole, grantHausRuntimePrivileges } from './roles.ts';

/**
 * Creates a fresh Haus Server database from checked-in Drizzle
 * migrations. Schema changes never live in this bootstrap wrapper.
 */
export async function bootstrapHausDatabase(
    databaseUrl: string,
    runtimeRole: string,
    backupRole = runtimeRole
) {
    assertHausDatabaseRole(runtimeRole, 'runtime');
    assertHausDatabaseRole(backupRole, 'backup');

    const client = new SQL({ max: 1, url: databaseUrl });
    try {
        const existingTables = (await client`
            SELECT count(*)::int AS total
            FROM information_schema.tables
            WHERE table_schema = 'public'
        `) as { total: number }[];
        if (existingTables[0]?.total !== 0) {
            throw new Error('The Haus PostgreSQL database must be empty before bootstrap.');
        }

        await client.unsafe('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
        await grantHausRuntimePrivileges(client, runtimeRole);
    } finally {
        await client.close();
    }

    await migrateHausDatabase(databaseUrl, runtimeRole, backupRole);
}
