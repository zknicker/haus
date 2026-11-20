const breakpoint = '--> statement-breakpoint';

export const rehearsalPsqlArgs = [
    '--no-psqlrc',
    '--quiet',
    '-v',
    'ON_ERROR_STOP=1',
    '-v',
    'VERBOSITY=verbose',
];

export function pendingMigrationTags(journal, latestAppliedMillis) {
    return journal.entries
        .filter((entry) => entry.when > latestAppliedMillis)
        .map((entry) => entry.tag);
}

export function migrationRehearsalScript(migrations) {
    const lines = ['BEGIN;'];
    for (const { tag, sql } of migrations) {
        if (!/^[0-9]{4}_[a-z0-9_-]+$/u.test(tag)) {
            throw new Error(`unexpected migration tag ${JSON.stringify(tag)}`);
        }
        lines.push(
            `DO $rehearsal$ BEGIN RAISE NOTICE 'rehearsal: applying ${tag}'; END $rehearsal$;`
        );
        for (const statement of sql.split(breakpoint)) {
            if (statement.trim()) {
                lines.push(terminated(statement.trim()));
            }
        }
    }
    lines.push(
        "DO $rehearsal$ BEGIN RAISE NOTICE 'rehearsal: checking every deferred constraint'; END $rehearsal$;",
        'SET CONSTRAINTS ALL IMMEDIATE;',
        'ROLLBACK;',
        ''
    );
    return lines.join('\n');
}

function terminated(statement) {
    return statement.endsWith(';') ? statement : `${statement}\n;`;
}
