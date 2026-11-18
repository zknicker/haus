import type { Client as MCPClient } from '@modelcontextprotocol/client';
import type { HausDatabase } from '../postgres/connection.ts';
import type { McpRuntime } from './runtime.ts';
import { modelToolName } from './tool-catalog.ts';

interface RequestOptions {
    signal?: AbortSignal;
    timeout?: number;
}
type ListRequest = { options?: RequestOptions; params?: { cursor?: string } } | undefined;
interface ClientPlan {
    call?: (request: { options?: RequestOptions }) => Promise<unknown>;
    list?: (request: ListRequest) => Promise<unknown>;
}

export function fakeQuery(rows: unknown[]) {
    const query = Promise.resolve(rows) as unknown as Record<string, () => unknown>;
    query.from = query.innerJoin = query.leftJoin = query.where = () => query;
    query.limit = () => Promise.resolve(rows);
    return query;
}

/** Records `.set(values)` payloads; `.where().returning()` resolves to `returned`. */
export function fakeUpdate(updates: unknown[], returned: unknown[] = []) {
    return () => ({
        set: (values: unknown) => {
            updates.push(values);
            return { where: () => ({ returning: async () => returned }) };
        },
    });
}

export function makeClient(name: string, plan: ClientPlan = {}) {
    const state = {
        callRequests: [] as { name?: string; options?: RequestOptions }[],
        closeCount: 0,
        listRequests: [] as ListRequest[],
    };
    const client = {
        callTool(params: { name?: string }, options?: RequestOptions) {
            const request = { ...params, options };
            state.callRequests.push(request);
            return (
                plan.call?.(request) ?? Promise.resolve({ content: [{ text: 'ok', type: 'text' }] })
            );
        },
        close: async () => {
            state.closeCount += 1;
        },
        getInstructions: () => 'Fixture instructions',
        listTools(params?: { cursor?: string }, options?: RequestOptions) {
            const request = { params, options };
            state.listRequests.push(request);
            return (
                plan.list?.(request) ??
                Promise.resolve({ tools: [{ description: 'Echo', inputSchema: {}, name: 'echo' }] })
            );
        },
        getServerVersion: () => ({ name, version: '1.0.0' }),
    } as unknown as MCPClient;
    return { client, state };
}

/** One granted (or ungranted) connected connection named Fixture. Invoke selects once. */
export function grantDb(connectionId: string, grant = true, updates: unknown[] = []): HausDatabase {
    return {
        select: () =>
            fakeQuery([
                {
                    connected: true,
                    grantedAgentId: grant ? 'agent-one' : null,
                    id: connectionId,
                    name: 'Fixture',
                },
            ]),
        update: fakeUpdate(updates),
    } as unknown as HausDatabase;
}

export const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function invoke(runtime: McpRuntime, connectionId: string, args: unknown = {}) {
    return runtime.invoke({
        agentId: 'agent-one',
        args,
        serverId: 'server-one',
        toolName: modelToolName(connectionId, 'echo'),
    });
}
