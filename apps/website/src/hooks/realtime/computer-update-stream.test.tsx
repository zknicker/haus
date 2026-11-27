import { expect, test } from 'bun:test';
import {
    createRealtimeHarness,
    installRealtimeTestDom,
    invalidated,
    runRestarts,
} from '../../test-support/realtime-stream-harness.tsx';
import { useComputerUpdateStream } from './use-computer-update-stream.ts';

installRealtimeTestDom();

const serverId = 'srv_1';
const server = { id: serverId, slug: 'team-room' };
const read = (path: string, input?: Record<string, unknown>) => ({ input, path });

test('computer.onUpdated with a Computer refreshes its log, folders, the repo list and the Server workspace reads', async () => {
    const harness = createRealtimeHarness();
    function Stream() {
        useComputerUpdateStream(server);
        return null;
    }
    const mounted = await harness.mount(<Stream />);
    harness.start('computer.onUpdated');
    const onFirstStart = invalidated(harness.ops.splice(0));
    harness.emit('computer.onUpdated', { computerId: 'cmp_1', serverId });
    const onEvent = invalidated(harness.ops.splice(0));
    harness.complete('computer.onUpdated');
    expect(runRestarts()).toBe(1);
    harness.start('computer.onUpdated');
    const onRecovery = invalidated(harness.ops.splice(0));
    await mounted.unmount();

    expect(onEvent).toEqual([
        read('server.bySlug', { slug: 'team-room' }),
        read('computer.list', { serverId }),
        read('computer.systemLog', { computerId: 'cmp_1', serverId }),
        read('computer.repoFolders', { computerId: 'cmp_1', serverId }),
        read('computer.repoFolderStates', { computerId: 'cmp_1', serverId }),
        read('repo.list', { serverId }),
        read('agent.activeActivity', { serverId }),
        read('agent.deliveryState', { serverId }),
        read('agent.machine', { serverId }),
        read('agent.list', { serverId }),
        read('stats.live', { serverId }),
    ]);
    expect(onFirstStart).toEqual(onRecovery);
    for (const path of [
        'computer.systemLog',
        'computer.repoFolders',
        'computer.repoFolderStates',
        'repo.list',
    ]) {
        expect(onRecovery).toContainEqual(read(path, { serverId }));
    }
});
