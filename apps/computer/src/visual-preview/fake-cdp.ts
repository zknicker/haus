import type { CdpClient, CdpEvent } from './cdp.ts';

export interface FakeCall {
    method: string;
    params: Record<string, unknown>;
    sessionId?: string;
}

/**
 * A scripted browser: answers the calls one render makes, attaches the visual
 * frame when the host page sets its srcdoc, and records every call. `hang`
 * makes a method never answer, like a wedged renderer.
 */
export function createFakeCdp(options: { hang?: string; reported?: number | null } = {}) {
    const calls: FakeCall[] = [];
    const listeners = new Set<(event: CdpEvent) => void>();
    let targets = 0;
    let closed = false;
    const emit = (event: CdpEvent) => {
        for (const listener of [...listeners]) {
            listener(event);
        }
    };
    const reported = options.reported === undefined ? 300 : options.reported;

    const answer = (method: string, params: Record<string, unknown>, sessionId?: string) => {
        switch (method) {
            case 'Target.createTarget':
                targets += 1;
                return { targetId: `target-${targets}` };
            case 'Target.attachToTarget':
                return { sessionId: `page-${targets}` };
            case 'Page.getFrameTree':
                return { frameTree: { frame: { id: 'main' } } };
            case 'Page.captureScreenshot':
                return { data: Buffer.from('png-bytes').toString('base64') };
            case 'Runtime.evaluate':
                return { result: { value: evaluate(String(params.expression), sessionId) } };
            default:
                return {};
        }
    };
    const evaluate = (expression: string, sessionId?: string) => {
        if (expression.startsWith('window.hausRenderVisual')) {
            queueMicrotask(() => {
                emit({
                    method: 'Target.attachedToTarget',
                    params: { sessionId: `frame-${targets}`, targetInfo: { type: 'iframe' } },
                    sessionId,
                });
                emit({
                    method: 'Runtime.consoleAPICalled',
                    params: { args: [{ type: 'string', value: 'from the visual' }], type: 'error' },
                    sessionId: `frame-${targets}`,
                });
            });
            return undefined;
        }
        if (expression.includes('hausVisualSize')) {
            return JSON.stringify({ height: reported ?? 240, reported });
        }
        return JSON.stringify({
            clipCandidates: [],
            overflowRoots: [],
            scrollWidth: 736,
            svgTexts: [],
            textBoxes: [],
            viewportWidth: 736,
        });
    };

    const cdp: CdpClient = {
        close() {
            closed = true;
        },
        on(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        send(method, rawParams, sessionId) {
            const params = rawParams ?? {};
            calls.push({ method, params, sessionId });
            if (method === options.hang) {
                return new Promise(() => {});
            }
            return Promise.resolve(answer(method, params, sessionId));
        },
    };
    return {
        calls,
        cdp,
        emit,
        get closed() {
            return closed;
        },
        get listenerCount() {
            return listeners.size;
        },
    };
}
