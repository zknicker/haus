/**
 * The web side of a provider return: Linear's callback loads the App in the
 * browser tab the App opened for it, and that tab hands its page back to the
 * tab that started the flow, then closes itself. Tabs talk over one
 * same-origin BroadcastChannel; the opener is unreachable through
 * `window.opener` because the provider page must not hold it.
 */

const channelName = 'haus.provider-return';
/** How long a started flow waits for its return; Linear's install link outlives it anyway. */
const watchMs = 30 * 60_000;
/** How long a landing waits for a starting tab to claim it before staying put. */
const claimMs = 1500;

type ReturnMessage =
    | { kind: 'landed'; path: string; token: string }
    | { kind: 'claimed'; token: string };

export interface ReturnChannel {
    close(): void;
    onmessage: ((event: { data: unknown }) => void) | null;
    postMessage(message: ReturnMessage): void;
}

function openChannel(): ReturnChannel | null {
    if (typeof BroadcastChannel === 'undefined') {
        return null;
    }
    const channel = new BroadcastChannel(channelName);
    const end: ReturnChannel = {
        close: () => channel.close(),
        onmessage: null,
        postMessage: (message) => channel.postMessage(message),
    };
    channel.onmessage = (event) => end.onmessage?.({ data: event.data });
    return end;
}

/**
 * In the starting tab, after the provider tab opened: the first landing
 * inside `serverPath` is claimed and shown here through `show`. Returns a
 * function that stops waiting.
 */
export function awaitWebProviderReturn(
    input: { serverPath: string; show: (path: string) => void },
    channel: ReturnChannel | null = openChannel()
): () => void {
    if (!channel) {
        return () => undefined;
    }
    const stop = () => {
        clearTimeout(timer);
        channel.onmessage = null;
        channel.close();
    };
    const timer = setTimeout(stop, watchMs);
    channel.onmessage = ({ data }) => {
        const message = data as Partial<ReturnMessage> | null;
        if (
            message?.kind !== 'landed' ||
            typeof message.path !== 'string' ||
            typeof message.token !== 'string' ||
            !message.path.startsWith(`${input.serverPath}/`)
        ) {
            return;
        }
        channel.postMessage({ kind: 'claimed', token: message.token });
        stop();
        input.show(message.path);
    };
    return stop;
}

/**
 * In a tab a provider just returned to: offers `path` to the tab that started
 * the flow. True once one claimed it (this tab may close); false when none
 * answers, so this tab keeps showing the outcome in place.
 */
export function announceWebProviderReturn(
    path: string,
    channel: ReturnChannel | null = openChannel(),
    waitMs = claimMs
): Promise<boolean> {
    if (!channel) {
        return Promise.resolve(false);
    }
    const token = crypto.randomUUID();
    return new Promise((resolve) => {
        const finish = (claimed: boolean) => {
            clearTimeout(timer);
            channel.onmessage = null;
            channel.close();
            resolve(claimed);
        };
        const timer = setTimeout(() => finish(false), waitMs);
        channel.onmessage = ({ data }) => {
            const message = data as Partial<ReturnMessage> | null;
            if (message?.kind === 'claimed' && message.token === token) {
                finish(true);
            }
        };
        channel.postMessage({ kind: 'landed', path, token });
    });
}
