import { hasHausSchema } from './dev-postgres.mjs';

export async function prepareServerDatabase({
    devStackEnvironment,
    postgres,
    serverEnvironment,
    spawnBackgroundProcess,
}) {
    const roles = { HAUS_DATABASE_BACKUP_ROLE: 'haus', HAUS_DATABASE_RUNTIME_ROLE: 'haus' };
    if (hasHausSchema(postgres)) {
        const migrated = await spawnBackgroundProcess(
            'haus',
            'bun apps/server/src/haus-server-migrate.ts',
            { ...serverEnvironment, HAUS_DATABASE_MIGRATION_URL: postgres.databaseUrl, ...roles }
        );
        if (!migrated) {
            const dataRoot = devStackEnvironment.HAUS_POSTGRES_DATA_ROOT;
            throw new Error(
                'Failed to migrate the development Server database. ' +
                    `If this dev database predates checked-in migrations, move ${dataRoot} aside and rerun.`
            );
        }
        return;
    }
    const bootstrapped = await spawnBackgroundProcess(
        'haus',
        'bun apps/server/src/haus-server-bootstrap.ts',
        { ...serverEnvironment, HAUS_DATABASE_BOOTSTRAP_URL: postgres.databaseUrl, ...roles }
    );
    if (!bootstrapped) {
        throw new Error('Failed to bootstrap the development Server.');
    }
}
