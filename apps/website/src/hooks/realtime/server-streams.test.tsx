import { describe, expect, test } from 'bun:test';
import {
    createRealtimeHarness,
    installRealtimeTestDom,
    invalidated,
    runRestarts,
} from '../../test-support/realtime-stream-harness.tsx';
import { useAgentUpdateStream } from './use-agent-update-stream.ts';
import { artifactListingRefreshMs, useArtifactUpdateStream } from './use-artifact-update-stream.ts';
import { useCloudAgentSettingsStream } from './use-cloud-agent-settings-stream.ts';
import { useComputerUpdateStream } from './use-computer-update-stream.ts';
import { useInvitationUpdateStream } from './use-invitation-update-stream.ts';
import { useMcpUpdateStream } from './use-mcp-update-stream.ts';
import { useMemberUpdateStream } from './use-member-update-stream.ts';
import { useReminderStream } from './use-reminder-stream.ts';
import { useServerUpdateStream } from './use-server-update-stream.ts';

installRealtimeTestDom();

const serverId = 'srv_1';
const server = { id: serverId, slug: 'team-room' };
const read = (path: string, input?: Record<string, unknown>) => ({ input, path });

/**
 * Event ops, then the ops of a restart after a completion (owned reads only).
 * The first start and a plain resubscribe reconcile the same owned reads.
 */
async function drive(path: string, useStream: () => void, event: unknown) {
    const harness = createRealtimeHarness();
    function Stream() {
        useStream();
        return null;
    }
    const mounted = await harness.mount(<Stream />);
    harness.start(path);
    const onFirstStart = invalidated(harness.ops.splice(0));
    harness.emit(path, event);
    const onEvent = invalidated(harness.ops.splice(0));
    harness.complete(path);
    expect(runRestarts()).toBe(1);
    harness.start(path);
    const onRecovery = invalidated(harness.ops.splice(0));
    harness.start(path);
    const onResubscribe = invalidated(harness.ops.splice(0));
    await mounted.unmount();
    expect(onFirstStart).toEqual(onRecovery);
    expect(onResubscribe).toEqual(onRecovery);
    return { onEvent, onRecovery };
}

describe('Server-level stream hooks', () => {
    test('agent.onUpdated with an Agent refreshes that Agent and the roster', async () => {
        const { onEvent, onRecovery } = await drive(
            'agent.onUpdated',
            () => useAgentUpdateStream(server),
            { agentId: 'agt_1', serverId }
        );
        const agent = { agentId: 'agt_1', serverId };
        expect(onEvent).toEqual([
            read('cloudAgentWork.listAutomations', { serverId }),
            read('server.bySlug', { slug: 'team-room' }),
            read('agent.get', agent),
            read('agent.deliveryState', agent),
            read('agent.conversationStyle', agent),
            read('agent.skillFile', agent),
            read('agent.workspaceFile', agent),
            read('agent.workspaceFiles', agent),
            read('agent.list', { serverId }),
            read('chat.list', { serverId }),
        ]);
        // Recovery is the broad (null id) row.
        expect(onRecovery).toContainEqual(read('agent.get', { serverId }));
        expect(onRecovery).not.toContainEqual(read('agent.deliveryState', agent));
    });

    test('computer.onUpdated with a Computer refreshes its log and the Server workspace reads', async () => {
        const { onEvent, onRecovery } = await drive(
            'computer.onUpdated',
            () => useComputerUpdateStream(server),
            { computerId: 'cmp_1', serverId }
        );
        expect(onEvent).toEqual([
            read('cloudAgentWork.listAutomations', { serverId }),
            read('server.bySlug', { slug: 'team-room' }),
            read('computer.list', { serverId }),
            read('computer.systemLog', { computerId: 'cmp_1', serverId }),
            read('agent.activeActivity', { serverId }),
            read('agent.deliveryState', { serverId }),
            read('agent.list', { serverId }),
            read('stats.live', { serverId }),
            read('cloudAgentSettings.get', { serverId }),
        ]);
        expect(onRecovery).toContainEqual(read('computer.systemLog', { serverId }));
    });

    test('mcp.onUpdated refreshes the MCP reads', async () => {
        const { onEvent, onRecovery } = await drive(
            'mcp.onUpdated',
            () => useMcpUpdateStream(serverId),
            { serverId }
        );
        const reads = [
            read('mcp.list', { serverId }),
            read('mcp.amazonProduct', { serverId }),
            read('mcp.amazonProductDetail', { serverId }),
        ];
        expect(onEvent).toEqual(reads);
        expect(onRecovery).toEqual(reads);
    });

    test('artifact.onUpdated with a file refreshes every listing and that file', async () => {
        const { onEvent, onRecovery } = await drive(
            'artifact.onUpdated',
            () => useArtifactUpdateStream(serverId),
            { artifactId: 'art_1', serverId }
        );
        const file = { artifact_id: 'art_1', serverId };
        expect(onEvent).toEqual([
            read('artifact.list', { serverId }),
            read('artifact.creators', { serverId }),
            read('artifact.get', file),
            read('artifact.versions', file),
            read('artifact.publicLink', file),
        ]);
        // Recovery (and a folder move's null id) refreshes every file's reads.
        expect(onRecovery).toEqual([
            read('artifact.list', { serverId }),
            read('artifact.creators', { serverId }),
            read('artifact.get', { serverId }),
            read('artifact.versions', { serverId }),
            read('artifact.publicLink', { serverId }),
        ]);
    });

    test('an artifact.onUpdated burst refreshes listings once now and once after the window', async () => {
        const harness = createRealtimeHarness();
        function Stream() {
            useArtifactUpdateStream(serverId);
            return null;
        }
        const mounted = await harness.mount(<Stream />);
        harness.start('artifact.onUpdated');
        harness.ops.splice(0);
        const listings = () =>
            invalidated(harness.ops).filter((op) => op.path === 'artifact.list').length;
        for (const artifactId of ['art_1', 'art_2', 'art_3', 'art_4', 'art_5']) {
            harness.emit('artifact.onUpdated', { artifactId, serverId });
        }
        expect(listings()).toBe(1);
        // Per-file reads never wait.
        expect(invalidated(harness.ops).filter((op) => op.path === 'artifact.get')).toHaveLength(5);
        await Bun.sleep(artifactListingRefreshMs + 50);
        expect(listings()).toBe(2);
        // The trailing refresh opened one more window that closes with nothing pending.
        await Bun.sleep(artifactListingRefreshMs + 50);
        expect(listings()).toBe(2);
        await mounted.unmount();
    });

    test('server.onUpdated refreshes this Server detail and the Server list', async () => {
        const { onEvent, onRecovery } = await drive(
            'server.onUpdated',
            () => useServerUpdateStream(server),
            { serverId }
        );
        const reads = [read('server.bySlug', { slug: 'team-room' }), read('server.list')];
        expect(onEvent).toEqual(reads);
        expect(onRecovery).toEqual(reads);
    });

    test('member.onUpdated refreshes that human, the directory, Chat rows, and the role', async () => {
        const { onEvent, onRecovery } = await drive(
            'member.onUpdated',
            () => useMemberUpdateStream(server),
            { memberId: 'usr_bo', serverId }
        );
        expect(onEvent).toEqual([
            read('member.get', { serverId, userId: 'usr_bo' }),
            read('member.list', { serverId }),
            read('chat.list', { serverId }),
            read('server.bySlug', { slug: 'team-room' }),
        ]);
        expect(onRecovery[0]).toEqual(read('member.get', { serverId }));
    });

    test('invitation.onUpdated refreshes the invitation list', async () => {
        const { onEvent, onRecovery } = await drive(
            'invitation.onUpdated',
            () => useInvitationUpdateStream(serverId),
            { serverId }
        );
        expect(onEvent).toEqual([read('invitation.list', { serverId })]);
        expect(onRecovery).toEqual(onEvent);
    });

    test('cloudAgentSettings.onUpdated refreshes the settings read', async () => {
        const { onEvent, onRecovery } = await drive(
            'cloudAgentSettings.onUpdated',
            () => useCloudAgentSettingsStream(serverId),
            { serverId }
        );
        expect(onEvent).toEqual([read('cloudAgentSettings.get', { serverId })]);
        expect(onRecovery).toEqual(onEvent);
    });

    test('reminder.onUpdated refreshes the owner Agent reminders, history, and runs', async () => {
        const { onEvent, onRecovery } = await drive(
            'reminder.onUpdated',
            () => useReminderStream(serverId),
            { action: 'fired', ownerAgentId: 'agt_1', reminderId: 'rem_1', serverId }
        );
        expect(onEvent).toEqual([
            read('reminder.list', { agentId: 'agt_1', serverId }),
            read('reminder.history', { agentId: 'agt_1', serverId }),
            read('reminder.runs', { reminderId: 'rem_1', serverId }),
        ]);
        expect(onRecovery).toEqual([
            read('reminder.list', { serverId }),
            read('reminder.history', { serverId }),
            read('reminder.runs', { serverId }),
        ]);
    });
});
