import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { ArtifactUpdatedEvent } from '@haus/api';
import { deleteArtifact } from '../src/artifacts/delete.ts';
import { moveArtifacts } from '../src/artifacts/move.ts';
import { deleteExpiredArtifactRevisions } from '../src/artifacts/retention.ts';
import { artifactUpdatedTopic } from '../src/realtime/topics.ts';
import { artifactDriveFixture } from './artifact-drive-fixture.ts';

/**
 * `artifact.onUpdated` notifies after every committed Files change: a publish, a file or folder
 * move, a delete, and a retention prune. A failed write publishes nothing.
 */
const { publish, state, storage } = artifactDriveFixture('artifact-events');
let events: ArtifactUpdatedEvent[] = [];
let controller: AbortController;

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

test('publish, file move, and delete each name the file', async () => {
    const created = await publish({ path: 'events/a.txt' });
    const artifactId = created.artifact.artifact_id;
    await moveArtifacts(state.connection.db, state.actor, state.harness.appOrigin, {
        from: 'events/a.txt',
        to: 'events/b.txt',
    });
    await deleteArtifact(state.connection.db, state.actor, storage, artifactId);
    await delivered();
    const named = { artifactId, serverId: state.serverId };
    expect(events).toEqual([named, named, named]);
});

test('a folder move is one broad event', async () => {
    await publish({ path: 'events/folder/one.txt' });
    await publish({ path: 'events/folder/two.txt' });
    await delivered();
    events = [];
    await moveArtifacts(state.connection.db, state.actor, state.harness.appOrigin, {
        from: 'events/folder',
        to: 'events/moved',
    });
    await delivered();
    expect(events).toEqual([{ artifactId: null, serverId: state.serverId }]);
});

test('a conflicting write publishes nothing', async () => {
    await publish({ path: 'events/taken.txt' });
    await delivered();
    events = [];
    await expect(publish({ path: 'events/taken.txt' })).rejects.toMatchObject({
        code: 'REVISION_CONFLICT',
    });
    await delivered();
    expect(events).toEqual([]);
});

test('a retention prune names each file that lost revisions', async () => {
    const first = await publish({ body: 'one', path: 'events/pruned.txt' });
    await publish({ base: first.artifact.revision_id, body: 'two', path: 'events/pruned.txt' });
    await state.harness.sql`
        update artifact_revisions set created_at = now() - interval '30 days'
        where artifact_id = ${first.artifact.artifact_id}
    `;
    await delivered();
    events = [];
    await deleteExpiredArtifactRevisions(state.connection.db, storage, new Date());
    await delivered();
    expect(events).toEqual([{ artifactId: first.artifact.artifact_id, serverId: state.serverId }]);
});

/** Topic deliveries reach the async iterator a few ticks after the write returns. */
async function delivered() {
    await Bun.sleep(10);
}
