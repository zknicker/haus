import type { Run, SDKMessage } from '@cursor/sdk';
import { type CursorRunEvent, isCursorRunStatus } from './transport.ts';

/**
 * SDK 1.0.30 exposes no public stream disposal. Its installed CloudRun owns
 * disposeClientStream, which aborts network reads and bounded-joins the reader.
 * Recheck this seam on upgrades; remove it when Run gains public disposal.
 */
export async function streamCursorRun(
    run: Pick<Run, 'supports' | 'stream'>,
    onEvent: (event: CursorRunEvent) => Promise<void>,
    signal: AbortSignal
): Promise<void> {
    if (signal.aborted || !run.supports('stream')) {
        return;
    }
    if (!('disposeClientStream' in run) || typeof run.disposeClientStream !== 'function') {
        // An uncloseable stream falls back to daemon-owned reconciliation.
        return;
    }
    const disposeClientStream = run.disposeClientStream.bind(run);
    let closing: Promise<unknown> | undefined;
    const close = () => {
        closing ??= Promise.resolve().then(() => disposeClientStream());
        return closing;
    };
    const abort = () => {
        // Keep rejection observed until the joined finalizer propagates it.
        close().catch(() => undefined);
    };
    let iterator: AsyncGenerator<SDKMessage, void> | undefined;
    signal.addEventListener('abort', abort, { once: true });
    try {
        iterator = run.stream();
        if (signal.aborted) {
            await close();
            return;
        }
        for await (const message of iterator) {
            if (signal.aborted) {
                break;
            }
            const event = eventOf(message);
            if (event) {
                await onEvent(event);
            }
        }
    } finally {
        signal.removeEventListener('abort', abort);
        await close();
        await iterator?.return();
    }
}

function eventOf(message: SDKMessage): CursorRunEvent | null {
    if (message.type === 'status' && isCursorRunStatus(message.status)) {
        return { kind: 'status', rawStatus: message.status };
    }
    if (message.type === 'task' && message.text) {
        return { kind: 'activity', summary: message.text };
    }
    if (message.type === 'tool_call') {
        return { kind: 'activity', summary: `Running ${message.name}` };
    }
    return null;
}
