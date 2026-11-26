import { afterEach, describe, expect, test } from 'bun:test';
import { openDispatchLedger } from '../dispatch/ledger.ts';
import { drainCleanups, live, runCredential, startedRun } from '../runner-test-server.ts';

afterEach(drainCleanups);

describe('run tools', () => {
    test('a send whose dispatch outcome the Server lost is reported unknown and counted as output', async () => {
        const { run, runner } = await startedRun({
            '/api/agent/messages/send': () =>
                Response.json(
                    {
                        code: 'DISPATCH_OUTCOME_UNKNOWN',
                        message: 'The first attempt never finished.',
                    },
                    { status: 409 }
                ),
        });

        const sent = await run.tools.bash(
            'toolu_1',
            { command: "haus message send --target '#all' <<< 'ship it'" },
            live()
        );

        expect(sent).toEqual({
            content: [
                {
                    text: 'Error: This request may or may not have taken effect.\nCode: DISPATCH_OUTCOME_UNKNOWN\nNext action: Check its effects before running it again.\nExit code: 1',
                    type: 'text',
                },
            ],
            isError: true,
        });
        expect(await run.tools.settle()).toEqual({
            sendCount: 1,
            sends: [],
            servedAutomationIds: [],
            visibleMessages: [],
        });
        expect(
            await openDispatchLedger(runner.dataDir).read('agt_1', {
                runId: 'run_1',
                seq: 0,
                toolCallId: 'toolu_1',
            })
        ).toMatchObject({ kind: 'agent-api', outcome: 'unknown', state: 'finished' });
    });

    test('a haus flag naming a machine path reads it through a file-read invocation first', async () => {
        const { run, server } = await startedRun();

        const upload = run.tools.bash(
            'toolu_2',
            { command: 'haus attachment upload --path ./chart.png' },
            live()
        );

        expect(await server.frame('invocation-request')).toEqual({
            agentId: 'agt_1',
            operation: { kind: 'file-read', maxBytes: 268_435_456, path: './chart.png' },
            runId: 'run_1',
            seq: 0,
            sessionGeneration: 1,
            timeoutMs: 60_000,
            toolCallId: 'toolu_2',
            type: 'invocation-request',
        });
        server.answer({ outcome: 'offline', runId: 'run_1', seq: 0, toolCallId: 'toolu_2' });
        expect(await upload).toEqual({
            content: [
                {
                    text: 'The machine is offline. Nothing ran. `haus` and `execute` still work.',
                    type: 'text',
                },
            ],
            invocation: 'offline',
            isError: true,
        });
        expect(server.requests).toEqual([]);
    });

    test('execute searches with the browser built in, relays browser to the machine, and keys MCP calls', async () => {
        const { run, server } = await startedRun({
            '/api/agent/mcp/invoke': () =>
                Response.json({ result: { content: [], isError: false } }),
            '/api/agent/mcp/tools': () => Response.json({ tools: [], total: 0 }),
        });

        const executed = run.tools.execute(
            'toolu_3',
            {
                code: [
                    'const found = await tools.search({ query: "browser" });',
                    'const browsed = await tools.call({ name: "browser", args: { args: ["snapshot", "-i"] } });',
                    'const called = await tools.call({ name: "linear_search", args: { q: "bug" } });',
                    'return { browsed, called, found: found.tools.map((tool) => tool.name), total: found.total };',
                ].join('\n'),
            },
            live()
        );

        expect(await server.frame('invocation-request')).toEqual({
            agentId: 'agt_1',
            operation: { args: ['snapshot', '-i'], kind: 'browser' },
            runId: 'run_1',
            seq: 0,
            sessionGeneration: 1,
            timeoutMs: 60_000,
            toolCallId: 'toolu_3',
            type: 'invocation-request',
        });
        server.answer({ outcome: 'offline', runId: 'run_1', seq: 0, toolCallId: 'toolu_3' });
        const result = await executed;

        expect(
            JSON.parse(result.content[0]?.type === 'text' ? result.content[0].text : '')
        ).toEqual({
            logs: [],
            result: {
                browsed: {
                    error: {
                        code: 'INVOCATION_OFFLINE',
                        message:
                            'The machine is offline. Nothing ran. `haus` and `execute` still work.',
                    },
                },
                called: { content: [], isError: false },
                found: ['browser'],
                total: 1,
            },
        });
        expect(server.requests).toEqual([
            {
                authorization: `Bearer ${runCredential}`,
                body: null,
                dispatchId: null,
                method: 'GET',
                path: '/api/agent/mcp/tools?query=browser',
            },
            {
                authorization: `Bearer ${runCredential}`,
                body: { args: { q: 'bug' }, toolName: 'linear_search' },
                dispatchId: 'run_1:toolu_3:1',
                method: 'POST',
                path: '/api/agent/mcp/invoke',
            },
        ]);
    });

    test('execute finds and describes the desktop built in and relays a desktop call, returning a refusal as its error', async () => {
        const { run, server } = await startedRun({
            '/api/agent/mcp/tools': () => Response.json({ tools: [], total: 0 }),
        });
        const refusal =
            'Computer use is off on Studio. A person can turn on Computer use allowed in Settings → Devices → Studio.';

        const executed = run.tools.execute(
            'toolu_4',
            {
                code: [
                    'const found = await tools.search({ query: "agent-desktop" });',
                    'const described = await tools.describe({ name: "desktop" });',
                    'const clicked = await tools.call({ name: "desktop", args: { args: ["click", "@s1:e8"] } });',
                    'return { clicked, found: found.tools.map((tool) => tool.name), schema: described.inputSchema.required, title: described.title };',
                ].join('\n'),
            },
            live()
        );

        expect(await server.frame('invocation-request')).toEqual({
            agentId: 'agt_1',
            operation: { args: ['click', '@s1:e8'], kind: 'desktop' },
            runId: 'run_1',
            seq: 0,
            sessionGeneration: 1,
            timeoutMs: 60_000,
            toolCallId: 'toolu_4',
            type: 'invocation-request',
        });
        server.answer({
            outcome: 'failed',
            output: { kind: 'text', text: refusal },
            runId: 'run_1',
            seq: 0,
            toolCallId: 'toolu_4',
        });
        const result = await executed;

        expect(
            JSON.parse(result.content[0]?.type === 'text' ? result.content[0].text : '')
        ).toEqual({
            logs: [],
            result: {
                clicked: { error: { code: 'INVOCATION_FAILED', message: refusal } },
                found: ['desktop'],
                schema: ['args'],
                title: 'Desktop',
            },
        });
    });
});
