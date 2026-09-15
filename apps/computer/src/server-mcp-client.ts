import { randomUUID } from 'node:crypto';
import {
    agentMcpInvocationSchema,
    agentMcpResultSchema,
    agentMcpSearchSchema,
    agentMcpToolsSchema,
} from '@haus/api';
import * as z from 'zod';
import { readMcpResponseText } from './mcp-response.ts';

const errorSchema = z.object({
    code: z
        .enum(['MCP_AUTH_REQUIRED', 'MCP_DENIED', 'MCP_TIMEOUT', 'MCP_UNAVAILABLE'])
        .catch('MCP_UNAVAILABLE'),
    message: z.string().catch('Server MCP request failed.'),
});

export class ServerMcpToolError extends Error {
    constructor(
        readonly code: z.infer<typeof errorSchema>['code'],
        message: string,
        readonly status: number
    ) {
        super(message);
        this.name = 'ServerMcpToolError';
    }
}

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
            const response = await send();
            const payload = JSON.parse(await readMcpResponseText(response)) as unknown;
            if (!response.ok) {
                const error = errorSchema.parse(payload);
                throw new ServerMcpToolError(error.code, error.message, response.status);
            }
            return payload;
        } finally {
            signal.removeEventListener('abort', cancel);
            await cancellation;
        }
    };
    return {
        search: async (query: string, signal: AbortSignal) =>
            agentMcpSearchSchema.parse(
                await request(`tools?${new URLSearchParams({ query })}`, signal)
            ),
        describe: async (name: string, signal: AbortSignal) =>
            agentMcpToolsSchema
                .parse(await request(`tools?${new URLSearchParams({ name })}`, signal))
                .tools.find((tool) => tool.name === name),
        invoke: async (args: unknown, toolName: string, signal: AbortSignal) =>
            agentMcpResultSchema.parse(
                await request('invoke', signal, agentMcpInvocationSchema.parse({ args, toolName }))
            ).result,
    };
}
