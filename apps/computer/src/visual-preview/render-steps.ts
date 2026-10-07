import type { VisualColorScheme } from '@haus/api/widgets/visual/frame';
import { agentHtmlTokenSnapshotDeclarations } from '@haus/api/widgets/visual/tokens';
import * as z from 'zod';
import type { CdpClient } from './cdp.ts';
import { type HostSizeState, hostPageHtml, hostSizeExpression } from './host-page.ts';

export const renderTiming = {
    handshakeMs: 5000,
    pollMs: 100,
    settleMs: 400,
    totalMs: 15_000,
};

/** Host page target: viewport at the column width, scheme, and the host document. */
export async function preparePage(
    cdp: CdpClient,
    page: string,
    request: { scheme: VisualColorScheme; width: number }
): Promise<void> {
    await cdp.send('Page.enable', {}, page);
    // The sandboxed frame gets its own target; it starts paused so the
    // collectors are listening before the first agent script runs.
    await cdp.send(
        'Target.setAutoAttach',
        { autoAttach: true, flatten: true, waitForDebuggerOnStart: true },
        page
    );
    await cdp.send(
        'Emulation.setDeviceMetricsOverride',
        { deviceScaleFactor: 1, height: 800, mobile: false, width: request.width },
        page
    );
    await cdp.send(
        'Emulation.setEmulatedMedia',
        { features: [{ name: 'prefers-color-scheme', value: request.scheme }] },
        page
    );
    const tree = parseCdp(
        z.object({ frameTree: z.object({ frame: z.object({ id: z.string() }) }) }),
        await cdp.send('Page.getFrameTree', {}, page)
    );
    await cdp.send(
        'Page.setDocumentContent',
        {
            frameId: tree.frameTree.frame.id,
            html: hostPageHtml({
                scheme: request.scheme,
                tokensCss: agentHtmlTokenSnapshotDeclarations(request.scheme),
                width: request.width,
            }),
        },
        page
    );
}

/** Visual frame target: console, exceptions, and CSP issues, then release it. */
export async function prepareFrame(cdp: CdpClient, frame: string): Promise<void> {
    await cdp.send('Runtime.enable', {}, frame);
    await cdp.send('Audits.enable', {}, frame);
    await cdp.send('Runtime.runIfWaitingForDebugger', {}, frame);
}

const hostSizeSchema = z.object({ height: z.number(), reported: z.number().nullable() });

/** Wait for the first size report (or the handshake cap), then let the visual settle. */
export async function waitForSize(cdp: CdpClient, page: string): Promise<HostSizeState> {
    const readSize = async () =>
        parseCdp(hostSizeSchema, JSON.parse(await evaluateString(cdp, page, hostSizeExpression)));
    const deadline = Date.now() + renderTiming.handshakeMs;
    while (Date.now() < deadline && (await readSize()).reported === null) {
        await Bun.sleep(renderTiming.pollMs);
    }
    // The visual's own script (a hover layer, a computed label) runs after the
    // first report, and its ResizeObserver may report again.
    await Bun.sleep(renderTiming.settleMs);
    return await readSize();
}

export async function captureFrame(
    cdp: CdpClient,
    page: string,
    clip: { height: number; width: number }
): Promise<Uint8Array> {
    const shot = parseCdp(
        z.object({ data: z.string() }),
        await cdp.send(
            'Page.captureScreenshot',
            {
                captureBeyondViewport: true,
                clip: { ...clip, scale: 1, x: 0, y: 0 },
                format: 'png',
            },
            page
        )
    );
    return Uint8Array.from(Buffer.from(shot.data, 'base64'));
}

const evaluateSchema = z.object({
    exceptionDetails: z.object({ text: z.string() }).optional(),
    result: z.object({ value: z.unknown().optional() }),
});

export async function evaluate(
    cdp: CdpClient,
    sessionId: string,
    expression: string
): Promise<unknown> {
    const response = parseCdp(
        evaluateSchema,
        await cdp.send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)
    );
    if (response.exceptionDetails) {
        throw new Error(`Preview script failed: ${response.exceptionDetails.text}`);
    }
    return response.result.value;
}

export async function evaluateString(
    cdp: CdpClient,
    sessionId: string,
    expression: string
): Promise<string> {
    return parseCdp(z.string(), await evaluate(cdp, sessionId, expression));
}

export function parseCdp<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
        throw new Error(`Unexpected Chrome DevTools response: ${parsed.error.message}`);
    }
    return parsed.data;
}
