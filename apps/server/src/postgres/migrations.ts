import { readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { SQL } from 'bun';
import { drizzle } from 'drizzle-orm/bun-sql';
import { migrate } from 'drizzle-orm/bun-sql/migrator';
import {
    assertHausDatabaseRole,
    grantHausBackupPrivileges,
    grantHausRuntimePrivileges,
} from './roles.ts';

const packagedMigrationsFolder = join(
    dirname(process.execPath),
    '..',
    'share',
    'haus-server',
    'migrations'
);

export function resolveHausMigrationsFolder(folder = process.env.HAUS_MIGRATIONS_FOLDER) {
    if (folder) {
        return resolve(folder);
    }
    if (basename(process.execPath).startsWith('haus-server-')) {
        return resolve(packagedMigrationsFolder);
    }
    return resolve(import.meta.dir, '..', '..', 'drizzle', 'postgres');
}

export async function migrateHausDatabase(
    databaseUrl: string,
    runtimeRole: string,
    backupRole: string,
    migrationsFolder?: string
) {
    const client = new SQL({ max: 1, url: databaseUrl });
    const folder = resolveHausMigrationsFolder(migrationsFolder);

    try {
        assertHausDatabaseRole(runtimeRole, 'runtime');
        assertHausDatabaseRole(backupRole, 'backup');
        const latestMigrationTime = await readLatestMigrationTime(client);
        await grantHausRuntimePrivileges(client, runtimeRole);
        await migrate(drizzle(client), {
            migrationsFolder: folder,
        });
        await grantHausRuntimePrivileges(client, runtimeRole);
        await grantHausBackupPrivileges(client, backupRole);
        return await readAppliedMigrationTags(folder, latestMigrationTime);
    } finally {
        await client.close();
    }
}

async function readLatestMigrationTime(client: SQL) {
    const [table] = (await client`
        SELECT to_regclass('drizzle.__drizzle_migrations')::text AS name
    `) as { name: string | null }[];
    if (!table?.name) {
        return Number.NEGATIVE_INFINITY;
    }
    const [migration] = (await client`
        SELECT created_at::text AS created_at
        FROM drizzle.__drizzle_migrations
        ORDER BY created_at DESC
        LIMIT 1
    `) as { created_at: string }[];
    return migration ? Number(migration.created_at) : Number.NEGATIVE_INFINITY;
}

async function readAppliedMigrationTags(folder: string, latestMigrationTime: number) {
    const journal = JSON.parse(await readFile(join(folder, 'meta', '_journal.json'), 'utf8')) as {
        entries: { tag: string; when: number }[];
    };
    return journal.entries
        .filter((entry) => entry.when > latestMigrationTime)
        .map((entry) => entry.tag);
}
