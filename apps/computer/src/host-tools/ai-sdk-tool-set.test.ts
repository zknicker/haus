import { expect, test } from 'bun:test';
import { asSchema } from '@ai-sdk/provider-utils';
import * as z from 'zod';
import { createComputerTools } from '../computer-tools.ts';
import { toAiSdkToolSet } from './ai-sdk-tool-set.ts';
import { defineHostTool, hostToolJsonSchema } from './host-tool.ts';

const echo = defineHostTool({
    description: 'Echo',
    execute: async ({ value }, options) =>
        value === 'json'
            ? { type: 'json', value: { echoed: value, toolCallId: options.toolCallId } }
            : { type: 'text', text: value },
    inputSchema: z.object({ value: z.string().default('fallback') }).strict(),
    name: 'echo',
});
const callOptions = { context: undefined, messages: [], toolCallId: 'call-1' };

test('AI SDK tools keep names, descriptions, schemas, and raw outputs', async () => {
    const set = toAiSdkToolSet([echo]);
    expect(Object.keys(set)).toEqual(['echo']);
    expect(set.echo?.description).toBe('Echo');
    expect(set.echo?.inputSchema).toBe(echo.inputSchema);
    expect(await set.echo?.execute?.({ value: 'hi' }, callOptions)).toBe('hi');
    expect(await set.echo?.execute?.({}, callOptions)).toBe('fallback');
    expect(await set.echo?.execute?.({ value: 'json' }, callOptions)).toEqual({
        echoed: 'json',
        toolCallId: 'call-1',
    });
    await expect(
        Promise.resolve(set.echo?.execute?.({ value: 1 }, callOptions))
    ).rejects.toBeInstanceOf(z.ZodError);
});

test('duplicate host tool names are rejected', () => {
    expect(() => toAiSdkToolSet([echo, echo])).toThrow('Duplicate host tool name: echo');
});

test('advertised MCP schemas match what the AI SDK sent for every Computer tool', async () => {
    const tools = createComputerTools({
        command: { agentId: 'agent' },
        host: { proxy: { url: 'http://127.0.0.1:1' }, proxyToken: 'token' },
        options: { attachment: { serverId: 'server' }, dataRoot: '/tmp/none' },
    });
    expect(tools.map((tool) => tool.name)).toEqual(['execute', 'browser']);
    for (const tool of tools) {
        expect(hostToolJsonSchema(tool)).toEqual(
            (await asSchema(tool.inputSchema).jsonSchema) as Record<string, unknown>
        );
    }
});
