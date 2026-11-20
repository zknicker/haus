interface MigrationFile {
    path: string;
    sql: string;
}

const migrationsFolder = 'apps/server/drizzle/postgres';

export const grandfatheredMigrations = new Set([
    '0007_organic_killmonger.sql',
    '0027_visible_messages.sql',
    '0028_agent_inbox.sql',
    '0052_humans_addressed_by_mention.sql',
    '0079_cloud_agent_work_links.sql',
    '0108_remove-linear.sql',
    '0123_retire-heartbeats.sql',
]);

const setConstraints = /\bSET\s+CONSTRAINTS\s+([\s\S]+?)\s+(IMMEDIATE|DEFERRED)\s*;/giu;
const lineComment = /--[^\n]*/gu;

export function constraintsLeftImmediate(sql: string) {
    const modes = new Map<string, string>();
    for (const [, targets = '', mode = ''] of sql
        .replace(lineComment, '')
        .matchAll(setConstraints)) {
        const target = targets.replace(/\s+/gu, ' ').trim().toUpperCase();
        if (target === 'ALL') {
            modes.clear();
        }
        modes.set(target, mode.toUpperCase());
    }
    return [...modes].filter(([, mode]) => mode === 'IMMEDIATE').map(([target]) => target);
}

export function evaluateMigrationConstraintModes(
    files: MigrationFile[],
    grandfathered: ReadonlySet<string> = grandfatheredMigrations
) {
    const failures: string[] = [];
    const names = new Set<string>();
    for (const file of files) {
        const name = file.path.split('/').at(-1) ?? file.path;
        names.add(name);
        const immediate = constraintsLeftImmediate(file.sql);
        if (grandfathered.has(name)) {
            if (immediate.length === 0) {
                failures.push(
                    `${file.path}: restores DEFERRED; remove it from the grandfathered list`
                );
            }
            continue;
        }
        for (const target of immediate) {
            failures.push(
                `${file.path}: SET CONSTRAINTS ${target} IMMEDIATE needs a later SET CONSTRAINTS ${target} DEFERRED; pending migrations share one transaction`
            );
        }
    }
    for (const name of grandfathered) {
        if (!names.has(name)) {
            failures.push(`${name}: grandfathered migration has no matching file`);
        }
    }
    return failures.sort();
}

async function main() {
    const glob = new Bun.Glob(`${migrationsFolder}/*.sql`);
    const files: MigrationFile[] = [];
    for await (const path of glob.scan('.')) {
        files.push({ path, sql: await Bun.file(path).text() });
    }
    const failures = evaluateMigrationConstraintModes(files);
    if (failures.length > 0) {
        console.error(`Migration constraint-mode check failed:\n\n${failures.join('\n')}`);
        process.exitCode = 1;
        return;
    }
    console.log(`Migration constraint-mode check passed for ${files.length} migrations.`);
}

if (import.meta.main) {
    await main();
}
