import { describe, expect, test } from 'bun:test';
import { MemoryRouter } from 'react-router-dom';
import { AgentActivityProvider } from '../../hooks/agents/use-current-agent-activity.tsx';
import { useMemberUpdateStream } from '../../hooks/realtime/use-member-update-stream.ts';
import { useServerUpdateStream } from '../../hooks/realtime/use-server-update-stream.ts';
import { useChatCompositions } from '../../hooks/servers/use-chat-compositions.ts';
import { useChatEngagement } from '../../hooks/servers/use-chat-engagement.ts';
import { useChatMessage } from '../../hooks/servers/use-chat-message.ts';
import { useChatThoughtListener } from '../../hooks/servers/use-chat-thought-listener.ts';
import {
    createRealtimeHarness,
    installRealtimeTestDom,
} from '../../test-support/realtime-stream-harness.tsx';
import { AgentLifecycleProvider } from './agent-lifecycle.tsx';
import { KeptChatViews } from './chat/kept-chat-views.tsx';
import { ServerRealtimeListeners } from './server-realtime-listeners.tsx';

installRealtimeTestDom();

const servers = [
    { id: 'srv_a', slug: 'a-room' },
    { id: 'srv_b', slug: 'b-room' },
    { id: 'srv_c', slug: 'c-room' },
];

function answer(path: string): unknown {
    switch (path) {
        case 'server.list':
            return servers;
        case 'server.bySlug':
            return { ...servers[0], onboarding: { phase: 'complete' } };
        case 'member.list':
            return { members: [], viewerUserId: 'usr_viewer' };
        case 'chat.engagements':
            return { engagements: [] };
        case 'agent.activeActivity':
            return { activities: [] };
        case 'chat.message':
            return { message: null, thread: null };
        default:
            return [];
    }
}

/**
 * What `ServerEventListeners` mounts per accessible Server. Mounted directly:
 * haus-server-routes.test.tsx replaces that module for the whole test process.
 */
function EveryServerStreams({ server }: { server: (typeof servers)[number] }) {
    useServerUpdateStream(server);
    useMemberUpdateStream(server);
    return null;
}

/** One Chat view's per-view streams and one transcript row. */
function ChatView({ chatId }: { chatId: string }) {
    useChatEngagement('srv_a', chatId);
    useChatThoughtListener('srv_a', chatId, () => undefined);
    useChatCompositions('srv_a', chatId);
    useChatMessage('srv_a', chatId, `msg_${chatId}`);
    return null;
}

function Shell({ chatId, role }: { chatId: string; role: 'admin' | 'member' }) {
    return (
        <MemoryRouter initialEntries={['/s/a-room']}>
            {servers.map((server) => (
                <EveryServerStreams key={server.id} server={server} />
            ))}
            <ServerRealtimeListeners server={{ ...servers[0], role }} />
            <AgentLifecycleProvider serverId="srv_a">
                <AgentActivityProvider serverId="srv_a">
                    <KeptChatViews
                        chatId={chatId}
                        renderChat={(id) => <ChatView chatId={id} />}
                        serverId="srv_a"
                    />
                </AgentActivityProvider>
            </AgentLifecycleProvider>
        </MemoryRouter>
    );
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function expectedStreams(role: 'admin' | 'member') {
    const perServer = ['member.onUpdated', 'server.onUpdated'];
    const active = [
        'agent.onUpdated',
        'chat.onLifecycle',
        'chat.onMessageCreated',
        'chat.onMessageReactionUpdated',
        'chat.onRead',
        'cloudAgentSettings.onUpdated',
        'cloudAgentWork.onUpdated',
        'computer.onUpdated',
        'mcp.onUpdated',
        'task.onChanged',
        'taskLabel.onUpdated',
        'thread.onFollowUpdated',
    ];
    const operator = role === 'admin' ? ['invitation.onUpdated', 'reminder.onUpdated'] : [];
    const agentStreams = ['agent.onActivity', 'agent.onLifecycle'];
    const perChatView = ['chat.onComposition', 'chat.onEngagement', 'chat.onThought'];
    return [
        ...servers.flatMap(() => perServer),
        ...active,
        ...operator,
        ...agentStreams,
        ...perChatView,
        ...perChatView,
    ].sort();
}

/**
 * The per-window subscription budget (specs/realtime-events.md, "Topology"):
 * 2 × accessible Servers, 12 active-Server streams, 2 role-gated streams for
 * Owners and Admins, the 2 hoisted Agent streams, and 3 per mounted Chat view.
 */
describe('realtime subscription budget', () => {
    for (const [role, expected] of [
        ['member', 26],
        ['admin', 28],
    ] as const) {
        test(`three Servers, one shown and one kept Chat view, as ${role}: ${expected} streams`, async () => {
            const harness = createRealtimeHarness(answer);
            const mounted = await harness.mount(<Shell chatId="cht_kept" role={role} />);
            await flush();
            await mounted.render(<Shell chatId="cht_shown" role={role} />);
            await flush();
            await flush();

            const open = harness.openPaths();
            expect(open).toEqual(expectedStreams(role));
            expect(open).toHaveLength(expected);
            expect(open.filter((path) => path === 'server.onUpdated')).toHaveLength(3);
            expect(open.filter((path) => path === 'member.onUpdated')).toHaveLength(3);
            expect(open.filter((path) => path === 'chat.onEngagement')).toHaveLength(2);
            expect(open.includes('reminder.onUpdated')).toBe(role === 'admin');

            // The hidden kept view holds no active entity observers.
            const entity = (chatId: string) =>
                harness.queryClient
                    .getQueryCache()
                    .getAll()
                    .find((query) => JSON.stringify(query.queryKey).includes(`msg_${chatId}`));
            expect(entity('cht_shown')?.getObserversCount()).toBe(1);
            expect(entity('cht_kept')?.getObserversCount() ?? 0).toBe(0);

            // A socket reconnect restarts every stream; no root stream recovers
            // on that start (the App-wide reconnect pass owns it).
            harness.ops.length = 0;
            const reads = harness.reads.length;
            for (const stream of harness.streams.filter((candidate) => !candidate.closed)) {
                await harness.act(() => stream.observer.next({ result: { type: 'started' } }));
            }
            await flush();
            expect(harness.ops).toEqual([]);
            const startReads = harness.reads.slice(reads);
            // Only the volatile streams re-read their live projections on every start.
            expect(
                startReads.filter(
                    (path) =>
                        ![
                            'agent.activeActivity',
                            'agent.get',
                            'agent.list',
                            'chat.engagements',
                        ].includes(path)
                )
            ).toEqual([]);
            await mounted.unmount();
        });
    }
});
