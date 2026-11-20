import { afterEach, beforeAll, beforeEach, expect, test } from 'bun:test';
import type { ArtifactUpdatedEvent } from '@haus/api';
import { artifactUpdatedTopic } from '../src/realtime/topics.ts';
import { artifactDriveFixture } from './artifact-drive-fixture.ts';
import { createHausClient, type HausClient } from './haus-client.ts';

/**
 * Batched Files actions: `artifact.moveMany` moves a selection into one folder in one
 * transaction, and `artifact.deleteMany` deletes the files the caller may write. Each
 * announces one Files update per batch.
 */
const { publish, state } = artifactDriveFixture('artifact-batch');
let member: HausClient;
let events: ArtifactUpdatedEvent[] = [];
let controller: AbortController;

beforeAll(async () => {
    const email = 'batch-member@haus.test';
    state.harness.humans.setVerifiedEmails('artifact-batch_member', [email]);
    member = createHausClient(
        state.harness,
        await state.harness.humans.mintSessionToken('artifact-batch_member')
    );
    const { token } = await state.owner.trpc.invitation.create.mutate({
        email,
        serverId: state.serverId,
    });
    await member.trpc.invitation.accept.mutate({ token });
});
beforeEach(async () => {
    events = [];
    controller = new AbortController();
    void (async () => {
        for await (const delivery of artifactUpdatedTopic.subscribe(controller.signal)) {
            events.push(delivery.event);
        }
    })().catch(() => undefined);
    await Bun.sleep(10);
});
afterEach(() => controller.abort());

test('moveMany moves files and folders into one folder with one event', async () => {
    const one = await publish({ path: 'haus/pick/candidates/one.png' });
    await publish({ path: 'haus/pick/candidates/two.png' });
    await publish({ path: 'haus/pick/candidates/sub/three.png' });
    await publish({ path: 'haus/pick/print-ready/kept.png' });
    await delivered();
    events = [];
    const result = await moveMany('haus/pick/print-ready', [
        { base_revision_id: one.artifact.revision_id, path: 'haus/pick/candidates/one.png' },
        { path: 'haus/pick/candidates/sub' },
        { path: 'haus/pick/print-ready/kept.png' },
    ]);
    expect(result).toEqual({
        items: [
            {
                from: 'haus/pick/candidates/one.png',
                kind: 'file',
                to: 'haus/pick/print-ready/one.png',
            },
            { from: 'haus/pick/candidates/sub', kind: 'folder', to: 'haus/pick/print-ready/sub' },
            {
                from: 'haus/pick/print-ready/kept.png',
                kind: 'file',
                to: 'haus/pick/print-ready/kept.png',
            },
        ],
        moved_count: 2,
    });
    expect(await paths('haus/pick')).toEqual([
        'haus/pick/candidates/two.png',
        'haus/pick/print-ready/kept.png',
        'haus/pick/print-ready/one.png',
        'haus/pick/print-ready/sub/three.png',
    ]);
    await delivered();
    expect(events).toEqual([{ artifactId: null, serverId: state.serverId }]);
});

test('moveMany is all or nothing and refuses a folder into itself', async () => {
    await publish({ path: 'haus/tx/a.png' });
    await publish({ path: 'haus/tx/b.png' });
    await publish({ path: 'haus/tx/dest/b.png' });
    await publish({ path: 'haus/tx/inner/c.png' });
    await delivered();
    events = [];
    await expectRefused(
        moveMany('haus/tx/dest', [{ path: 'haus/tx/a.png' }, { path: 'haus/tx/b.png' }]),
        'PATH_TAKEN'
    );
    await expectRefused(
        moveMany('haus/tx/inner', [{ path: 'haus/tx/a.png' }, { path: 'haus/tx/inner' }]),
        'PATH_CONFLICT'
    );
    await expectRefused(
        moveMany('haus/tx/dest', [{ path: 'haus/tx/a.png' }, { path: 'haus/tx/inner/a.png' }]),
        'PATH_TAKEN'
    );
    expect(await paths('haus/tx')).toEqual([
        'haus/tx/a.png',
        'haus/tx/b.png',
        'haus/tx/dest/b.png',
        'haus/tx/inner/c.png',
    ]);
    await delivered();
    expect(events).toEqual([]);
});

test('deleteMany deletes what a member may write, any author, and reports the missing', async () => {
    const owned = await publish({ path: 'haus/del/owner.png' });
    const mine = await memberPublish('haus/del/member.png');
    const ids = [owned.artifact.artifact_id, mine, 'art_missing'];
    await delivered();
    events = [];
    const result = await member.trpc.artifact.deleteMany.mutate({
        artifact_ids: ids,
        serverId: state.serverId,
    });
    expect(result).toEqual({
        deleted: [owned.artifact.artifact_id, mine],
        forbidden: [],
        missing: ['art_missing'],
    });
    expect(await paths('haus/del')).toEqual([]);
    await delivered();
    expect(events).toEqual([{ artifactId: null, serverId: state.serverId }]);

    events = [];
    expect(
        await member.trpc.artifact.deleteMany.mutate({
            artifact_ids: [owned.artifact.artifact_id],
            serverId: state.serverId,
        })
    ).toEqual({ deleted: [], forbidden: [], missing: [owned.artifact.artifact_id] });
    await delivered();
    expect(events).toEqual([]);
});

function moveMany(toFolder: string, items: { base_revision_id?: string; path: string }[]) {
    return state.owner.trpc.artifact.moveMany.mutate({
        items,
        serverId: state.serverId,
        to_folder: toFolder,
    });
}

async function expectRefused(pending: Promise<unknown>, code: string) {
    await expect(pending).rejects.toMatchObject({ data: { artifact: { code } } });
}

async function paths(prefix: string) {
    const listed = await state.owner.trpc.artifact.list.query({
        order: 'path',
        prefix,
        recursive: true,
        serverId: state.serverId,
    });
    return listed.artifacts.map((item) => item.path);
}

/** Publishes as the plain member through the App's upload route; returns the artifact id. */
async function memberPublish(path: string) {
    const url = new URL(`/artifacts/${state.serverId}/publish`, state.harness.url);
    url.searchParams.set('path', path);
    url.searchParams.set('request_id', `batch-${crypto.randomUUID()}`);
    const response = await fetch(url, {
        body: 'member bytes',
        headers: {
            authorization: `Bearer ${await state.harness.humans.mintSessionToken('artifact-batch_member')}`,
            'content-type': 'application/octet-stream',
        },
        method: 'PUT',
    });
    expect(response.status).toBe(200);
    return ((await response.json()) as { artifact: { artifact_id: string } }).artifact.artifact_id;
}

/** Topic deliveries reach the async iterator a few ticks after the write returns. */
async function delivered() {
    await Bun.sleep(10);
}
