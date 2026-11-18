import { expect, test } from 'bun:test';
import type { HausDatabase } from '../postgres/connection.ts';
import { authorizeToolConnection, decideToolAccess, toolNotOffered } from './agent-access.ts';
import { McpDeniedError } from './errors.ts';
import { fakeQuery } from './runtime-test-fixtures.ts';

const github = {
    connected: true,
    granted: true,
    id: 'mcp_GitHubConnectn01',
    name: 'GitHub',
};
const skool = {
    connected: true,
    granted: false,
    id: 'mcp_SkoolConnectio01',
    name: 'Skool',
};
const other = {
    connected: false,
    granted: false,
    id: 'mcp_OtherConnectio01',
    name: 'Other',
};
const rows = [github, skool, other];
const scope = { agentId: 'agent-one', serverId: 'server-one' };

test('decideToolAccess follows the connection grant and ignores any stored tool list', () => {
    expect(
        decideToolAccess(rows, 'mcp__mcp_GitHubConnectn01__actions_run_trigger_5cbb3762')
    ).toEqual({
        kind: 'granted',
        connection: { id: 'mcp_GitHubConnectn01', name: 'GitHub' },
    });
    expect(decideToolAccess(rows, 'mcp__mcp_SkoolConnectio01__skool_get_lesson_fd5fb198')).toEqual({
        kind: 'ungranted',
        connection: { id: 'mcp_SkoolConnectio01', name: 'Skool' },
    });
    expect(decideToolAccess(rows, 'mcp__mcp_OtherConnectio01__echo_71c3512e')).toEqual({
        kind: 'disconnected',
        connection: { id: 'mcp_OtherConnectio01', name: 'Other' },
    });
    expect(
        decideToolAccess(
            [{ ...github, connected: false }],
            'mcp__mcp_GitHubConnectn01__actions_list_9858e5b5'
        )
    ).toEqual({
        kind: 'disconnected',
        connection: { id: 'mcp_GitHubConnectn01', name: 'GitHub' },
    });
    expect(decideToolAccess(rows, 'mcp__mcp_notgranted0000__missing_a8252634')).toEqual({
        kind: 'unknown',
    });
    expect(decideToolAccess([github], 'get_me')).toEqual({ kind: 'unknown' });
});

test('toolNotOffered names the connection and points the Agent at search', () => {
    const error = toolNotOffered(
        { id: 'mcp_GitHubConnectn01', name: 'GitHub' },
        'mcp__mcp_GitHubConnectn01__actions_get_dcb43ea9'
    );
    expect(error).toBeInstanceOf(McpDeniedError);
    expect(error).toMatchObject({
        code: 'MCP_DENIED',
        message:
            'The GitHub connection does not offer mcp__mcp_GitHubConnectn01__actions_get_dcb43ea9. Run tools.search to find its current tools.',
    });
});

test('authorizeToolConnection names who can grant access and ignores a stored tool list', async () => {
    await expect(
        authorizeToolConnection(
            accessDb([
                {
                    connected: true,
                    grantedAgentId: null,
                    id: 'mcp_SkoolConnectio01',
                    name: 'Skool',
                },
            ]),
            scope,
            'mcp__mcp_SkoolConnectio01__skool_get_lesson_fd5fb198'
        )
    ).rejects.toMatchObject({
        code: 'MCP_DENIED',
        message:
            'This Agent has no access to the Skool connection. Ask a Server Owner or Admin to grant this Agent access to Skool.',
    });
    await expect(
        authorizeToolConnection(
            accessDb([
                {
                    connected: false,
                    grantedAgentId: null,
                    id: 'mcp_OtherConnectio01',
                    name: 'Other',
                },
            ]),
            scope,
            'mcp__mcp_OtherConnectio01__echo_71c3512e'
        )
    ).rejects.toMatchObject({
        code: 'MCP_DENIED',
        message:
            'The Other connection is disconnected. Ask a Server Owner or Admin to reconnect Other and grant this Agent access to it.',
    });
    await expect(
        authorizeToolConnection(accessDb([]), scope, 'mcp__mcp_notgranted0000__missing_a8252634')
    ).rejects.toMatchObject({
        code: 'MCP_DENIED',
        message:
            'No connection on this Haus Server offers mcp__mcp_notgranted0000__missing_a8252634. Run tools.search to find the tools this Agent can use.',
    });
    await expect(
        authorizeToolConnection(
            accessDb([
                {
                    connected: true,
                    grantedAgentId: 'agent-one',
                    id: 'mcp_GitHubConnectn01',
                    name: 'GitHub',
                    tools: [],
                },
            ]),
            scope,
            'mcp__mcp_GitHubConnectn01__actions_run_trigger_5cbb3762'
        )
    ).resolves.toEqual({ id: 'mcp_GitHubConnectn01', name: 'GitHub' });
});

function accessDb(rows: unknown[]): HausDatabase {
    return { select: () => fakeQuery(rows) } as unknown as HausDatabase;
}
