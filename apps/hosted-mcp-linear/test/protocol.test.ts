import { describe, expect, test } from 'bun:test';
import {
    linearClientEntityId,
    linearToolNames,
    linearToolPolicies,
    uuidV5,
} from '@haus/api/linear-actor-meta';
import { createLinearMcpHandler } from '../src/mcp-http.ts';
import { accessToken, callTool, data, fakeLinear, rpc } from './fake-linear.ts';

describe('MCP surface', () => {
    test('health answers without Linear', async () => {
        const response = await createLinearMcpHandler()(new Request('http://localhost/healthz'));
        expect(await response.json()).toEqual({ status: 'ok' });
    });

    test('initialize echoes a supported protocol version and offers tools only', async () => {
        const response = await rpc(fakeLinear({}), 'initialize', {
            capabilities: {},
            clientInfo: { name: 'test', version: '1' },
            protocolVersion: '2025-06-18',
        });
        const body = (await response.json()) as { result: Record<string, unknown> };
        expect(body.result).toMatchObject({
            capabilities: { tools: { listChanged: false } },
            protocolVersion: '2025-06-18',
            serverInfo: { name: 'haus-linear' },
        });
    });

    test('notifications are accepted without a body', async () => {
        const response = await rpc(fakeLinear({}), 'notifications/initialized', {}, null);
        expect(response.status).toBe(202);
    });

    test('tools/list carries every contract tool with a JSON Schema and read hints', async () => {
        const response = await rpc(fakeLinear({}), 'tools/list');
        const body = (await response.json()) as {
            result: {
                tools: {
                    annotations: { readOnlyHint: boolean };
                    inputSchema: { type: string };
                    name: string;
                }[];
            };
        };
        const tools = body.result.tools;
        expect(tools.map((tool) => tool.name)).toEqual([...linearToolNames]);
        for (const tool of tools) {
            expect(tool.inputSchema.type).toBe('object');
            const policy = linearToolPolicies[tool.name as keyof typeof linearToolPolicies];
            expect(tool.annotations.readOnlyHint).toBe(
                policy.kind === 'read' || policy.kind === 'self'
            );
        }
    });

    test('a call without actor metadata is refused without contacting Linear', async () => {
        const linear = fakeLinear({});
        const response = await rpc(linear, 'tools/call', { arguments: {}, name: 'list_teams' });
        const body = (await response.json()) as { error: { code: number; message: string } };
        expect(body.error.code).toBe(-32_602);
        expect(linear.requests).toHaveLength(0);
    });

    test('invalid metadata is refused without echoing the token', async () => {
        const response = await rpc(fakeLinear({}), 'tools/call', {
            _meta: { 'chat.haus/linear': { accessToken, deadlineMs: 'soon' } },
            arguments: {},
            name: 'list_teams',
        });
        expect(await response.text()).not.toContain(accessToken);
    });

    test('the token rides only the Linear Authorization header, never the result', async () => {
        const linear = fakeLinear({
            Teams: () =>
                data({ teams: { nodes: [], pageInfo: { endCursor: null, hasNextPage: false } } }),
        });
        const { raw } = await callTool(linear, 'list_teams', {});
        expect(linear.requests[0]?.authorization).toBe(`Bearer ${accessToken}`);
        expect(raw).not.toContain(accessToken);
    });

    test('invalid arguments are a linear_input_error', async () => {
        const { result } = await callTool(fakeLinear({}), 'get_issue', {});
        expect(result.isError).toBe(true);
        expect(result.content[0]?.text).toStartWith('linear_input_error: Invalid arguments');
    });
});

describe('client ids', () => {
    test('UUIDv5 matches the RFC 4122 reference vector', () => {
        expect(uuidV5('www.example.com', '6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(
            '2ed6657d-e927-568b-95e1-2665a8aea6a2'
        );
    });

    test('one seed always derives the same, distinct op ids', () => {
        const seed = '3f0a3d6e-5d0c-5b5e-8f43-0b1b6f1c2a90';
        expect(linearClientEntityId(seed, 0)).toBe(linearClientEntityId(seed, 0));
        expect(linearClientEntityId(seed, 0)).not.toBe(linearClientEntityId(seed, 1));
    });

    test('op ids are UUID version 4, the only version Linear accepts as an id', () => {
        const seed = '3f0a3d6e-5d0c-5b5e-8f43-0b1b6f1c2a90';
        for (const opIndex of [0, 1, 31]) {
            expect(linearClientEntityId(seed, opIndex)).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
            );
        }
    });
});
