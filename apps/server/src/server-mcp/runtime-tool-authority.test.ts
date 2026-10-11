import { afterAll, expect, test } from 'bun:test';
import type { HausDatabase } from '../postgres/connection.ts';
import { makeServerRuntime } from '../server-runtime.ts';
import { McpDeniedError } from './errors.ts';
import { McpRuntime } from './runtime.ts';
import { fakeQuery, fakeUpdate, makeClient } from './runtime-test-fixtures.ts';

const effectRuntime = makeServerRuntime();
const echo = { description: 'Echo', inputSchema: {}, name: 'echo' };
const actionsList = { description: 'List runs', inputSchema: {}, name: 'actions_list' };
const grantedRow = {
    connected: true,
    grantedAgentId: 'agent-one',
    id: 'connection-one',
    name: 'GitHub',
    tools: ['echo'],
};
const actionsListName = 'mcp__connection-one__actions_list_25aef65e';

afterAll(async () => {
    await effectRuntime.dispose();
});

test('invokes a tool the stored snapshot has never seen', async () => {
    let lists = 0;
    const { client, state } = makeClient('GitHub', {
        list: async () => {
            lists += 1;
            return lists === 1 ? { tools: [echo] } : { tools: [echo, actionsList] };
        },
    });
    const updates: unknown[] = [];
    const runtime = new McpRuntime(authorityDb([grantedRow], updates), effectRuntime, {
        clientFactory: async () => client,
    });
    expect(
        (await runtime.listAgentTools('server-one', 'agent-one')).map((tool) => tool.name)
    ).toEqual(['mcp__connection-one__echo_ccfe8f4c']);
    expect(await invoke(runtime, actionsListName)).toEqual({
        content: [{ text: 'ok', type: 'text' }],
    });
    expect(state.listRequests).toHaveLength(2);
    expect(state.callRequests[0]?.name).toBe('actions_list');
    expect(updates).toEqual([]);
    await runtime.close();
});

test('a name absent from a fresh listing is not offered, never ungranted', async () => {
    const { client, state } = makeClient('GitHub', {
        list: async () => ({ tools: [echo] }),
    });
    const runtime = new McpRuntime(authorityDb([grantedRow]), effectRuntime, {
        clientFactory: async () => client,
    });
    const name = 'mcp__connection-one__missing_tool_e3a34b0f';
    const message =
        'The GitHub connection does not offer mcp__connection-one__missing_tool_e3a34b0f. Run tools.search to find its current tools.';
    const first = await invoke(runtime, name).catch((cause: unknown) => cause);
    expect(first).toBeInstanceOf(McpDeniedError);
    expect(first).toMatchObject({ code: 'MCP_DENIED', message });
    expect(state.listRequests).toHaveLength(1);
    expect(state.callRequests).toHaveLength(0);
    const second = await invoke(runtime, name).catch((cause: unknown) => cause);
    expect(second).toMatchObject({ code: 'MCP_DENIED', message });
    expect(state.listRequests).toHaveLength(2);
    await runtime.close();
});

test('an upstream failure while resolving a new name stays an upstream error', async () => {
    let lists = 0;
    const failing = makeClient('GitHub', {
        list: async () => {
            lists += 1;
            if (lists === 1) {
                return { tools: [echo] };
            }
            return await Promise.reject({ status: 503 });
        },
    });
    const runtime = new McpRuntime(authorityDb([grantedRow]), effectRuntime, {
        clientFactory: async () => failing.client,
    });
    await runtime.listAgentTools('server-one', 'agent-one');
    const unavailable = await invoke(runtime, actionsListName).catch((cause: unknown) => cause);
    expect(unavailable).not.toBeInstanceOf(McpDeniedError);
    expect(unavailable).toMatchObject({
        code: 'MCP_UNAVAILABLE',
        message: 'The MCP invocation is unavailable: upstream HTTP 503.',
    });
    await runtime.close();

    let hungLists = 0;
    const hanging = makeClient('GitHub', {
        list: (request) => {
            hungLists += 1;
            if (hungLists === 1) {
                return Promise.resolve({ tools: [echo] });
            }
            return new Promise((_resolve, reject) => {
                request?.options?.signal?.addEventListener('abort', () => {
                    reject(new Error('aborted'));
                });
            });
        },
    });
    const slow = new McpRuntime(authorityDb([grantedRow]), effectRuntime, {
        clientFactory: async () => hanging.client,
        invocationTimeoutMs: 15,
    });
    await slow.listAgentTools('server-one', 'agent-one');
    await expect(invoke(slow, actionsListName)).rejects.toMatchObject({
        code: 'MCP_TIMEOUT',
        message: 'The MCP invocation timed out.',
    });
    await slow.close();
});

test('only the connection grant authorizes; no client is built for a denial', async () => {
    let builds = 0;
    const clientFactory = async () => {
        builds += 1;
        return makeClient('GitHub').client;
    };
    const echoName = 'mcp__connection-one__echo_ccfe8f4c';
    const ungranted = new McpRuntime(
        authorityDb([
            { connected: true, grantedAgentId: null, id: 'connection-one', name: 'GitHub' },
        ]),
        effectRuntime,
        { clientFactory }
    );
    await expect(invoke(ungranted, echoName)).rejects.toMatchObject({
        code: 'MCP_DENIED',
        message:
            'This Agent has no access to the GitHub connection. Ask a Server Owner or Admin to grant this Agent access to GitHub.',
    });
    expect(builds).toBe(0);
    await ungranted.close();

    const disconnected = new McpRuntime(
        authorityDb([
            { connected: false, grantedAgentId: null, id: 'connection-one', name: 'GitHub' },
        ]),
        effectRuntime,
        { clientFactory }
    );
    await expect(invoke(disconnected, echoName)).rejects.toMatchObject({
        code: 'MCP_DENIED',
        message:
            'The GitHub connection is disconnected. Ask a Server Owner or Admin to reconnect GitHub and grant this Agent access to it.',
    });
    expect(builds).toBe(0);
    await disconnected.close();

    const missing = new McpRuntime(authorityDb([]), effectRuntime, { clientFactory });
    await expect(invoke(missing, echoName)).rejects.toMatchObject({
        code: 'MCP_DENIED',
        message:
            'No connection on this Haus Server offers mcp__connection-one__echo_ccfe8f4c. Run tools.search to find the tools this Agent can use.',
    });
    expect(builds).toBe(0);
    await missing.close();
});

test('search records the live list; a failed or empty listing records nothing', async () => {
    const updates: unknown[] = [];
    const listed = makeClient('GitHub', {
        list: async () => ({ tools: [echo, actionsList] }),
    });
    const runtime = new McpRuntime(authorityDb([grantedRow], updates), effectRuntime, {
        clientFactory: async () => listed.client,
    });
    expect(await runtime.listAgentTools('server-one', 'agent-one')).toHaveLength(2);
    expect(updates).toEqual([{ tools: ['actions_list', 'echo'] }]);
    await runtime.close();

    const failedUpdates: unknown[] = [];
    const failed = makeClient('GitHub', {
        list: async () => await Promise.reject(new Error('down')),
    });
    const failedRuntime = new McpRuntime(authorityDb([grantedRow], failedUpdates), effectRuntime, {
        clientFactory: async () => failed.client,
    });
    expect(await failedRuntime.listAgentTools('server-one', 'agent-one')).toEqual([]);
    expect(failedUpdates).toEqual([]);
    await failedRuntime.close();

    const emptyUpdates: unknown[] = [];
    const empty = makeClient('GitHub', { list: async () => ({ tools: [] }) });
    const emptyRuntime = new McpRuntime(authorityDb([grantedRow], emptyUpdates), effectRuntime, {
        clientFactory: async () => empty.client,
    });
    expect(await emptyRuntime.listAgentTools('server-one', 'agent-one')).toEqual([]);
    expect(emptyUpdates).toEqual([]);
    await emptyRuntime.close();

    const broken = makeClient('GitHub', { list: async () => ({ tools: [echo] }) });
    const brokenRuntime = new McpRuntime(
        {
            select: () => fakeQuery([grantedRow]),
            update: () => {
                throw new Error('snapshot down');
            },
        } as unknown as HausDatabase,
        effectRuntime,
        { clientFactory: async () => broken.client }
    );
    expect(
        (await brokenRuntime.listAgentTools('server-one', 'agent-one')).map((tool) => tool.name)
    ).toEqual(['mcp__connection-one__echo_ccfe8f4c']);
    await brokenRuntime.close();
});

test('a grant removed before the upstream call is denied and the tool is not called', async () => {
    let selects = 0;
    const { client, state } = makeClient('GitHub');
    const runtime = new McpRuntime(
        {
            select: () => {
                selects += 1;
                return fakeQuery(selects === 1 ? [grantedRow] : []);
            },
            update: fakeUpdate([]),
        } as unknown as HausDatabase,
        effectRuntime,
        { clientFactory: async () => client }
    );
    await expect(invoke(runtime, 'mcp__connection-one__echo_ccfe8f4c')).rejects.toMatchObject({
        code: 'MCP_DENIED',
        message:
            'This Agent has no access to the GitHub connection. Ask a Server Owner or Admin to grant this Agent access to GitHub.',
    });
    expect(state.callRequests).toHaveLength(0);
    await runtime.close();
});

function authorityDb(rows: unknown[], updates: unknown[] = []): HausDatabase {
    return {
        select: () => fakeQuery(rows),
        update: fakeUpdate(updates),
    } as unknown as HausDatabase;
}

function invoke(runtime: McpRuntime, toolName: string) {
    return runtime.invoke({
        agentId: 'agent-one',
        args: {},
        serverId: 'server-one',
        toolName,
    });
}
