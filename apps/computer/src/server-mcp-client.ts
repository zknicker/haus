import { randomUUID } from 'node:crypto';
import {
    agentMcpInvocationSchema,
    agentMcpResultSchema,
    agentMcpSearchSchema,
    agentMcpToolsSchema,
} from '@haus/api';
import { parseServerMcpResult, readServerMcpPayload } from './server-mcp-response.ts';

export function createServerMcpClient(input: { proxyToken: string; proxyUrl: string }) {
    const request = async (path: string, signal: AbortSignal, body?: unknown) => {
        const requestId = randomUUID();
        let cancellation: Promise<void> | undefined;
        const cancel = () => {
            cancellation ??= fetch(`${input.proxyUrl}/api/agent/mcp/cancel`, {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${input.proxyToken}`,
                    'content-type': 'application/json',
                },
                body: JSON.stringify({ requestId }),
                signal: AbortSignal.timeout(2000),
            })
                .then(async (response) => {
                    await response.body?.cancel();
                })
                .catch(() => undefined);
        };
        signal.addEventListener('abort', cancel, { once: true });
        const send = async () => {
            return await fetch(`${input.proxyUrl}/api/agent/mcp/${path}`, {
                headers: {
                    authorization: `Bearer ${input.proxyToken}`,
                    'x-haus-mcp-request-id': requestId,
                    ...(body ? { 'content-type': 'application/json' } : {}),
                },
                method: body ? 'POST' : 'GET',
                ...(body ? { body: JSON.stringify(body) } : {}),
                signal,
            });
        };
        try {
            signal.throwIfAborted();
            return await readServerMcpPayload(await send(), signal);
        } finally {
            signal.removeEventListener('abort', cancel);
            await cancellation;
        }
    };
    return {
        search: async (query: string, signal: AbortSignal) =>
            parseServerMcpResult(
                agentMcpSearchSchema,
                await request(`tools?${new URLSearchParams({ query })}`, signal)
            ),
        describe: async (name: string, signal: AbortSignal) =>
            parseServerMcpResult(
                agentMcpToolsSchema,
                await request(`tools?${new URLSearchParams({ name })}`, signal)
            ).tools.find((tool) => tool.name === name),
        invoke: async (args: unknown, toolName: string, signal: AbortSignal) =>
            parseServerMcpResult(
                agentMcpResultSchema,
                await request('invoke', signal, agentMcpInvocationSchema.parse({ args, toolName }))
            ).result,
    };
}
