import { expect, test } from 'bun:test';
import { createServerUpdateHandler } from './use-server-events.ts';

interface Invalidation {
    input?: unknown;
    name: string;
}

function recordingUtils() {
    const invalidated: Invalidation[] = [];
    const invalidate = (name: string) => async (input?: unknown) => {
        invalidated.push({ input, name });
    };

    return {
        invalidated,
        utils: {
            agent: {
                activeActivity: { invalidate: invalidate('agent.activeActivity') },
                deliveryState: { invalidate: invalidate('agent.deliveryState') },
                get: { invalidate: invalidate('agent.get') },
                list: { invalidate: invalidate('agent.list') },
                skillFile: { invalidate: invalidate('agent.skillFile') },
                workspaceFile: { invalidate: invalidate('agent.workspaceFile') },
                workspaceFiles: { invalidate: invalidate('agent.workspaceFiles') },
            },
            chat: { list: { invalidate: invalidate('chat.list') } },
            computer: {
                list: { invalidate: invalidate('computer.list') },
                systemLog: { invalidate: invalidate('computer.systemLog') },
            },
            invitation: { list: { invalidate: invalidate('invitation.list') } },
            mcp: {
                list: { invalidate: invalidate('mcp.list') },
                amazonProducts: { invalidate: invalidate('mcp.amazonProducts') },
                amazonProductDetail: { invalidate: invalidate('mcp.amazonProductDetail') },
            },
            member: {
                get: { invalidate: invalidate('member.get') },
                list: { invalidate: invalidate('member.list') },
            },
            server: {
                bySlug: { invalidate: invalidate('server.bySlug') },
                list: { invalidate: invalidate('server.list') },
            },
            stats: { live: { invalidate: invalidate('stats.live') } },
        } as unknown as Parameters<typeof createServerUpdateHandler>[0],
    };
}

function names(invalidated: Invalidation[]) {
    return invalidated.map((entry) => entry.name);
}

test('computer events refresh Server workspace reads without polling', () => {
    const { invalidated, utils } = recordingUtils();

    createServerUpdateHandler(utils, 'server-one', 'team-room')({ scope: 'computer' });

    expect(names(invalidated)).toEqual([
        'server.bySlug',
        'computer.list',
        'computer.systemLog',
        'agent.activeActivity',
        'agent.get',
        'agent.list',
        'agent.skillFile',
        'agent.workspaceFile',
        'agent.workspaceFiles',
        'stats.live',
    ]);
});

test('a named Computer event refreshes only that Computer system log', () => {
    const { invalidated, utils } = recordingUtils();

    createServerUpdateHandler(
        utils,
        'server-one',
        'team-room'
    )({ computerId: 'cmp_macbook', scope: 'computer' });

    expect(invalidated[2]).toEqual({
        input: { computerId: 'cmp_macbook', serverId: 'server-one' },
        name: 'computer.systemLog',
    });
});

test('Agent events refresh the active directory and durable Chat list', () => {
    const { invalidated, utils } = recordingUtils();

    createServerUpdateHandler(utils, 'server-one', 'team-room')({ scope: 'agent' });

    expect(names(invalidated)).toEqual(['server.bySlug', 'agent.get', 'agent.list', 'chat.list']);
});

test('a named Agent refreshes only its own detail and delivery state', () => {
    const { invalidated, utils } = recordingUtils();

    createServerUpdateHandler(
        utils,
        'server-one',
        'team-room'
    )({ agentId: 'agt_scout', scope: 'agent' });

    expect(invalidated).toEqual([
        { input: { slug: 'team-room' }, name: 'server.bySlug' },
        { input: { agentId: 'agt_scout', serverId: 'server-one' }, name: 'agent.get' },
        { input: { agentId: 'agt_scout', serverId: 'server-one' }, name: 'agent.deliveryState' },
        { input: { serverId: 'server-one' }, name: 'agent.list' },
        { input: { serverId: 'server-one' }, name: 'chat.list' },
    ]);
});

test('an unnamed Agent event still refreshes every cached Agent detail', () => {
    const { invalidated, utils } = recordingUtils();

    createServerUpdateHandler(utils, 'server-one', 'team-room')({ scope: 'agent' });

    expect(invalidated[1]).toEqual({ input: undefined, name: 'agent.get' });
    expect(names(invalidated)).not.toContain('agent.deliveryState');
});

test('a named Agent on a Computer event refreshes that Agent exactly', () => {
    const { invalidated, utils } = recordingUtils();

    createServerUpdateHandler(
        utils,
        'server-one',
        'team-room'
    )({ agentId: 'agt_scout', scope: 'computer' });

    expect(invalidated[4]).toEqual({
        input: { agentId: 'agt_scout', serverId: 'server-one' },
        name: 'agent.get',
    });
    expect(names(invalidated)).toContain('agent.deliveryState');
});

test('a named human refreshes only their own directory record', () => {
    const { invalidated, utils } = recordingUtils();

    createServerUpdateHandler(
        utils,
        'server-one',
        'team-room'
    )({ memberId: 'usr_ada', scope: 'server' });

    expect(invalidated).toEqual([
        { input: { slug: 'team-room' }, name: 'server.bySlug' },
        { input: undefined, name: 'server.list' },
        { input: { serverId: 'server-one', userId: 'usr_ada' }, name: 'member.get' },
        { input: { serverId: 'server-one' }, name: 'member.list' },
        { input: { serverId: 'server-one' }, name: 'invitation.list' },
    ]);
});

test('an unnamed Server event refreshes every cached member record', () => {
    const { invalidated, utils } = recordingUtils();

    createServerUpdateHandler(utils, 'server-one', 'team-room')({ scope: 'server' });

    expect(invalidated[2]).toEqual({ input: undefined, name: 'member.get' });
});

test('a listener refreshes only the Server detail it watches', () => {
    const { invalidated, utils } = recordingUtils();

    createServerUpdateHandler(utils, 'server-one', 'team-room')({ scope: 'server' });

    expect(invalidated[0]).toEqual({ input: { slug: 'team-room' }, name: 'server.bySlug' });
});

test('an unknown slug falls back to refreshing every cached Server detail', () => {
    const { invalidated, utils } = recordingUtils();

    createServerUpdateHandler(utils, 'server-one', undefined)({ scope: 'server' });

    expect(invalidated[0]).toEqual({ input: undefined, name: 'server.bySlug' });
});

test('MCP events invalidate connections and their product previews', () => {
    const { invalidated, utils } = recordingUtils();

    createServerUpdateHandler(utils, 'server-one', 'team-room')({ scope: 'mcp' });

    expect(names(invalidated)).toEqual([
        'mcp.list',
        'mcp.amazonProducts',
        'mcp.amazonProductDetail',
    ]);
});
