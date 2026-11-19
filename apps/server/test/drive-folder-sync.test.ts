import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { driveRemote } from '../../computer/src/drive/drive-remote.ts';
import { driveFolderLayout } from '../../computer/src/drive/folder-state.ts';
import { pullDrive } from '../../computer/src/drive/pull.ts';
import { planDrivePush, sendDrivePush } from '../../computer/src/drive/push.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { recordRunTrigger } from '../src/server-agents/record-agent-turn.ts';
import { taskAssignmentKey } from '../src/tasks/task-assignment-envelope.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { MemoryArtifactStorage } from './artifact-drive-fixture.ts';

const blobs = Bun.serve({
    fetch: (request) => {
        const key = decodeURIComponent(new URL(request.url).pathname.slice(1));
        const bytes = storage.objects.get(key);
        return bytes ? new Response(bytes) : new Response('missing', { status: 404 });
    },
    port: 0,
});
class ServedStorage extends MemoryArtifactStorage {
    override downloadUrl(key: string) {
        return `http://127.0.0.1:${blobs.port}/${encodeURIComponent(key)}`;
    }
}
const storage = new ServedStorage();
const fixture = agentCreationFixture(undefined, { artifactStorage: storage });
let connection: HausConnection;
beforeAll(async () => {
    connection = await connectHausDatabase(fixture.harness.databaseUrl);
});
afterAll(async () => {
    await connection?.close();
    blobs.stop(true);
});

async function writer(agentId: string) {
    const root = mkdtempSync(join(tmpdir(), 'haus-drive-folder-'));
    const layout = driveFolderLayout(root, agentId);
    const token = async (runId: string) => {
        await recordRunTrigger(
            connection.db,
            { agentId, runId, serverId: fixture.serverId },
            {
                chatId: null,
                dedupeKey: taskAssignmentKey(`task_${runId}`, 1),
                source: 'task_assignment',
            }
        );
        return (await fixture.mintRunner(runId, agentId, fixture.channelId, false)).token;
    };
    const remote = async (runId: string) =>
        driveRemote({ serverOrigin: fixture.harness.url, token: await token(runId) });
    const local = (path: string) => join(layout.folder, ...path.split('/'));
    return {
        pull: async (runId: string) => pullDrive({ layout, remote: await remote(runId) }),
        push: async (runId: string) => {
            const plan = await planDrivePush(layout);
            return plan.isEmpty ? null : await sendDrivePush(plan, await remote(runId), runId);
        },
        read: (path: string) => readFile(local(path), 'utf8').catch(() => null),
        force: async (path: string) => {
            await chmod(dirname(local(path)), 0o755);
            await chmod(local(path), 0o644);
        },
        write: async (path: string, text: string) => {
            await mkdir(dirname(local(path)), { recursive: true });
            await writeFile(local(path), text);
        },
    };
}

test('two Computer drive/ folders sync through the Server: create, pull, merge, keep both, refuse', async () => {
    const orbit = await writer(fixture.orbitAgentId);
    const peer = await writer(fixture.peerAgentId);

    await orbit.write('haus/d4/plan.md', 'goal\nowner\ndate\n');
    expect(await orbit.push('run_sync_create')).toMatchObject({ failed: [], listed: [], sent: 1 });
    await orbit.write('agents/orbit/notes/mine.md', 'orbit notes');
    expect(await orbit.push('run_sync_own')).toMatchObject({ failed: [], sent: 1 });

    expect(await peer.pull('run_sync_peer_pull')).toMatchObject({ advanced: true, blocked: 0 });
    expect(await peer.read('haus/d4/plan.md')).toBe('goal\nowner\ndate\n');
    expect(await peer.read('agents/orbit/notes/mine.md')).toBe('orbit notes');
    expect(await orbit.pull('run_sync_orbit_pull')).toMatchObject({ advanced: true, blocked: 0 });

    await orbit.write('haus/d4/plan.md', 'goal: ship\nowner\ndate\n');
    await peer.write('haus/d4/plan.md', 'goal\nowner\ndate: friday\n');
    expect(await orbit.push('run_sync_orbit_edit')).toMatchObject({ failed: [], sent: 1 });
    expect(await peer.push('run_sync_peer_edit')).toMatchObject({
        failed: [],
        listed: [],
        sent: 1,
    });
    expect(await peer.read('haus/d4/plan.md')).toBe('goal: ship\nowner\ndate: friday\n');

    await orbit.pull('run_sync_orbit_pull2');
    await orbit.write('haus/d4/plan.md', 'goal: ship now\nowner\ndate: friday\n');
    await peer.write('haus/d4/plan.md', 'goal: wait\nowner\ndate: friday\n');
    await orbit.push('run_sync_orbit_same');
    const conflicted = await peer.push('run_sync_peer_same');
    expect(conflicted?.listed).toMatchObject([
        {
            copyPath: 'haus/d4/plan.conflict-peer.md',
            outcome: 'kept_both',
            path: 'haus/d4/plan.md',
        },
    ]);
    expect(await peer.read('haus/d4/plan.md')).toBe('goal: ship now\nowner\ndate: friday\n');
    expect(await peer.read('haus/d4/plan.conflict-peer.md')).toBe(
        'goal: wait\nowner\ndate: friday\n'
    );
    expect(await peer.push('run_sync_peer_after')).toBeNull();

    await peer.force('agents/orbit/notes/mine.md');
    await peer.write('agents/orbit/notes/mine.md', 'peer was here');
    const refused = await peer.push('run_sync_peer_refused');
    expect(refused?.listed).toMatchObject([
        { outcome: 'refused', path: 'agents/orbit/notes/mine.md' },
    ]);
    expect(await peer.read('agents/orbit/notes/mine.md')).toBe('orbit notes');
});
