import { afterAll, expect, test } from 'bun:test';
import type { HausDatabase } from '../postgres/connection.ts';
import { makeServerRuntime } from '../server-runtime.ts';
import { McpDeniedError } from './errors.ts';
import { McpRuntime } from './runtime.ts';
import { makeClient } from './runtime-test-fixtures.ts';
import { modelToolName } from './tool-catalog.ts';

const effectRuntime = makeServerRuntime();

afterAll(async () => {
    await effectRuntime.dispose();
});

test('a tool the upstream server starts serving after discovery is listed and callable', async () => {
    const db = snapshotDb('github', ['echo']);
    const { client, state } = makeClient('GitHub', {
        list: async () => ({
            tools: [
                { description: 'Echo', inputSchema: {}, name: 'echo' },
                { description: 'Run a workflow', inputSchema: {}, name: 'run_workflow' },
            ],
        }),
    });
    const runtime = new McpRuntime(db.db, effectRuntime, { clientFactory: async () => client });

    const listed = await runtime.listAgentTools('server-one', 'agent-one');
    const runWorkflow = modelToolName('github', 'run_workflow');
    expect(listed.map((tool) => tool.name)).toContain(runWorkflow);
    await expect(callTool(runtime, runWorkflow)).resolves.toBeDefined();
    expect(db.snapshot()).toEqual(['echo', 'run_workflow']);
    expect(state.callRequests).toHaveLength(1);
    await runtime.close();
});

test('a tool the upstream server stops serving is rejected after the next listing', async () => {
    const db = snapshotDb('github', ['echo', 'retired']);
    const { client, state } = makeClient('GitHub');
    const runtime = new McpRuntime(db.db, effectRuntime, { clientFactory: async () => client });

    await runtime.listAgentTools('server-one', 'agent-one');
    const rejection = await callTool(runtime, modelToolName('github', 'retired')).catch(
        (cause) => cause
    );
    expect(rejection).toBeInstanceOf(McpDeniedError);
    expect(db.snapshot()).toEqual(['echo']);
    expect(state.callRequests).toHaveLength(0);
    await runtime.close();
});

test('a listing that matches the snapshot writes nothing', async () => {
    const db = snapshotDb('github', ['echo']);
    const runtime = new McpRuntime(db.db, effectRuntime, {
        clientFactory: async () => makeClient('GitHub').client,
    });
    await runtime.listAgentTools('server-one', 'agent-one');
    expect(db.writes()).toBe(0);
    await runtime.close();
});

function callTool(runtime: McpRuntime, toolName: string) {
    return runtime.invoke({ agentId: 'agent-one', args: {}, serverId: 'server-one', toolName });
}

/** One granted, connected connection whose stored tool snapshot updates in place. */
function snapshotDb(connectionId: string, initialTools: string[]) {
    let tools = [...initialTools];
    let writes = 0;
    const db = {
        select() {
            let joined = false;
            const query = {
                from: () => query,
                innerJoin: () => {
                    joined = true;
                    return query;
                },
                limit: () => Promise.resolve([{ connectionId }]),
                // biome-ignore lint/suspicious/noThenProperty: drizzle queries are awaited directly.
                then: (
                    resolve: (rows: unknown[]) => unknown,
                    reject: (cause: unknown) => unknown
                ) =>
                    Promise.resolve(
                        joined ? [{ id: connectionId, name: 'GitHub', tools: [...tools] }] : []
                    ).then(resolve, reject),
                where: () => query,
            };
            return query;
        },
        update() {
            return {
                set(values: { tools: string[] }) {
                    return {
                        where: async () => {
                            writes += 1;
                            tools = [...values.tools];
                        },
                    };
                },
            };
        },
    } as unknown as HausDatabase;
    return { db, snapshot: () => tools, writes: () => writes };
}
