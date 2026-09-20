import type { ToolSet } from '@ai-sdk/provider-utils';
import { executeMcpCode } from '@haus/mcp-executor';
import * as z from 'zod';
import { computerEntrypoint } from './build-identity.ts';
import { createServerMcpClient, ServerMcpToolError } from './server-mcp-client.ts';

const searchSchema = z.object({ query: z.string().max(200).default('') }).strict();
const describeSchema = z.object({ name: z.string().min(1).max(256) }).strict();
const callSchema = describeSchema.extend({ args: z.unknown() });
const codeSchema = z
    .object({
        code: z
            .string()
            .min(1)
            .max(64 * 1024),
    })
    .strict();

/** The harness catalog stays fixed. Every discovery/call observes Server's current grants. */
export function createServerMcpTools(input: { proxyToken: string; proxyUrl: string }): ToolSet {
    const client = createServerMcpClient(input);
    const entrypoint = computerEntrypoint();
    return {
        execute: {
            description:
                'Run JavaScript in an isolated sandbox to discover and call your authorized Server MCP tools. All tools calls are asynchronous: await every call. Discover with await tools.search({query:"keywords"}); inspect inputSchema with await tools.describe({name:"exact discovered name"}); invoke with await tools.call({name:"exact discovered name",args:{...}}). Return your result. Grants can change: search again when access changes. Errors have an error object with code and message. Search returns {tools:[{name,title,description}],total} with at most 50 tools; narrow query when total is larger. Describe returns {name,title,description,inputSchema}. Call returns the MCP tool result {content,structuredContent?,isError?}; read structuredContent when it is present, because its duplicate text copy is dropped. No network, filesystem, credentials, or persistent state inside the sandbox. Execution is bounded to 60 seconds, 50 calls, 64 KiB code and 1 MiB per result. Example: return await tools.search({query:"calendar"});',
            inputSchema: codeSchema,
            execute: async (inputCode, options) => {
                const { code } = codeSchema.parse(inputCode);
                return await executeMcpCode({
                    code,
                    command: { ...entrypoint, args: [...entrypoint.args, '__mcp-executor'] },
                    signal: options.abortSignal,
                    invoke: async ({ path, args, signal }) => {
                        try {
                            signal.throwIfAborted();
                            if (path === 'call') {
                                const call = callSchema.parse(args);
                                return await client.invoke(call.args, call.name, signal);
                            }
                            if (path === 'search') {
                                const { query } = searchSchema.parse(args);
                                return await client.search(query, signal);
                            }
                            if (path === 'describe') {
                                const { name } = describeSchema.parse(args);
                                const tool = await client.describe(name, signal);
                                return (
                                    tool ?? {
                                        error: {
                                            code: 'MCP_DENIED',
                                            message:
                                                'That MCP tool is not currently available to this Agent.',
                                        },
                                    }
                                );
                            }
                            return {
                                error: {
                                    code: 'INVALID_TOOL',
                                    message: 'Use tools.search, tools.describe, or tools.call.',
                                },
                            };
                        } catch (cause) {
                            signal.throwIfAborted();
                            return mcpFailure(cause);
                        }
                    },
                });
            },
        },
    };
}

function mcpFailure(cause: unknown) {
    if (cause instanceof ServerMcpToolError) {
        return { error: { code: cause.code, message: cause.message } };
    }
    if (cause instanceof z.ZodError) {
        return {
            error: {
                code: 'INVALID_ARGUMENTS',
                message: 'Arguments must match the documented tool schema.',
            },
        };
    }
    return {
        error: {
            code: 'MCP_UNAVAILABLE',
            message: 'The MCP request failed. Try a narrower request or check the connection.',
        },
    };
}
