import { afterAll, beforeAll, expect, test } from 'bun:test';
import { makeTestRuntime } from '@haus/effect';
import { type AttachmentRoot, openAttachmentRoot } from '../src/attachments/attachment-root.ts';
import { reconcileAttachments } from '../src/attachments/reconcile-attachments.ts';
import { uploadAttachment } from '../src/attachments/upload-attachment.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { findUserById, type HausUser } from '../src/users/haus-user.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let client: HausClient;
let connection: HausConnection;
let root: AttachmentRoot;
let member: HausUser;
let serverId: string;
let chatId: string;
const runtime = makeTestRuntime();

beforeAll(async () => {
    harness = await startHausServerHarness();
    client = createHausClient(harness, await harness.humans.mintSessionToken('recovery_owner'));
    const server = await client.trpc.server.create.mutate({
        displayName: 'Recovery Server',
        slug: 'recovery-server',
    });
    serverId = server.id;
    chatId = server.channels[0].id;
    connection = await connectHausDatabase(harness.databaseUrl);
    root = await openAttachmentRoot(harness.attachmentRoot, runtime);
    const found = await findUserById(
        connection.db,
        harness.humans.userIdForSubject('recovery_owner')
    );
    if (!found) {
        throw new Error('Recovery test owner was not created.');
    }
    member = found;
});

afterAll(async () => {
    client.close();
    await connection.close();
    await runtime.dispose();
    await harness.close();
});

test('a failure before the finalizing commit removes staging and records one failed attempt', async () => {
    const attachmentId = await reserve('before-finalizing');

    await expect(
        upload(attachmentId, root, {
            afterStagingSynced: () => {
                throw new Error('database unavailable before finalizing');
            },
        })
    ).rejects.toThrow(/database unavailable/i);

    expect(await state(attachmentId)).toEqual({
        failure_code: 'storage',
        state: 'failed',
    });
    expect((await root.listKeys(serverId)).stagingKeys).toEqual([]);
});

test('a failure before staged-file close still closes and removes the staged resource', async () => {
    const attachmentId = await reserve('before-staged-close');

    await expect(
        upload(attachmentId, root, {
            beforeStagedFileClose: () => {
                throw new Error('close boundary failed');
            },
        })
    ).rejects.toThrow(/close boundary failed/i);

    expect(await state(attachmentId)).toEqual({
        failure_code: 'storage',
        state: 'failed',
    });
    expect((await root.listKeys(serverId)).stagingKeys).toEqual([]);
});

test('an interrupted request stream removes its partial staging file', async () => {
    const attachmentId = await reserve('interrupted-stream');

    await expect(
        uploadAttachment(connection.db, root, runtime, {
            attachmentId,
            declaredLength: null,
            member,
            serverId,
            stream: interruptedBytes(),
        })
    ).rejects.toThrow(/stream interrupted/i);
    expect(await state(attachmentId)).toEqual({
        failure_code: 'storage',
        state: 'failed',
    });
    expect((await root.listKeys(serverId)).stagingKeys).toEqual([]);
});

test('restart completes a committed finalizing row whose staging file is durable', async () => {
    const attachmentId = await reserve('after-finalizing');

    await expect(
        upload(attachmentId, root, {
            afterFinalizingCommit: () => {
                throw new Error('process stopped after finalizing commit');
            },
        })
    ).rejects.toThrow(/process stopped/i);
    expect(await state(attachmentId)).toMatchObject({ state: 'finalizing' });

    await expect(reconcileAttachments(connection.db, root)).resolves.toEqual({
        failed: [],
        ready: [attachmentId],
    });
    await expect(reconcileAttachments(connection.db, root)).resolves.toEqual({
        failed: [],
        ready: [],
    });
});

test('restart verifies an object renamed before directory fsync and finishes its row', async () => {
    const attachmentId = await reserve('after-rename');
    const interruptedRoot = await openAttachmentRoot(harness.attachmentRoot, runtime, {
        afterRename: () => {
            throw new Error('process stopped before directory fsync');
        },
    });

    await expect(upload(attachmentId, interruptedRoot)).rejects.toThrow(/directory fsync/i);
    expect(await state(attachmentId)).toMatchObject({ state: 'finalizing' });

    await expect(reconcileAttachments(connection.db, root)).resolves.toEqual({
        failed: [],
        ready: [attachmentId],
    });
});

test('restart removes a matching staging leaf left beside its finalized object', async () => {
    const attachmentId = await reserve('rename-source-reappeared');
    const interruptedRoot = await openAttachmentRoot(harness.attachmentRoot, runtime, {
        afterRename: () => {
            throw new Error('process stopped during cross-directory fsync');
        },
    });

    await expect(upload(attachmentId, interruptedRoot)).rejects.toThrow(/directory fsync/i);
    const [row] = (await harness.sql`
        select staging_key from attachments where id = ${attachmentId}
    `) as { staging_key: string }[];
    const duplicateStage = await root.createStagingFile(serverId, row.staging_key);
    await duplicateStage.write('recoverable');
    await duplicateStage.sync();
    await duplicateStage.close();

    await expect(reconcileAttachments(connection.db, root)).resolves.toEqual({
        failed: [],
        ready: [attachmentId],
    });
    expect((await root.listKeys(serverId)).stagingKeys).toEqual([]);
});

test('restart finishes a durable object when the ready commit was never attempted', async () => {
    const attachmentId = await reserve('before-ready');

    await expect(
        upload(attachmentId, root, {
            beforeReadyCommit: () => {
                throw new Error('database unavailable before ready commit');
            },
        })
    ).rejects.toThrow(/ready commit/i);
    expect(await state(attachmentId)).toMatchObject({ state: 'finalizing' });

    await expect(reconcileAttachments(connection.db, root)).resolves.toEqual({
        failed: [],
        ready: [attachmentId],
    });
});

test('restart removes interrupted writes and enumerates missing finalization failures', async () => {
    const uploadingId = await reserve('interrupted-write');
    const missingId = await reserve('missing-finalization');
    const uploadingAttempt = 'upl_1234567890abcdea';
    const missingAttempt = 'upl_1234567890abcdeb';
    const stage = await root.createStagingFile(serverId, uploadingAttempt);
    await stage.write('partial');
    await stage.close();

    await harness.sql`
        update attachments set attempt_id = ${uploadingAttempt}, staging_key = ${uploadingAttempt},
            state = 'uploading' where id = ${uploadingId}
    `;
    await harness.sql`
        update attachments set attempt_id = ${missingAttempt}, staging_key = ${missingAttempt},
            byte_size = 0, sha256 = ${emptySha256}, state = 'finalizing'
        where id = ${missingId}
    `;

    await expect(reconcileAttachments(connection.db, root)).resolves.toEqual({
        failed: [uploadingId, missingId],
        ready: [],
    });
    expect((await root.listKeys(serverId)).stagingKeys).toEqual([]);
    expect(await state(uploadingId)).toEqual({
        failure_code: 'interrupted_upload',
        state: 'failed',
    });
    expect(await state(missingId)).toEqual({
        failure_code: 'missing_file',
        state: 'failed',
    });
});

async function reserve(nonce: string) {
    const reservation = await client.trpc.attachment.reserve.mutate({
        chatId,
        filename: `${nonce}.bin`,
        mediaType: 'application/octet-stream',
        nonce,
        serverId,
    });
    return reservation.attachmentId;
}

async function upload(
    attachmentId: string,
    attachmentRoot: AttachmentRoot,
    failureInjection?: Parameters<typeof uploadAttachment>[2]['failureInjection']
) {
    return await uploadAttachment(connection.db, attachmentRoot, runtime, {
        attachmentId,
        declaredLength: null,
        failureInjection,
        member,
        serverId,
        stream: bytes('recoverable'),
    });
}

async function* bytes(value: string) {
    yield new TextEncoder().encode(value);
}

async function* interruptedBytes() {
    yield new TextEncoder().encode('partial');
    throw new Error('request stream interrupted');
}

async function state(attachmentId: string) {
    const id = String(attachmentId);
    const [row] = (await harness.sql`
        select failure_code, state from attachments where id = ${id}
    `) as { failure_code: string | null; state: string }[];
    return row;
}

const emptySha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
