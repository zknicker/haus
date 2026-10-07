import { expect, test } from 'bun:test';
import { makeTelemetryLayer, parseTraceCarrier } from '@haus/effect';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { ManagedRuntime } from 'effect';
import { parseStartCommand } from '../../computer/src/agent-command-frames.ts';
import { traceAgentTurn } from '../../computer/src/agent-turn-telemetry.ts';
import { startLoopbackProxy } from '../../computer/src/proxy.ts';
import { traceAgentDispatch } from '../src/agent-delivery/dispatch-telemetry.ts';
import { McpClientCache } from '../src/server-mcp/client-cache.ts';
import { makeClient } from '../src/server-mcp/runtime-test-fixtures.ts';
import { runMcpUpstream } from '../src/server-mcp/upstream-operation.ts';

test('dispatch → turn → loopback MCP keeps one trace without trusting Agent headers or leaking into the next turn', async () => {
    const exporter = new InMemorySpanExporter();
    const createRuntime = () =>
        ManagedRuntime.make(
            makeTelemetryLayer({
                serviceName: 'haus-test',
                spanProcessor: new SimpleSpanProcessor(exporter),
            })
        );
    const serverRuntime = createRuntime();
    const computerRuntime = createRuntime();
    const { client } = makeClient('Fixture');
    const clients = new McpClientCache(serverRuntime, async () => client);
    const received: Array<string | null> = [];
    const upstream = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        async fetch(request) {
            const traceparent = request.headers.get('traceparent');
            received.push(traceparent);
            const traceContext =
                traceparent && parseTraceCarrier({ traceparent }) ? { traceparent } : undefined;
            const result = await runMcpUpstream({
                clients,
                connectionId: 'fixture',
                operation: 'invocation',
                timeoutMs: 1000,
                traceContext,
                use: async () => 'done',
            });
            return Response.json({ result });
        },
    });
    const proxy = startLoopbackProxy({
        proxyToken: 'local-token',
        runnerToken: 'runner-token',
        serverOrigin: `http://127.0.0.1:${upstream.port}`,
    });
    const invoke = () =>
        fetch(`${proxy.url}/api/agent/mcp/invoke`, {
            method: 'POST',
            headers: {
                authorization: 'Bearer local-token',
                traceparent: `00-${'f'.repeat(32)}-${'f'.repeat(16)}-01`,
            },
        });
    try {
        const dispatched = await traceAgentDispatch(
            serverRuntime,
            { agentId: 'agt_test', serverId: 'srv_test' },
            async () => ({
                frame: {
                    agentId: 'agt_test',
                    chatId: 'cht_test',
                    modelId: 'model_test',
                    runId: 'run_test',
                    runtimeId: 'fake',
                    inbox: [],
                    inboxDelivery: 'notice' as const,
                    sessionGeneration: 1,
                    totalPending: 0,
                    type: 'start' as const,
                },
            })
        );
        const command = parseStartCommand(JSON.parse(JSON.stringify(dispatched?.frame)));
        if (!command) {
            throw new Error('Server dispatch did not survive Computer command parsing.');
        }
        await traceAgentTurn(computerRuntime, command, async (turnContext) => {
            proxy.setTraceContext(turnContext);
            expect(await (await invoke()).json()).toEqual({ result: 'done' });
            return { status: 'completed', messageCount: 0, outputProduced: false };
        });
        const spans = exporter.getFinishedSpans();
        const dispatch = spans.find((span) => span.name === 'haus.agent.dispatch');
        const turn = spans.find((span) => span.name === 'haus.agent.turn');
        const mcp = spans.find((span) => span.name === 'haus.mcp.operation');
        expect(dispatch).toBeDefined();
        expect(turn).toBeDefined();
        expect(mcp).toBeDefined();
        expect(turn?.spanContext().traceId).toBe(dispatch?.spanContext().traceId);
        expect(turn?.parentSpanContext?.spanId).toBe(dispatch?.spanContext().spanId);
        expect(mcp?.spanContext().traceId).toBe(turn?.spanContext().traceId);
        expect(mcp?.parentSpanContext?.spanId).toBe(turn?.spanContext().spanId);
        proxy.clearRunnerToken();
        expect((await invoke()).status).toBe(409);
        proxy.setRunnerToken('next-runner');
        await invoke();
        expect(received).toHaveLength(2);
        expect(received[1]).toBeNull();
    } finally {
        proxy.close();
        upstream.stop(true);
        await clients.closeAll(1000);
        await Promise.all([serverRuntime.dispose(), computerRuntime.dispose()]);
    }
});
