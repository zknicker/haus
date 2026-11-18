import { afterEach, beforeAll, beforeEach, expect, test } from 'bun:test';
import type { ArtifactUpdatedEvent } from '@haus/api';
import { artifactUpdatedTopic } from '../src/realtime/topics.ts';
import { artifactDriveFixture } from './artifact-drive-fixture.ts';
import { createHausClient, type HausClient } from './haus-client.ts';

/**
 * Batched Files actions: `artifact.moveMany` moves a selection into one folder in one
 * transaction, and `artifact.deleteMany` deletes the files the caller may delete. Each
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
    const one = await publish({ path: 'pick/candidates/one.png' });
    await publish({ path: 'pick/candidates/two.png' });
    await publish({ path: 'pick/candidates/sub/three.png' });
    await publish({ path: 'pick/print-ready/kept.png' });
    await delivered();
    events = [];
    const result = await moveMany('pick/print-ready', [
        { base_revision_id: one.artifact.revision_id, path: 'pick/candidates/one.png' },
        { path: 'pick/candidates/sub' },
        { path: 'pick/print-ready/kept.png' },
    ]);
    expect(result).toEqual({
        items: [
            { from: 'pick/candidates/one.png', kind: 'file', to: 'pick/print-ready/one.png' },
            { from: 'pick/candidates/sub', kind: 'folder', to: 'pick/print-ready/sub' },
            { from: 'pick/print-ready/kept.png', kind: 'file', to: 'pick/print-ready/kept.png' },
        ],
        moved_count: 2,
    });
    expect(await paths('pick')).toEqual([
        'pick/candidates/two.png',
        'pick/print-ready/kept.png',
        'pick/print-ready/one.png',
        'pick/print-ready/sub/three.png',
    ]);
    await delivered();
    expect(events).toEqual([{ artifactId: null, serverId: state.serverId }]);
});

test('moveMany is all or nothing and refuses a folder into itself', async () => {
    await publish({ path: 'tx/a.png' });
    await publish({ path: 'tx/b.png' });
    await publish({ path: 'tx/dest/b.png' });
    await publish({ path: 'tx/inner/c.png' });
    await delivered();
    events = [];
    await expectRefused(
        moveMany('tx/dest', [{ path: 'tx/a.png' }, { path: 'tx/b.png' }]),
        'PATH_TAKEN'
    );
    await expectRefused(
        moveMany('tx/inner', [{ path: 'tx/a.png' }, { path: 'tx/inner' }]),
        'PATH_CONFLICT'
    );
    await expectRefused(
        moveMany('tx/dest', [{ path: 'tx/a.png' }, { path: 'tx/inner/a.png' }]),
        'PATH_TAKEN'
    );
    expect(await paths('tx')).toEqual(['tx/a.png', 'tx/b.png', 'tx/dest/b.png', 'tx/inner/c.png']);
    await delivered();
    expect(events).toEqual([]);
});

test('deleteMany deletes only what the caller may delete and reports the rest', async () => {
    const owned = await publish({ path: 'del/owner.png' });
    const mine = await memberPublish('del/member.png');
    const ids = [owned.artifact.artifact_id, mine, 'art_missing'];
    await delivered();
    events = [];
    const result = await member.trpc.artifact.deleteMany.mutate({
        artifact_ids: ids,
        serverId: state.serverId,
    });
    expect(result).toEqual({
        deleted: [mine],
        forbidden: [owned.artifact.artifact_id],
        missing: ['art_missing'],
    });
    expect(await paths('del')).toEqual(['del/owner.png']);
    await delivered();
    expect(events).toEqual([{ artifactId: null, serverId: state.serverId }]);

    events = [];
    expect(
        await member.trpc.artifact.deleteMany.mutate({
            artifact_ids: [owned.artifact.artifact_id],
            serverId: state.serverId,
        })
    ).toEqual({ deleted: [], forbidden: [owned.artifact.artifact_id], missing: [] });
    await delivered();
    expect(events).toEqual([]);

    expect(
        await state.owner.trpc.artifact.deleteMany.mutate({
            artifact_ids: [owned.artifact.artifact_id],
            serverId: state.serverId,
        })
    ).toEqual({ deleted: [owned.artifact.artifact_id], forbidden: [], missing: [] });
    expect(await paths('del')).toEqual([]);
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
