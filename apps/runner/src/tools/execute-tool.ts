import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    AGENT_DISPATCH_OUTCOME_UNKNOWN,
    type InvocationOperation,
    invocationOperationSchema,
} from '@haus/api';
import { executeMcpCode } from '@haus/mcp-executor';
import * as z from 'zod';
import type { RunDispatches } from '../dispatch/dispatch-id.ts';
import {
    type InvocationClient,
    invocationOutputText,
    invocationText,
} from '../invocations/invocation-client.ts';
import type { ToolOutcome } from '../run-context.ts';
import { type McpClient, McpToolError } from './mcp-client.ts';

const searchSchema = z.object({ query: z.string().max(200).default('') }).strict();
const describeSchema = z.object({ name: z.string().min(1).max(256) }).strict();
const callSchema = describeSchema.extend({ args: z.unknown() });
const browserArgsSchema = z.object({ args: z.unknown() }).strict();

const runnerEntrypoint = join(dirname(fileURLToPath(import.meta.url)), '..', 'index.ts');

export const browserTool = {
    description:
        'Use the Chrome browser selected in your machine’s Browser settings. Pass agent-browser command arguments, for example ["tab","new","https://example.com"], ["snapshot","-i"], ["click","@e1"]. Agents share signed-in accounts and tabs. Create your own tab and operate only on your own tabs; leave service and other agents’ tabs alone. Screenshots and PDFs are written on the machine; view them with your edit tool.',
    inputSchema: {
        additionalProperties: false,
        properties: {
            args: {
                items: { maxLength: 32_768, type: 'string' },
                maxItems: 100,
                minItems: 1,
                type: 'array',
            },
        },
        required: ['args'],
        type: 'object',
    },
    name: 'browser',
    title: 'Browser',
} as const;

export async function runExecute(input: {
    code: string;
    dispatches: RunDispatches;
    invocations: InvocationClient;
    mcp: McpClient;
    signal: AbortSignal;
    toolCallId: string;
}) {
    try {
        const value = await executeMcpCode({
            code: input.code,
            command: { args: [runnerEntrypoint, '__mcp-executor'], executable: process.execPath },
            invoke: async ({ path, args, signal }) => {
                try {
                    signal.throwIfAborted();
                    return await invokePath(path, args, signal, input);
                } catch (cause) {
                    signal.throwIfAborted();
                    return { error: errorOf(cause) };
                }
            },
            signal: input.signal,
        });
        return {
            content: [{ text: JSON.stringify(value ?? null), type: 'text' }],
            isError: false,
        } satisfies ToolOutcome;
    } catch (cause) {
        input.signal.throwIfAborted();
        return {
            content: [
                { text: cause instanceof Error ? cause.message : String(cause), type: 'text' },
            ],
            isError: true,
        } satisfies ToolOutcome;
    }
}

async function invokePath(
    path: string,
    args: unknown,
    signal: AbortSignal,
    input: {
        dispatches: RunDispatches;
        invocations: InvocationClient;
        mcp: McpClient;
        toolCallId: string;
    }
) {
    if (path === 'search') {
        const { query } = searchSchema.parse(args);
        return withBrowser(query, await input.mcp.search(query, signal));
    }
    if (path === 'describe') {
        const { name } = describeSchema.parse(args);
        const tool =
            name === browserTool.name ? browserTool : await input.mcp.describe(name, signal);
        return (
            tool ?? {
                error: {
                    code: 'MCP_DENIED',
                    message: 'That MCP tool is not currently available to this Agent.',
                },
            }
        );
    }
    if (path !== 'call') {
        return {
            error: {
                code: 'INVALID_TOOL',
                message: 'Use tools.search, tools.describe, or tools.call.',
            },
        };
    }
    const call = callSchema.parse(args);
    if (call.name === browserTool.name) {
        const operation = invocationOperationSchema.parse({
            ...browserArgsSchema.parse(call.args),
            kind: 'browser',
        });
        return await callBrowser(operation, signal, input);
    }
    const key = await input.dispatches.open(input.toolCallId, 'mcp-call');
    try {
        const result = await input.mcp.invoke(call.name, call.args, key, signal);
        await input.dispatches.finish(key, 'completed');
        return result;
    } catch (cause) {
        const answered =
            cause instanceof McpToolError && cause.code !== AGENT_DISPATCH_OUTCOME_UNKNOWN;
        await input.dispatches.finish(key, answered ? 'failed' : 'unknown');
        throw cause;
    }
}

async function callBrowser(
    operation: InvocationOperation,
    signal: AbortSignal,
    input: { invocations: InvocationClient; toolCallId: string }
) {
    const answer = await input.invocations.invoke(input.toolCallId, operation, { signal });
    if (answer.frame.outcome === 'completed') {
        return {
            exitCode: answer.frame.exitCode ?? 0,
            output: invocationOutputText(answer.frame.output),
        };
    }
    return {
        error: {
            code: `INVOCATION_${answer.frame.outcome.toUpperCase().replace('-', '_')}`,
            message: invocationText(answer),
        },
    };
}

function withBrowser(
    query: string,
    result: { tools: { description: string; name: string; title: string | null }[]; total: number }
) {
    const needle = query.trim().toLowerCase();
    const matches =
        needle.length === 0 ||
        `${browserTool.name} ${browserTool.description}`.toLowerCase().includes(needle);
    if (!matches) {
        return result;
    }
    const { description, name, title } = browserTool;
    return {
        tools: [{ description, name, title }, ...result.tools].slice(0, 50),
        total: result.total + 1,
    };
}

function errorOf(cause: unknown) {
    if (cause instanceof McpToolError && cause.code === AGENT_DISPATCH_OUTCOME_UNKNOWN) {
        return {
            code: cause.code,
            message:
                'This call may or may not have reached the tool. Check its effects before calling it again.',
        };
    }
    if (cause instanceof McpToolError) {
        return { code: cause.code, message: cause.message };
    }
    if (cause instanceof z.ZodError) {
        return {
            code: 'INVALID_ARGUMENTS',
            message: 'Arguments must match the documented tool schema.',
        };
    }
    return {
        code: 'MCP_UNAVAILABLE',
        message: 'The MCP request failed. Try a narrower request or check the connection.',
    };
}
