import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeTelemetryLayer } from '@haus/effect';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { ManagedRuntime } from 'effect';
import { parseBrowserRequest, runBrowserRequest } from '../../computer/src/browser/requests.ts';
import { BrowserReplyOffice } from '../src/computers/browser-reply-office.ts';

test('Browser request serialization preserves Server parent on the Computer operation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-browser-trace-'));
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
    let execution: Promise<void> | undefined;
    const office = new BrowserReplyOffice({
        runtime: serverRuntime,
        send(computerId, frame) {
            const request = parseBrowserRequest(JSON.parse(JSON.stringify(frame)));
            if (!request) {
                return false;
            }
            execution = runBrowserRequest(root, request, computerRuntime).then((result) => {
                expect(office.accept(computerId, result)).toBe(true);
            });
            return true;
        },
    });
    try {
        await expect(office.request('cmp_test', { kind: 'get' })).resolves.toMatchObject({
            kind: 'settings',
        });
        await execution;
        const spans = exporter.getFinishedSpans();
        expect(spans).toHaveLength(2);
        const parent = spans.find((span) => !span.parentSpanContext);
        const child = spans.find((span) => span.parentSpanContext);
        expect(parent).toBeDefined();
        expect(child).toBeDefined();
        expect(child?.spanContext().traceId).toBe(parent?.spanContext().traceId);
        expect(child?.parentSpanContext?.spanId).toBe(parent?.spanContext().spanId);
        expect(child?.attributes['haus.request.id']).toBe(parent?.attributes['haus.request.id']);
    } finally {
        await execution;
        await Promise.all([serverRuntime.dispose(), computerRuntime.dispose()]);
        await rm(root, { force: true, recursive: true });
    }
});
