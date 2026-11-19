import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { SQL } from 'bun';
import { judgeStructure, readStructure, type Structure } from './thread-migration-invariants.ts';
import {
    compareUnread,
    readUnreadAfter,
    readUnreadBefore,
    type UnreadComparison,
    type UnreadSnapshot,
    unreadHolds,
} from './thread-migration-unread.ts';

export interface ThreadMigrationSnapshot {
    structure: Structure;
    unread: UnreadSnapshot;
}

export async function takeThreadMigrationSnapshot(
    databaseUrl: string
): Promise<ThreadMigrationSnapshot> {
    return await readOnly(databaseUrl, async (database) => ({
        structure: await readStructure(database),
        unread: await readUnreadBefore(database),
    }));
}

export async function verifyThreadMigration(databaseUrl: string, before?: ThreadMigrationSnapshot) {
    return await readOnly(databaseUrl, async (database) => {
        const structure = await readStructure(database);
        const invariants = judgeStructure(structure, before?.structure);
        const unread: UnreadComparison | null = before
            ? compareUnread(before.unread, await readUnreadAfter(database, before.unread))
            : null;
        const ok = invariants.every((result) => result.ok) && (unread ? unreadHolds(unread) : true);
        return { invariants, ok, structure, unread };
    });
}

async function readOnly<T>(databaseUrl: string, read: (database: SQL) => Promise<T>) {
    const client = new SQL({ max: 1, url: databaseUrl });
    try {
        return await client.begin(async (tx) => {
            await tx`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`;
            return await read(tx);
        });
    } finally {
        await client.close();
    }
}

async function main() {
    const { values } = parseArgs({
        options: {
            after: { type: 'string' },
            before: { type: 'string' },
            'database-url': { type: 'string' },
        },
    });
    const databaseUrl = values['database-url'];
    if (!databaseUrl || (values.before && values.after)) {
        console.error(
            'Usage: verify-thread-migration.ts --database-url <url> [--before <file> | --after <file>]'
        );
        process.exit(2);
    }
    if (values.before) {
        const snapshot = await takeThreadMigrationSnapshot(databaseUrl);
        await writeFile(values.before, JSON.stringify(snapshot));
        printResults(
            judgeStructure(snapshot.structure).filter(
                (result) => result.name !== 'zero thread chats'
            )
        );
        console.log(`threads to migrate: ${snapshot.structure.counts.threadChats}`);
        console.log(
            `snapshot: ${snapshot.unread.affected.length} affected chats of ${snapshot.unread.chats.length}, ${snapshot.unread.movedMessageIds.length} thread messages, ${Object.keys(snapshot.unread.unread).length} reader/chat unread sets → ${values.before}`
        );
        return;
    }
    const before = values.after
        ? (JSON.parse(await readFile(values.after, 'utf8')) as ThreadMigrationSnapshot)
        : undefined;
    const result = await verifyThreadMigration(databaseUrl, before);
    printResults(result.invariants);
    console.log(
        `excluded ${result.structure.counts.taskOriginPosts} 0127 Tracking posts (nonce task-origin:*) from the message total and unread`
    );
    if (result.unread) {
        const unread = result.unread;
        console.log(
            `unread: ${unread.readers} reader/chat pairs; ${unread.affectedChats} affected chats ${unread.affectedUnreadBefore} → ${unread.affectedUnreadAfter} unread; ${unread.unaffectedChanged} unaffected pairs changed (${unread.unaffectedUnread} unread kept); ${unread.pendingInboxItems} queued inbox items left`
        );
        for (const key of unread.unaffectedChangedKeys) {
            console.log(`  CHANGED ${key}`);
        }
    }
    console.log(result.ok ? 'OK' : 'FAILED');
    process.exit(result.ok ? 0 : 1);
}

function printResults(results: { detail: string; name: string; ok: boolean }[]) {
    for (const result of results) {
        console.log(`${result.ok ? 'ok  ' : 'FAIL'} ${result.name}: ${result.detail}`);
    }
}

if (import.meta.main) {
    await main();
}
