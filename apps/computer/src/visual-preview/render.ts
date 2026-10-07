import type { VisualColorScheme } from '@haus/api/widgets/visual/frame';
import * as z from 'zod';
import type { CdpClient } from './cdp.ts';
import type { HeadlessChrome } from './chrome.ts';
import { isAllowedPreviewRequest } from './host-page.ts';
import { renderVisualFrame, type VisualRenderResult } from './render-frame.ts';

export const maxPreviewFences = 4;

export interface VisualPreviewFence {
    html: string;
    title: string | undefined;
}

export interface VisualPreviewOptions {
    schemes: readonly VisualColorScheme[];
    widths: readonly number[];
}

export interface VisualPreviewRender extends VisualRenderResult {
    /** Requests the browser refused because they were not on the pinned allowlist. */
    blockedRequests: string[];
    scheme: VisualColorScheme;
    width: number;
}

export interface VisualPreviewFenceResult {
    fence: VisualPreviewFence;
    renders: VisualPreviewRender[];
}

/**
 * Render every fence at every scheme and width in one throwaway browser,
 * fences in order. The browser is always closed, whatever a render does.
 */
export async function renderVisualPreviews(
    fences: readonly VisualPreviewFence[],
    options: VisualPreviewOptions,
    launch: () => Promise<HeadlessChrome>
): Promise<VisualPreviewFenceResult[]> {
    if (fences.length > maxPreviewFences) {
        throw new Error(`Preview renders at most ${maxPreviewFences} visuals at a time.`);
    }
    const chrome = await launch();
    try {
        const blocked: string[] = [];
        const stopBlocking = await enforceRequestPolicy(chrome.cdp, (url) => blocked.push(url));
        try {
            const results: VisualPreviewFenceResult[] = [];
            for (const fence of fences) {
                const renders: VisualPreviewRender[] = [];
                for (const scheme of options.schemes) {
                    for (const width of options.widths) {
                        blocked.length = 0;
                        const render = await renderVisualFrame(chrome.cdp, {
                            html: fence.html,
                            scheme,
                            width,
                        });
                        renders.push({
                            ...render,
                            blockedRequests: [...new Set(blocked)],
                            scheme,
                            width,
                        });
                    }
                }
                results.push({ fence, renders });
            }
            return results;
        } finally {
            stopBlocking();
        }
    } finally {
        await chrome.close();
    }
}

const pausedSchema = z.object({ request: z.object({ url: z.string() }), requestId: z.string() });

/**
 * Browser-wide request interception, so it covers the host page, the
 * sandboxed frame's own process, and anything the frame opens. Only data:,
 * blob:, and the pinned CDN files the frame CSP names get through.
 */
async function enforceRequestPolicy(
    cdp: CdpClient,
    onBlocked: (url: string) => void
): Promise<() => void> {
    const stop = cdp.on((event) => {
        if (event.method !== 'Fetch.requestPaused' || event.sessionId !== undefined) {
            return;
        }
        const paused = pausedSchema.safeParse(event.params);
        if (!paused.success) {
            return;
        }
        const { request, requestId } = paused.data;
        if (isAllowedPreviewRequest(request.url)) {
            cdp.send('Fetch.continueRequest', { requestId }).catch(() => {});
            return;
        }
        // Chrome's own internal fetches are refused too, but only the page's
        // web requests are the visual's business.
        if (/^(https?|wss?):/u.test(request.url)) {
            onBlocked(request.url);
        }
        // A request whose target already closed cannot be failed; nothing to do.
        cdp.send('Fetch.failRequest', { errorReason: 'BlockedByClient', requestId }).catch(
            () => {}
        );
    });
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    return stop;
}
