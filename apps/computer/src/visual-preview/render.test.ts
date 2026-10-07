import { afterEach, beforeEach, expect, test } from 'bun:test';
import { createFakeCdp } from './fake-cdp.ts';
import { renderVisualPreviews } from './render.ts';
import { renderTiming } from './render-steps.ts';

const realTiming = { ...renderTiming };

beforeEach(() => {
    Object.assign(renderTiming, { handshakeMs: 200, pollMs: 5, settleMs: 5, totalMs: 1000 });
});
afterEach(() => {
    Object.assign(renderTiming, realTiming);
});

function launcher(fake: ReturnType<typeof createFakeCdp>) {
    let closes = 0;
    return {
        get closes() {
            return closes;
        },
        launch: () =>
            Promise.resolve({
                cdp: fake.cdp,
                close: () => {
                    closes += 1;
                    return Promise.resolve();
                },
            }),
    };
}

test('renders every fence at every scheme and width, one closed target each', async () => {
    const fake = createFakeCdp();
    const chrome = launcher(fake);

    const results = await renderVisualPreviews(
        [
            { html: '<p>a</p>', title: 'A' },
            { html: '<p>b</p>', title: undefined },
        ],
        { schemes: ['dark', 'light'], widths: [736, 375] },
        chrome.launch
    );

    expect(results.map((result) => result.renders.map((r) => `${r.scheme} ${r.width}`))).toEqual([
        ['dark 736', 'dark 375', 'light 736', 'light 375'],
        ['dark 736', 'dark 375', 'light 736', 'light 375'],
    ]);
    const first = results[0]?.renders[0];
    expect(first?.height).toBe(300);
    expect(first?.consoleErrors).toEqual(['from the visual']);
    expect(new TextDecoder().decode(first?.png ?? undefined)).toBe('png-bytes');
    const created = fake.calls.filter((call) => call.method === 'Target.createTarget');
    const closed = fake.calls.filter((call) => call.method === 'Target.closeTarget');
    expect(created).toHaveLength(8);
    expect(closed).toHaveLength(8);
    // The frame target starts paused and is released after its collectors attach.
    expect(
        fake.calls.some(
            (call) =>
                call.method === 'Runtime.runIfWaitingForDebugger' && call.sessionId === 'frame-1'
        )
    ).toBe(true);
    expect(chrome.closes).toBe(1);
    expect(fake.listenerCount).toBe(0);
});

test('the browser blocks every request off the pinned allowlist', async () => {
    const fake = createFakeCdp();
    const results = await renderVisualPreviews(
        [{ html: '<p>a</p>', title: undefined }],
        { schemes: ['dark'], widths: [736] },
        launcher(fake).launch
    );
    expect(results[0]?.renders[0]?.blockedRequests).toEqual([]);
    expect(fake.calls[0]).toEqual({
        method: 'Fetch.enable',
        params: { patterns: [{ urlPattern: '*' }] },
        sessionId: undefined,
    });

    // Interception is live for the whole batch: replay two paused requests.
    const policy = createFakeCdp();
    let resolveRender: () => void = () => {};
    const rendering = new Promise<void>((resolve) => {
        resolveRender = resolve;
    });
    const pending = renderVisualPreviews(
        [{ html: '<p>a</p>', title: undefined }],
        { schemes: ['dark'], widths: [736] },
        async () => {
            const chrome = await launcher(policy).launch();
            queueMicrotask(resolveRender);
            return chrome;
        }
    );
    await rendering;
    await Bun.sleep(0);
    policy.emit({
        method: 'Fetch.requestPaused',
        params: { request: { url: 'https://example.com/track' }, requestId: 'r1' },
    });
    policy.emit({
        method: 'Fetch.requestPaused',
        params: {
            request: { url: 'https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js' },
            requestId: 'r2',
        },
    });
    const [result] = await pending;
    expect(
        policy.calls.filter(
            (call) => call.method.startsWith('Fetch.') && call.method !== 'Fetch.enable'
        )
    ).toEqual([
        {
            method: 'Fetch.failRequest',
            params: { errorReason: 'BlockedByClient', requestId: 'r1' },
            sessionId: undefined,
        },
        { method: 'Fetch.continueRequest', params: { requestId: 'r2' }, sessionId: undefined },
    ]);
    expect(result?.renders[0]?.blockedRequests).toEqual(['https://example.com/track']);
});

test('a wedged render times out, closes its target, and the batch moves on', async () => {
    const fake = createFakeCdp({ hang: 'Page.captureScreenshot' });
    const chrome = launcher(fake);
    const results = await renderVisualPreviews(
        [{ html: '<script>for(;;){}</script>', title: undefined }],
        { schemes: ['dark', 'light'], widths: [736] },
        chrome.launch
    );
    expect(results[0]?.renders.map((render) => render.timedOut)).toEqual([true, true]);
    expect(results[0]?.renders[0]?.png).toBeNull();
    expect(fake.calls.filter((call) => call.method === 'Target.closeTarget')).toHaveLength(2);
    expect(chrome.closes).toBe(1);
});

test('a visual that never reports a size keeps the fallback height', async () => {
    const fake = createFakeCdp({ reported: null });
    const results = await renderVisualPreviews(
        [{ html: '<p>a</p>', title: undefined }],
        { schemes: ['dark'], widths: [736] },
        launcher(fake).launch
    );
    expect(results[0]?.renders[0]).toMatchObject({
        height: 240,
        reportedHeight: null,
        timedOut: false,
    });
});

test('the browser closes even when a render fails outright', async () => {
    const fake = createFakeCdp();
    const failing = {
        ...fake.cdp,
        send: (method: string, params?: Record<string, unknown>, sessionId?: string) =>
            method === 'Target.createTarget'
                ? Promise.reject(new Error('target refused'))
                : fake.cdp.send(method, params, sessionId),
    };
    let closes = 0;
    await expect(
        renderVisualPreviews(
            [{ html: '<p>a</p>', title: undefined }],
            { schemes: ['dark'], widths: [736] },
            () =>
                Promise.resolve({
                    cdp: failing,
                    close: () => {
                        closes += 1;
                        return Promise.resolve();
                    },
                })
        )
    ).rejects.toThrow('target refused');
    expect(closes).toBe(1);
});

test('more than four fences is refused before Chrome starts', async () => {
    let launched = false;
    await expect(
        renderVisualPreviews(
            Array.from({ length: 5 }, () => ({ html: '<p>a</p>', title: undefined })),
            { schemes: ['dark'], widths: [736] },
            () => {
                launched = true;
                return Promise.reject(new Error('unreachable'));
            }
        )
    ).rejects.toThrow('at most 4');
    expect(launched).toBe(false);
});
