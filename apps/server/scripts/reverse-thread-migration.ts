import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { SQL } from 'bun';

/**
 * DEV ONLY: replays migration 0124's audit tables backwards, restoring every
 * Thread, its Messages' Chat, sequence, nonce, and reply links, and the
 * before-image of every other row the migration changed or deleted. Rows
 * written after the migration in those Chats are overwritten or removed, so
 * this never runs against a database anyone uses. It refuses once 0126 has
 * dropped the Thread schema.
 *
 *   bun scripts/reverse-thread-migration.ts --database-url <url> --i-am-on-a-dev-database
 */
const migrationTag = '0124_threads-to-inline-replies';
const threadSchemaDroppedTag = '0126_threads-are-gone';
const sequenceOffset = 1_000_000_000;

/** Tables whose rows are deleted in the moving Chats and reinserted whole, with their Chat column. */
const replacedTables = [
    ['chat_reads', 'chat_id'],
    ['agent_chat_reads', 'chat_id'],
    ['agent_inbox_cursors', 'chat_id'],
    ['agent_inbox_exact_visibility', 'chat_id'],
    ['agent_message_drafts', 'chat_id'],
    ['thread_follows', 'thread_chat_id'],
    ['agent_thread_follows', 'thread_chat_id'],
    ['thread_closures', 'thread_chat_id'],
    ['cloud_agent_work_links', 'chat_id'],
    ['image_generation_links', 'chat_id'],
] as const;

/** Tables restored in place by primary key; the migration never deletes their rows. */
const restoredTables = [
    'chats',
    'agent_inbox',
    'attachments',
    'cloud_agent_work',
    'message_claims',
    'reminders',
    'reminder_agent_attention',
    'triggers',
    'agent_run_triggers',
    'agent_runner_credentials',
    'agent_delivery',
    'agent_leads',
    'message_causes',
] as const;

export async function reverseThreadMigration(databaseUrl: string) {
    const client = new SQL({ max: 1, url: databaseUrl });
    try {
        const [audit] = (await client`
            SELECT to_regclass('public.thread_migration_map')::text AS map,
                to_regclass('public.thread_migration_rows')::text AS rows_table`) as {
            map: string | null;
            rows_table: string | null;
        }[];
        if (!(audit?.map && audit.rows_table)) {
            throw new Error('No thread migration audit tables here; nothing to reverse.');
        }
        const migratedAt = await readMigrationTime(migrationTag);
        // 0126 deleted the Thread schema the before-images need, so the audit
        // tables can no longer be replayed once it has run.
        const schemaDroppedAt = await readMigrationTime(threadSchemaDroppedTag);
        const [dropped] = (await client`
            SELECT count(*)::integer AS total FROM drizzle.__drizzle_migrations
            WHERE created_at = ${schemaDroppedAt}`) as { total: number }[];
        if (dropped?.total) {
            throw new Error(
                `${threadSchemaDroppedTag} has run; Threads cannot be restored on this database.`
            );
        }
        await client.begin(async (tx) => {
            // A restore, not a product write: triggers and key checks are off
            // while before-images go back, and cascades must not fire.
            await tx`SET LOCAL session_replication_role = replica`;
            await tx`CREATE TEMP TABLE reversing_chats ON COMMIT DROP AS
                SELECT row ->> 'server_id' AS server_id, row ->> 'id' AS chat_id
                FROM thread_migration_rows WHERE table_name = 'chats'`;
            await restoreMessages(tx);
            for (const [table, chatColumn] of replacedTables) {
                await tx.unsafe(`DELETE FROM "${table}" t USING reversing_chats scope
                    WHERE t.server_id = scope.server_id AND t."${chatColumn}" = scope.chat_id`);
                const columns = await writableColumns(tx, table);
                await tx.unsafe(insertFromBackup(table, columns, null));
            }
            for (const table of restoredTables) {
                const columns = await writableColumns(tx, table);
                const keys = await primaryKey(tx, table);
                await tx.unsafe(insertFromBackup(table, columns, keys));
                const assignments = columns
                    .map((column) => `"${column}" = r."${column}"`)
                    .join(', ');
                const matches = keys.map((key) => `t."${key}" = r."${key}"`).join(' AND ');
                await tx.unsafe(`UPDATE "${table}" t SET ${assignments}
                    FROM thread_migration_rows b, jsonb_populate_record(NULL::"${table}", b.row) r
                    WHERE b.table_name = '${table}' AND ${matches}`);
            }
            await tx`DROP TABLE thread_migration_rows`;
            await tx`DROP TABLE thread_migration_map`;
            await tx`DELETE FROM drizzle.__drizzle_migrations WHERE created_at = ${migratedAt}`;
        });
    } finally {
        await client.close();
    }
}

/** Every renumbered Message returns to its old Chat, sequence, nonce, and reply links. */
async function restoreMessages(tx: SQL) {
    await tx`UPDATE chat_messages message SET
            chat_id = map.old_chat_id,
            sequence = map.old_sequence + ${sequenceOffset},
            nonce = map.old_nonce,
            reply_to_message_id = map.old_reply_to_message_id,
            reply_root_message_id = map.old_reply_root_message_id
        FROM thread_migration_map map
        WHERE message.server_id = map.server_id AND message.id = map.message_id`;
    await tx`UPDATE chat_messages message SET sequence = message.sequence - ${sequenceOffset}
        FROM reversing_chats scope
        WHERE message.server_id = scope.server_id AND message.chat_id = scope.chat_id
            AND message.sequence > ${sequenceOffset}`;
}

/** Inserts a table's backed-up rows; with keys, only those not already present. */
function insertFromBackup(table: string, columns: string[], keys: string[] | null) {
    const list = columns.map((column) => `"${column}"`).join(', ');
    const missing = keys
        ? `AND NOT EXISTS (SELECT 1 FROM "${table}" t WHERE ${keys
              .map((key) => `t."${key}" = r."${key}"`)
              .join(' AND ')})`
        : '';
    return `INSERT INTO "${table}" (${list})
        SELECT ${columns.map((column) => `r."${column}"`).join(', ')}
        FROM thread_migration_rows b, jsonb_populate_record(NULL::"${table}", b.row) r
        WHERE b.table_name = '${table}' ${missing}`;
}

async function writableColumns(tx: SQL, table: string) {
    const rows = (await tx`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table} AND is_generated = 'NEVER'
        ORDER BY ordinal_position`) as { column_name: string }[];
    return rows.map((row) => row.column_name);
}

async function primaryKey(tx: SQL, table: string) {
    const rows = (await tx`
        SELECT attribute.attname AS name
        FROM pg_index index
        JOIN pg_attribute attribute
            ON attribute.attrelid = index.indrelid AND attribute.attnum = ANY (index.indkey)
        WHERE index.indrelid = ${`public.${table}`}::regclass AND index.indisprimary
        ORDER BY attribute.attnum`) as { name: string }[];
    if (rows.length === 0) {
        throw new Error(`${table} has no primary key to restore by`);
    }
    return rows.map((row) => row.name);
}

/** A migration's journal timestamp, which is its `created_at` in Drizzle's ledger. */
async function readMigrationTime(tag: string) {
    const journal = JSON.parse(
        await readFile(join(import.meta.dir, '../drizzle/postgres/meta/_journal.json'), 'utf8')
    ) as { entries: { tag: string; when: number }[] };
    const entry = journal.entries.find((candidate) => candidate.tag === tag);
    if (!entry) {
        throw new Error(`${tag} is not in the migration journal`);
    }
    return entry.when;
}

async function main() {
    const { values } = parseArgs({
        options: {
            'database-url': { type: 'string' },
            'i-am-on-a-dev-database': { type: 'boolean' },
        },
    });
    if (!values['i-am-on-a-dev-database']) {
        console.error(
            'Refusing: this rewrites history. Pass --i-am-on-a-dev-database on a dev database only.'
        );
        process.exit(2);
    }
    const databaseUrl = values['database-url'];
    if (!databaseUrl) {
        console.error(
            'Usage: reverse-thread-migration.ts --database-url <url> --i-am-on-a-dev-database'
        );
        process.exit(2);
    }
    await reverseThreadMigration(databaseUrl);
    console.log('Reversed 0124_threads-to-inline-replies.');
}

if (import.meta.main) {
    await main();
}
