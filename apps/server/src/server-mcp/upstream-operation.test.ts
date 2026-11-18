import { expect, test } from 'bun:test';
import { makeTelemetryLayer } from '@haus/effect';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { ManagedRuntime } from 'effect';
import { McpClientCache } from './client-cache.ts';
import { McpUpstreamError } from './errors.ts';
import { makeClient } from './runtime-test-fixtures.ts';
import { runMcpUpstream } from './upstream-operation.ts';

for (const telemetry of [false, true]) {
    test(`MCP execution preserves failure identity and aborts timed-out work with telemetry ${telemetry}`, async () => {
        const exporter = new InMemorySpanExporter();
        const runtime = ManagedRuntime.make(
            makeTelemetryLayer({
                serviceName: 'haus-test',
                spanProcessor: telemetry ? new SimpleSpanProcessor(exporter) : undefined,
            })
        );
        const { client } = makeClient('Fixture');
        const clients = new McpClientCache(runtime, async () => client);
        const failure = new McpUpstreamError('MCP_AUTH_REQUIRED', 'private upstream context');
        let aborted = false;
        try {
            await expect(
                runMcpUpstream({
                    clients,
                    connectionId: 'failed',
                    operation: 'invocation',
                    timeoutMs: 1000,
                    use: async () => {
                        throw failure;
                    },
                })
            ).rejects.toBe(failure);
            await expect(
                runMcpUpstream({
                    clients,
                    connectionId: 'timeout',
                    operation: 'invocation',
                    timeoutMs: 20,
                    use: (_client, signal) =>
                        new Promise<void>((_resolve, reject) => {
                            signal.addEventListener('abort', () => {
                                aborted = true;
                                reject(new Error('aborted upstream request'));
                            });
                        }),
                })
            ).rejects.toMatchObject({ code: 'MCP_TIMEOUT' });
            expect(aborted).toBe(true);
            const finished = exporter.getFinishedSpans();
            expect(finished).toHaveLength(telemetry ? 2 : 0);
            expect(finished.map((span) => span.attributes['haus.failure.kind'])).toEqual(
                telemetry ? ['auth', 'timeout'] : []
            );
            for (const span of finished) {
                expect(span.name).toBe('haus.mcp.operation');
                expect(span.status.code).toBe(2);
                expect(JSON.stringify(span.events)).not.toContain(failure.message);
            }
        } finally {
            await clients.closeAll(1000);
            await runtime.dispose();
        }
    });
}
