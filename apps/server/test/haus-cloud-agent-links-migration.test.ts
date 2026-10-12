import { afterAll, beforeAll, expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatCloudAgentWorkLink, parseHausRichReferences } from '@haus/api';
import { SQL } from 'bun';
import { cloudAgentWorkLinkLabelCases } from '../../../packages/haus-api/src/cloud-agent-work-fixture.ts';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

let cluster: PostgresCluster;

beforeAll(async () => {
    cluster = await startPostgresCluster();
});

afterAll(async () => {
    await cluster.stop();
});

const original = `Handing this to a Cloud Agent. ${'pad '.repeat(8000)}`.slice(0, 32_000);
const cases = cloudAgentWorkLinkLabelCases.map((labelCase, index) => ({
    ...labelCase,
    messageId: `msg_launch_${index}`,
    workId: `caw_mig${String(index).padStart(13, '0')}`,
}));

test('migration 0079 turns every launch Message into text that links its work', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'haus-cloud-agent-links-'));
    const database = new SQL(cluster.databaseUrl);
    const url = new URL(cluster.databaseUrl);
    url.pathname = '/haus_cloud_agent_links_test';
    let upgraded: SQL | undefined;
    try {
        await cp(join(import.meta.dir, '../drizzle/postgres'), folder, { recursive: true });
        const journalPath = join(folder, 'meta/_journal.json');
        const journal = JSON.parse(await readFile(journalPath, 'utf8'));
        const throughMigration = (idx: number) =>
            writeFile(
                journalPath,
                JSON.stringify({
                    ...journal,
                    entries: journal.entries.filter((entry: { idx: number }) => entry.idx <= idx),
                })
            );
        await throughMigration(78);
        await database.unsafe('CREATE DATABASE haus_cloud_agent_links_test');
        await migrateHausDatabase(url.toString(), 'haus', 'haus', folder);
        upgraded = new SQL({ max: 1, url: url.toString() });
        await seed(upgraded);

        await throughMigration(79);
        expect(await migrateHausDatabase(url.toString(), 'haus', 'haus', folder)).toEqual([
            '0079_cloud_agent_work_links',
        ]);

        const messages = (await upgraded`
            SELECT id, body_kind, content, nonce, sequence FROM chat_messages
            WHERE id <> 'msg_orphan' ORDER BY sequence
        `) as { body_kind: string; content: string; id: string; nonce: string; sequence: number }[];
        expect(messages).toEqual(
            cases.map((entry, index) => ({
                body_kind: 'text',
                content: `${original}\n\n${formatCloudAgentWorkLink(entry.title, entry.workId)}`,
                id: entry.messageId,
                nonce: `nonce_${index}`,
                sequence: index + 1,
            }))
        );
        for (const [index, entry] of cases.entries()) {
            const link = parseHausRichReferences(messages[index]?.content ?? '').at(-1);
            expect(link).toMatchObject({
                id: `cloud-agent://${entry.workId}`,
                kind: 'cloud-agent-work',
                label: entry.label.replace(/\\([\\[])/gu, '$1'),
            });
        }
        // A launch Message whose work its Computer's removal cascaded away keeps
        // its words as plain text, so 0080's narrowed check can still validate.
        expect(
            await upgraded`
                SELECT body_kind, content FROM chat_messages WHERE id = 'msg_orphan'
            `
        ).toEqual([{ body_kind: 'text', content: original }]);
        expect(
            await upgraded`
                SELECT count(*)::int AS hits FROM chat_messages
                WHERE search_vector @@ websearch_to_tsquery('simple', 'flaky')
                  AND search_vector @@ websearch_to_tsquery('simple', 'handing')
            `
        ).toEqual([{ hits: 1 }]);
        expect(
            await upgraded`
                SELECT work_id, message_id, chat_id, ordinal FROM cloud_agent_work_links
                ORDER BY message_id
            `
        ).toEqual(
            cases
                .map((entry) => ({
                    chat_id: 'cht_launch',
                    message_id: entry.messageId,
                    ordinal: 0,
                    work_id: entry.workId,
                }))
                .sort((left, right) => left.message_id.localeCompare(right.message_id))
        );

        // Purging the requesting Channel drops its links, never the work.
        await upgraded`DELETE FROM chats WHERE id = 'cht_launch'`;
        expect(await upgraded`SELECT count(*)::int AS links FROM cloud_agent_work_links`).toEqual([
            { links: 0 },
        ]);
        expect(
            await upgraded`
                SELECT count(*)::int AS works FROM cloud_agent_work
                WHERE chat_id = 'cht_launch' AND launch_message_id LIKE 'msg_launch_%'
            `
        ).toEqual([{ works: cases.length }]);

        // 0080 narrows the body kinds once no launch Message keeps the old one.
        await throughMigration(80);
        expect(await migrateHausDatabase(url.toString(), 'haus', 'haus', folder)).toEqual([
            '0080_message-body-drop-cloud-agent-work',
        ]);
        // Foreign keys stay waived so only the check constraint can reject the row.
        await upgraded.unsafe('SET session_replication_role = replica');
        // A Bun SQL query runs only when its `then` is called, so settle it explicitly.
        const refused = await upgraded`
            INSERT INTO chat_messages
                (id, server_id, chat_id, author_agent_id, body_kind, content, nonce, sequence)
            VALUES ('msg_after', 'srv_one', 'cht_after', 'agt_forge', 'cloud-agent-work',
                'stale', 'nonce_after', 1)
        `.then(
            () => null,
            (error: unknown) => error
        );
        expect(String(refused)).toContain('chat_messages_body_kind');
    } finally {
        await upgraded?.close();
        await database.unsafe('DROP DATABASE IF EXISTS haus_cloud_agent_links_test');
        await database.close();
        await rm(folder, { recursive: true, force: true });
    }
}, 60_000);

/** Foreign keys are waived so only the touched tables need rows. */
async function seed(sql: SQL) {
    await sql.unsafe('SET session_replication_role = replica');
    await sql`
        INSERT INTO servers (id, slug, display_name) VALUES ('srv_one', 'one', 'One')
    `;
    await sql`
        INSERT INTO chats (id, server_id, kind, name, last_message_sequence)
        VALUES ('cht_launch', 'srv_one', 'channel', 'launch', ${cases.length + 1})
    `;
    await sql`
        INSERT INTO chat_messages
            (id, server_id, chat_id, author_agent_id, body_kind, content, nonce, sequence)
        VALUES ('msg_orphan', 'srv_one', 'cht_launch', 'agt_forge', 'cloud-agent-work',
            ${original}, 'nonce_orphan', ${cases.length + 1})
    `;
    for (const [index, entry] of cases.entries()) {
        await sql`
            INSERT INTO chat_messages
                (id, server_id, chat_id, author_agent_id, body_kind, content, nonce, sequence)
            VALUES (${entry.messageId}, 'srv_one', 'cht_launch', 'agt_forge', 'cloud-agent-work',
                ${original}, ${`nonce_${index}`}, ${index + 1})
        `;
        await sql`
            INSERT INTO cloud_agent_work
                (id, server_id, chat_id, message_id, agent_id, computer_id, provider, repository, title)
            VALUES (${entry.workId}, 'srv_one', 'cht_launch', ${entry.messageId}, 'agt_forge',
                'cmp_one', 'cursor', 'haus/haus', ${entry.title})
        `;
    }
    await sql.unsafe('SET session_replication_role = origin');
}
