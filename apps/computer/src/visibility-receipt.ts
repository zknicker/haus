import type { VisibleMessageIdentity } from './inbox-store.ts';

/**
 * Tells the Server that these exact Chat messages are model-visible in the
 * active run. A pull receipt also serves the rows a local `message check`
 * returned; a composed receipt covers a drain the turn prompt carried and
 * records exact visibility only. Returns the identities the Server accepted,
 * or null when it accepted none.
 */
export async function attestVisibleMessages(
    serverOrigin: string,
    runnerToken: string,
    messages: VisibleMessageIdentity[],
    options: { composed?: boolean; signal?: AbortSignal } = {}
): Promise<VisibleMessageIdentity[] | null> {
    const response = await fetch(new URL('/api/agent/events/visible', serverOrigin), {
        body: JSON.stringify({ messages, ...(options.composed ? { composed: true } : {}) }),
        headers: {
            authorization: `Bearer ${runnerToken}`,
            'content-type': 'application/json',
        },
        method: 'POST',
        ...(options.signal ? { signal: options.signal } : {}),
    }).catch(() => null);
    if (!response?.ok) {
        return null;
    }
    const body = (await response.json().catch(() => null)) as { accepted?: unknown } | null;
    if (!Array.isArray(body?.accepted)) {
        return null;
    }
    const accepted = new Set(body.accepted.filter((id): id is string => typeof id === 'string'));
    return messages.filter((message) => accepted.has(message.id));
}

/** Binds the composed receipt to one launch's runner authority. */
export function visibilityReceipt(serverOrigin: string, runnerToken: string) {
    return (identities: VisibleMessageIdentity[], signal: AbortSignal) =>
        attestVisibleMessages(serverOrigin, runnerToken, identities, { composed: true, signal });
}
