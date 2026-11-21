import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RunnerUpFrame } from '@haus/api';
import { makeTelemetryLayer, parseTraceCarrier } from '@haus/effect';
import {
    InMemorySpanExporter,
    type ReadableSpan,
    SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { ManagedRuntime } from 'effect';
import { createRunDispatches } from '../../runner/src/dispatch/dispatch-id.ts';
import { openDispatchLedger } from '../../runner/src/dispatch/ledger.ts';
import { startHausProxy } from '../../runner/src/haus/haus-proxy.ts';
import { cleanups, drainCleanups, runCredential } from '../../runner/src/runner-test-server.ts';
import { mcpSearchCode, mcpSearchingRunner } from '../../runner/src/turn/mcp-turn.test-support.ts';
import { traceAgentDispatch } from '../src/agent-delivery/dispatch-telemetry.ts';
import { relayRunnerTurnSpan } from '../src/runner/turn-span-relay.ts';
import { McpClientCache } from '../src/server-mcp/client-cache.ts';
import { makeClient } from '../src/server-mcp/runtime-test-fixtures.ts';
import { runMcpUpstream } from '../src/server-mcp/upstream-operation.ts';

afterEach(drainCleanups);

test('dispatch → runner turn → Server MCP keeps one trace without trusting Agent headers or leaking into the next turn', async () => {
    const exporter = new InMemorySpanExporter();
    const serverRuntime = ManagedRuntime.make(
        makeTelemetryLayer({
            serviceName: 'haus-test',
            spanProcessor: new SimpleSpanProcessor(exporter),
        })
    );
    const { client } = makeClient('Fixture');
    const clients = new McpClientCache(serverRuntime, async () => client);
    cleanups.push(async () => {
        await clients.closeAll(1000);
        await serverRuntime.dispose();
    });
    const received: Array<string | null> = [];
    const runner = await mcpSearchingRunner(
        {
            '/api/agent/mcp/tools': async (_body, _url, request) => {
                const traceparent = request.headers.get('traceparent');
                received.push(traceparent);
                await runMcpUpstream({
                    clients,
                    connectionId: 'fixture',
                    operation: 'discovery',
                    timeoutMs: 1000,
                    traceContext:
                        traceparent && parseTraceCarrier({ traceparent })
                            ? { traceparent }
                            : undefined,
                    use: async () => 'done',
                });
                return Response.json({ tools: [], total: 0 });
            },
        },
        2
    );
    const relay = async () => {
        const frame = await runner.server.frame('runner-turn-span');
        await relayRunnerTurnSpan(serverRuntime, turnSpan(frame));
        return frame;
    };

    const dispatched = await traceAgentDispatch(
        serverRuntime,
        { agentId: 'agt_1', serverId: 'srv_1' },
        async () => ({ frame: runnerStart('run_1') })
    );
    runner.server.send(JSON.parse(JSON.stringify(dispatched?.frame)));
    expect(await runner.server.frame('turn')).toMatchObject({
        runId: 'run_1',
        status: 'completed',
    });
    const firstFrame = await relay();

    runner.server.start({ modelConnectionId: 'mc_xai', modelId: 'grok-faux', runId: 'run_2' });
    expect(await runner.server.frame('turn')).toMatchObject({
        runId: 'run_2',
        status: 'completed',
    });
    await relay();

    const spans = exporter.getFinishedSpans();
    const dispatch = only(spans, (span) => span.name === 'haus.agent.dispatch');
    const first = only(spans, (span) => span.attributes['haus.run.id'] === 'run_1');
    const second = only(spans, (span) => span.attributes['haus.run.id'] === 'run_2');
    const mcp = spans.filter((span) => span.name === 'haus.mcp.operation');
    expect(mcp).toHaveLength(2);
    const [firstMcp, secondMcp] = mcp;
    expect(first.name).toBe('haus.agent.turn');
    expect(first.spanContext().traceId).toBe(dispatch.spanContext().traceId);
    expect(first.parentSpanContext?.spanId).toBe(dispatch.spanContext().spanId);
    expect(firstMcp?.spanContext().traceId).toBe(first.spanContext().traceId);
    expect(firstMcp?.parentSpanContext?.spanId).toBe(first.spanContext().spanId);
    expect(first.attributes).toEqual({
        'haus.agent.id': 'agt_1',
        'haus.chat.id': 'chat_1',
        'haus.message.count': 0,
        'haus.model.id': 'grok-faux',
        'haus.operation': 'agent.turn',
        'haus.outcome': 'completed',
        'haus.output.produced': false,
        'haus.run.id': 'run_1',
        'haus.runtime.id': 'claude-agent-sdk',
        ...tokenAttributes(firstFrame),
    });
    expect(first.resource.attributes['service.name']).toBe('haus-runner');

    expect(second.parentSpanContext).toBeUndefined();
    expect(second.spanContext().traceId).not.toBe(dispatch.spanContext().traceId);
    expect(secondMcp?.parentSpanContext?.spanId).toBe(second.spanContext().spanId);
    expect(received).toEqual([traceparentOf(first), traceparentOf(second)]);
    const exported = JSON.stringify(
        spans.map((span) => ({ attributes: span.attributes, events: span.events }))
    );
    for (const secret of [
        runCredential,
        mcpSearchCode,
        'private-search-query',
        'private-model-reply',
    ]) {
        expect(exported).not.toContain(secret);
    }

    const agentSupplied = await agentProxiedSearch(runner.server.url);
    expect(agentSupplied.status).toBe(200);
    expect(received.at(-1)).toBeNull();
});

function runnerStart(runId: string) {
    return {
        modelConnectionId: 'mc_xai',
        runCredential,
        serverId: 'srv_1',
        sessionResetKind: 'session' as const,
        start: {
            agentId: 'agt_1',
            agentName: 'blippy',
            chatId: 'chat_1',
            drainItemIds: [],
            inboxDelivery: 'notice' as const,
            modelId: 'grok-faux',
            runId,
            runtimeId: 'claude-agent-sdk',
            sessionGeneration: 1,
            totalPending: 0,
            type: 'start' as const,
            warmDrainItemIds: [],
        },
        type: 'runner-start' as const,
    };
}

async function agentProxiedSearch(serverUrl: string) {
    const dataDir = await mkdtemp(join(tmpdir(), 'haus-turn-trace-'));
    cleanups.push(() => rm(dataDir, { force: true, recursive: true }));
    const proxy = startHausProxy({
        authority: { agentId: 'agt_1', runCredential, runId: 'run_3', serverUrl },
        dispatches: createRunDispatches({
            agentId: 'agt_1',
            ledger: openDispatchLedger(dataDir),
            runId: 'run_3',
        }),
    });
    cleanups.push(() => proxy.close());
    const call = proxy.openCall('toolu_agent');
    return await fetch(`${proxy.url}/api/agent/mcp/tools?query=agent`, {
        headers: {
            authorization: `Bearer ${call.token}`,
            traceparent: `00-${'f'.repeat(32)}-${'f'.repeat(16)}-01`,
        },
    });
}

function only(spans: readonly ReadableSpan[], matches: (span: ReadableSpan) => boolean) {
    const found = spans.filter(matches);
    if (found.length !== 1 || !found[0]) {
        throw new Error(`Expected exactly one matching span, found ${found.length}.`);
    }
    return found[0];
}

function traceparentOf(span: ReadableSpan) {
    const { spanId, traceId } = span.spanContext();
    return `00-${traceId}-${spanId}-01`;
}

function turnSpan(frame: RunnerUpFrame) {
    if (frame.type !== 'runner-turn-span') {
        throw new Error(`Expected a runner turn span, got ${frame.type}.`);
    }
    return frame;
}

function tokenAttributes(frame: RunnerUpFrame) {
    const usage = turnSpan(frame).tokenUsage;
    return usage
        ? {
              'haus.tokens.cache_read': usage.cacheReadTokens,
              'haus.tokens.cache_write': usage.cacheWriteTokens,
              'haus.tokens.input': usage.inputTokens,
              'haus.tokens.output': usage.outputTokens,
          }
        : {};
}
