import { buildVisualSrcDoc, type VisualColorScheme } from '@haus/api/widgets/visual/frame';
import { agentHtmlTokenSnapshotDeclarations } from '@haus/api/widgets/visual/tokens';
import * as z from 'zod';
import type { CdpClient } from './cdp.ts';
import { readFrameEvent } from './frame-events.ts';
import {
    analyzeLayout,
    type LayoutFinding,
    layoutFactsExpression,
    layoutFactsSchema,
} from './layout-probe.ts';
import {
    captureFrame,
    evaluate,
    evaluateString,
    parseCdp,
    prepareFrame,
    preparePage,
    renderTiming,
    waitForSize,
} from './render-steps.ts';

export interface VisualRenderRequest {
    html: string;
    scheme: VisualColorScheme;
    width: number;
}

export interface VisualRenderResult {
    consoleErrors: string[];
    cspViolations: string[];
    exceptions: string[];
    findings: LayoutFinding[];
    /** The frame height the chat would draw, after the clamp. */
    height: number;
    png: Uint8Array | null;
    /** The raw height the frame reported, or null when it never reported. */
    reportedHeight: number | null;
    /** Set when the render hit its time cap; the other fields are partial. */
    timedOut: boolean;
}

class RenderTimeout extends Error {}

/**
 * One fence, one scheme, one width, on its own target: the host page draws the
 * sandboxed frame from the same srcdoc the chat builds, waits for the size
 * handshake, measures, and screenshots the frame. The target is always closed.
 */
export async function renderVisualFrame(
    cdp: CdpClient,
    request: VisualRenderRequest
): Promise<VisualRenderResult> {
    const result: VisualRenderResult = {
        consoleErrors: [],
        cspViolations: [],
        exceptions: [],
        findings: [],
        height: 0,
        png: null,
        reportedHeight: null,
        timedOut: false,
    };
    const srcDoc = buildVisualSrcDoc(
        request.html,
        agentHtmlTokenSnapshotDeclarations(request.scheme),
        request.scheme
    );
    // Script line numbers count the frame's own head; report them in fence lines.
    const bodyLineOffset = srcDoc.slice(0, srcDoc.lastIndexOf(request.html)).split('\n').length - 1;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new RenderTimeout()), renderTiming.totalMs);
    });
    const step = <T>(promise: Promise<T>) => Promise.race([promise, timeout]);
    let targetId: string | null = null;
    let stopListening = () => {};
    try {
        targetId = parseCdp(
            z.object({ targetId: z.string() }),
            await step(cdp.send('Target.createTarget', { url: 'about:blank' }))
        ).targetId;
        const { sessionId: page } = parseCdp(
            z.object({ sessionId: z.string() }),
            await step(cdp.send('Target.attachToTarget', { flatten: true, targetId }))
        );
        let frame: string | null = null;
        let frameAttached: () => void = () => {};
        const frameReady = new Promise<void>((resolve) => {
            frameAttached = resolve;
        });
        stopListening = cdp.on((event) => {
            const read = readFrameEvent(event, { bodyLineOffset, frame, page });
            if (read.kind === 'frame-attached') {
                frame = read.sessionId;
                prepareFrame(cdp, read.sessionId).then(frameAttached, (error: unknown) => {
                    result.exceptions.push(`Preview could not watch the frame: ${String(error)}`);
                    frameAttached();
                });
            } else if (read.kind === 'other-attached') {
                // Best effort: a target that is already gone needs no release.
                cdp.send('Runtime.runIfWaitingForDebugger', {}, read.sessionId).catch(() => {});
            } else if (read.kind === 'console-error') {
                result.consoleErrors.push(read.text);
            } else if (read.kind === 'exception') {
                result.exceptions.push(read.text);
            } else if (read.kind === 'csp-violation' && !result.cspViolations.includes(read.text)) {
                result.cspViolations.push(read.text);
            }
        });

        await step(preparePage(cdp, page, request));
        await step(evaluate(cdp, page, `window.hausRenderVisual(${JSON.stringify(srcDoc)})`));
        await step(Promise.race([frameReady, Bun.sleep(renderTiming.handshakeMs)]));
        const size = await step(waitForSize(cdp, page));
        result.height = size.height;
        result.reportedHeight = size.reported;
        if (frame) {
            result.findings = await step(probeLayout(cdp, frame, result));
        } else {
            result.exceptions.push(
                'Preview could not attach to the visual frame; console errors and layout checks are unavailable.'
            );
        }
        result.png = await step(
            captureFrame(cdp, page, { height: size.height, width: request.width })
        );
    } catch (error) {
        if (!(error instanceof RenderTimeout)) {
            throw error;
        }
        result.timedOut = true;
    } finally {
        clearTimeout(timer);
        stopListening();
        if (targetId) {
            // A wedged renderer must not hold the batch: closing is bounded too.
            await Promise.race([
                cdp.send('Target.closeTarget', { targetId }).catch(() => {}),
                Bun.sleep(2000),
            ]);
        }
    }
    return result;
}

/**
 * The frame runs agent script, which can break the probe (say, by replacing
 * JSON). That is the visual's problem to report, not an infra failure, so it
 * lands with the exceptions.
 */
async function probeLayout(
    cdp: CdpClient,
    frame: string,
    result: VisualRenderResult
): Promise<LayoutFinding[]> {
    try {
        const raw = await evaluateString(cdp, frame, layoutFactsExpression);
        return analyzeLayout(parseCdp(layoutFactsSchema, JSON.parse(raw)));
    } catch (error) {
        result.exceptions.push(
            `Layout checks could not run: ${error instanceof Error ? error.message : String(error)}`
        );
        return [];
    }
}
