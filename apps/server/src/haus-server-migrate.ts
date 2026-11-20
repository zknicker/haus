import { describeMigrationFailure } from './postgres/migration-failure.ts';
import { migrateHausDatabase } from './postgres/migrations.ts';

const databaseUrl = process.env.HAUS_DATABASE_MIGRATION_URL;
const backupRole = process.env.HAUS_DATABASE_BACKUP_ROLE;
const runtimeRole = process.env.HAUS_DATABASE_RUNTIME_ROLE;

if (!(databaseUrl && backupRole && runtimeRole)) {
    console.error(
        'HAUS_DATABASE_MIGRATION_URL, HAUS_DATABASE_BACKUP_ROLE, and HAUS_DATABASE_RUNTIME_ROLE are required.'
    );
    process.exit(1);
}

try {
    const applied = await migrateHausDatabase(databaseUrl, runtimeRole, backupRole);
    console.log(
        applied.length
            ? `Applied ${applied.join(', ')} successfully.`
            : 'No database migrations were required.'
    );
} catch (error) {
    console.error(
        `Haus PostgreSQL migration failed: ${describeMigrationFailure(error, databaseUrl)}`
    );
    process.exit(1);
}
