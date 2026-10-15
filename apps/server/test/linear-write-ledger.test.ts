import { afterAll, beforeAll, expect, test } from 'bun:test';
import { linearClientEntityId, linearMetaKey } from '@haus/api/linear-actor-meta';
import { and, asc, eq } from 'drizzle-orm';
import {
    beginLinearWrite,
    completeLinearWrite,
    createLinearWriteLedgerHooks,
    deleteExpiredLinearWrites,
    fingerprint,
    type LinearLedgerWrite,
} from '../src/linear/write-ledger.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { linearWritesTable } from '../src/postgres/schema.ts';
import { seedLinearWorkspace } from './linear-write-seed.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

let cluster: PostgresCluster;
let connection: HausConnection;

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

const idSeed = '3f0a3d6e-5d0c-5b5e-8f43-0b1b6f1c2a90';
const updatedAt = '2026-10-15T12:00:00.000Z';

async function writeFor(tool: string, args: Record<string, unknown>, requestId: string) {
    const seed = await seedLinearWorkspace(connection.db);
    const write: LinearLedgerWrite = {
        actor: { credentialId: 'lna_AAAAAAAAAAAAAAAA' },
        agentId: seed.agentId,
        arguments: args,
        idSeed,
        requestId,
        serverId: seed.serverId,
        tool,
        workspaceId: seed.workspaceId,
    };
    return write;
}

function rows(write: LinearLedgerWrite) {
    return connection.db
        .select()
        .from(linearWritesTable)
        .where(
            and(
                eq(linearWritesTable.workspaceId, write.workspaceId),
                eq(linearWritesTable.requestId, write.requestId)
            )
        )
        .orderBy(asc(linearWritesTable.opIndex));
}

function created(opIndex: number, entityType: string, fields: Record<string, unknown>) {
    const id = linearClientEntityId(idSeed, opIndex);
    return {
        clientId: id,
        created: true,
        entityId: id,
        entityType,
        fields,
        opIndex,
        replayed: false,
        updatedAt,
    };
}

function success(structuredContent: Record<string, unknown>) {
    return {
        content: [{ text: JSON.stringify(structuredContent), type: 'text' }],
        isError: false,
        structuredContent,
    };
}

function failure(code: string) {
    return {
        content: [{ text: `${code}: failed`, type: 'text' }],
        isError: true,
        structuredContent: { error: { code, message: 'failed', retryable: false } },
    };
}

test('a create plans its derived id before the call and a retried request id replays', async () => {
    const write = await writeFor('create_issue', { team: 'DES', title: 'Tee' }, 'req-create');
    expect(await beginLinearWrite(connection.db, write)).toEqual({ kind: 'proceed' });
    const [pending] = await rows(write);
    expect(pending).toMatchObject({
        clientEntityId: linearClientEntityId(idSeed, 0),
        status: 'pending',
        targetType: 'issue',
    });

    const fields = { teamId: 'team-des', title: 'Tee' };
    const result = success({ issue: { identifier: 'DES-142' } });
    await completeLinearWrite(connection.db, write, result, {
        completed: true,
        mutations: [created(0, 'issue', fields)],
    });
    const [settled] = await rows(write);
    expect(settled).toMatchObject({
        fieldFingerprint: fingerprint(fields),
        result: { issue: { identifier: 'DES-142' } },
        resultEntityId: linearClientEntityId(idSeed, 0),
        resultUpdatedAt: new Date(updatedAt),
        status: 'succeeded',
    });
    expect(settled?.completedAt).toBeInstanceOf(Date);

    expect(await beginLinearWrite(connection.db, write)).toEqual({ kind: 'replay', result });
});

test('an update with a note plans the note comment as op 1', async () => {
    const write = await writeFor(
        'update_issue',
        { issue: 'DES-142', note: 'Ready.', state: 'state-print' },
        'req-note'
    );
    await beginLinearWrite(connection.db, write);
    const planned = await rows(write);
    expect(planned.map((row) => [row.opIndex, row.targetType, row.clientEntityId])).toEqual([
        [0, 'issue', null],
        [1, 'comment', linearClientEntityId(idSeed, 1)],
    ]);
    expect(planned[0]?.targetId).toBe('DES-142');

    await completeLinearWrite(connection.db, write, success({ issue: {} }), {
        completed: true,
        mutations: [
            {
                ...created(0, 'issue', { stateId: 'state-print' }),
                clientId: null,
                created: false,
                entityId: 'issue-uuid',
            },
            created(1, 'comment', { body: 'Ready.', issueId: 'issue-uuid' }),
        ],
    });
    const settled = await rows(write);
    expect(settled.map((row) => [row.status, row.resultEntityId])).toEqual([
        ['succeeded', 'issue-uuid'],
        ['succeeded', linearClientEntityId(idSeed, 1)],
    ]);
});

test('a deadline leaves the write unknown, and the resend settles it with the same ids', async () => {
    const write = await writeFor('create_comment', { body: 'Hi', issue: 'DES-1' }, 'req-unknown');
    await beginLinearWrite(connection.db, write);
    const timedOut = {
        ...failure('linear_upstream_error'),
        _meta: { [linearMetaKey]: { completed: false, mutations: [] } },
    };
    await completeLinearWrite(connection.db, write, timedOut, timedOut._meta[linearMetaKey]);
    expect((await rows(write))[0]).toMatchObject({ completedAt: null, status: 'unknown' });

    // The resend proceeds; Linear's "already exists" came back as a replayed create.
    expect(await beginLinearWrite(connection.db, write)).toEqual({ kind: 'proceed' });
    expect(await rows(write)).toHaveLength(1);
    await completeLinearWrite(connection.db, write, success({ comment: { id: 'c' } }), {
        completed: true,
        mutations: [{ ...created(0, 'comment', { body: 'Hi' }), replayed: true }],
    });
    expect((await rows(write))[0]).toMatchObject({
        resultEntityId: linearClientEntityId(idSeed, 0),
        status: 'succeeded',
    });
    expect(await beginLinearWrite(connection.db, write)).toMatchObject({ kind: 'replay' });
});

test('a refused write fails and a retry runs again rather than replaying', async () => {
    const write = await writeFor('archive_workflow_state', { state: 'state-1' }, 'req-refused');
    await beginLinearWrite(connection.db, write);
    await completeLinearWrite(connection.db, write, failure('linear_input_error'), {
        completed: false,
        mutations: [],
    });
    expect((await rows(write))[0]).toMatchObject({ result: null, status: 'failed' });
    expect(await beginLinearWrite(connection.db, write)).toEqual({ kind: 'proceed' });
});

test('a result over 8 KiB is stored as its leading text', async () => {
    const write = await writeFor('create_document', { title: 'Long' }, 'req-large');
    await beginLinearWrite(connection.db, write);
    const large = { document: { content: 'x'.repeat(20_000) } };
    await completeLinearWrite(connection.db, write, success(large), {
        completed: true,
        mutations: [created(0, 'document', { title: 'Long' })],
    });
    const replay = await beginLinearWrite(connection.db, write);
    expect(replay.kind).toBe('replay');
    const text = replay.kind === 'replay' ? JSON.stringify(replay.result) : '';
    expect(text.length).toBeLessThan(8192 + 200);
    expect(text).toContain('xxxx');
});

test('hooks replay recorded results and merge per-tool _meta before a new call', async () => {
    const write = await writeFor(
        'upload_image',
        { artifactId: 'art_1', issue: 'DES-1' },
        'req-hook'
    );
    const hooks = createLinearWriteLedgerHooks({
        db: connection.db,
        extraMeta: async (input) =>
            input.tool === 'upload_image' ? { upload: 'signed' } : undefined,
    });
    expect(await hooks.begin(write)).toEqual({ meta: { upload: 'signed' } });
    await hooks.complete({
        ...write,
        result: success({ assetUrl: 'https://uploads.linear.app/a.png' }),
        resultMeta: { completed: true, mutations: [created(0, 'comment', { body: '![a](…)' })] },
    });
    expect(await hooks.begin(write)).toEqual({
        recorded: success({ assetUrl: 'https://uploads.linear.app/a.png' }),
    });
});

test('reads are not ledger writes', async () => {
    const write = await writeFor('get_issue', { issue: 'DES-1' }, 'req-read');
    await expect(beginLinearWrite(connection.db, write)).rejects.toThrow('not a ledger write');
});

test('rows older than 30 days are swept', async () => {
    const write = await writeFor('create_label', { name: 'Old' }, 'req-old');
    await beginLinearWrite(connection.db, write);
    await connection.db
        .update(linearWritesTable)
        .set({ createdAt: new Date(Date.now() - 31 * 24 * 60 * 60_000) })
        .where(eq(linearWritesTable.requestId, 'req-old'));
    await deleteExpiredLinearWrites(connection.db, new Date());
    expect(await rows(write)).toHaveLength(0);
});
