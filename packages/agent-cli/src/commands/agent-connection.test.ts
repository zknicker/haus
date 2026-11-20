import { expect, test } from 'bun:test';
import { commandGroups } from '../../agent-cli.ts';
import type { AgentApiRequest, AgentApiRequester } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { runConnectionGrant, runConnectionList } from './agent-connection.ts';

const linear = `mcp_${'l'.repeat(16)}`;
const wren = `agt_${'w'.repeat(16)}`;

function args(values: Record<string, string>): ParsedArgs {
    return { flags: {}, help: false, positionals: [], valueLists: {}, values };
}

function requester(seen: { input: AgentApiRequest; route: string }[], response: unknown) {
    return {
        request(route, schema, input) {
            seen.push({ input: input ?? {}, route });
            return Promise.resolve(schema.parse(response));
        },
    } satisfies AgentApiRequester;
}

test('the connection family lists, grants, and revokes', () => {
    expect(commandGroups.connection.map((sub) => sub.name)).toEqual(['list', 'grant', 'revoke']);
});

test('connection list shows each connection, its state, and who can use it', async () => {
    const output: string[] = [];
    await runConnectionList({
        client: requester([], {
            connections: [
                {
                    agents: [{ displayName: 'Wren', handle: 'wren', id: wren }],
                    connected: true,
                    id: linear,
                    // A key a newer Server adds never breaks an older Computer.
                    lastUsedAt: '2026-11-14T00:00:00.000Z',
                    name: 'Linear',
                },
                { agents: [], connected: false, id: `mcp_${'n'.repeat(16)}`, name: 'Notion' },
            ],
        }),
        write: (text) => output.push(text),
    });
    expect(output.join('')).toBe(
        `Linear (${linear}) · connected · @wren\nNotion (mcp_${'n'.repeat(16)}) · not connected · no Agents\n`
    );
});

test('connection grant posts the named Agent and connection and confirms the change', async () => {
    const seen: { input: AgentApiRequest; route: string }[] = [];
    const output: string[] = [];
    await runConnectionGrant(args({ '--agent': ' @wren ', '--connection': 'Linear' }), true, {
        client: requester(seen, {
            agent: { displayName: 'Wren', handle: 'wren', id: wren },
            changed: true,
            connection: { id: linear, name: 'Linear' },
            enabled: true,
        }),
        write: (text) => output.push(text),
    });
    expect(seen).toEqual([
        {
            input: { body: { agent: '@wren', connection: 'Linear' }, method: 'POST' },
            route: '/api/agent/connections/grant',
        },
    ]);
    expect(output.join('')).toBe('@wren can now use Linear.\n');
});

test('a repeated revoke says nothing changed', async () => {
    const seen: { input: AgentApiRequest; route: string }[] = [];
    const output: string[] = [];
    await runConnectionGrant(args({ '--agent': 'Wren', '--connection': linear }), false, {
        client: requester(seen, {
            agent: { displayName: 'Wren', handle: 'wren', id: wren },
            changed: false,
            connection: { id: linear, name: 'Linear' },
            enabled: false,
        }),
        write: (text) => output.push(text),
    });
    expect(seen[0]?.route).toBe('/api/agent/connections/revoke');
    expect(output.join('')).toBe('@wren already had no access to Linear. Nothing changed.\n');
});

test('grant needs both an Agent and a connection', async () => {
    const run = runConnectionGrant(args({ '--agent': '@wren' }), true, {
        client: requester([], {}),
        write: () => undefined,
    });
    await expect(run).rejects.toBeInstanceOf(AgentCliError);
    await expect(run).rejects.toThrow(/--agent and --connection/u);
});
