import type { Page } from '@playwright/test';

/**
 * Records what the App sends to its Server and website origins, the way
 * `scripts/perf/idle-network.mjs` does: each HTTP tRPC procedure (split out
 * of batched URLs), each other same-origin fetch, and each App socket's
 * opens, closes, subscription starts, and socket calls (`session.refresh`).
 * Idle specs read the entries after a mark so first-load reads stay out.
 */
export type TrafficEntry =
    | { kind: 'trpc'; procedure: string }
    | { kind: 'fetch'; procedure: string }
    | { kind: 'ws-open' }
    | { kind: 'ws-close' }
    | { kind: 'ws-subscribe'; procedure: string }
    | { kind: 'ws-call'; procedure: string };

export interface AppTraffic {
    mark(): number;
    /** Resolves once no subscription has started and no tRPC read was sent for `quietMs`. */
    settled(options?: { quietMs?: number; timeoutMs?: number }): Promise<void>;
    /** Every entry recorded since `since` (a value from `mark`), in order. */
    since(mark: number): TrafficEntry[];
}

export function recordAppTraffic(page: Page): AppTraffic {
    const entries: { at: number; entry: TrafficEntry }[] = [];
    const record = (entry: TrafficEntry) => entries.push({ at: performance.now(), entry });
    const appOrigins = () => [new URL(page.url()).origin, serverOrigin()];

    page.on('request', (request) => {
        const url = new URL(request.url());
        if (!url.protocol.startsWith('http')) {
            return;
        }
        if (url.pathname.startsWith('/trpc/')) {
            for (const procedure of url.pathname.slice('/trpc/'.length).split(',')) {
                record({ kind: 'trpc', procedure: decodeURIComponent(procedure) });
            }
            return;
        }
        if (
            ['fetch', 'xhr'].includes(request.resourceType()) &&
            appOrigins().includes(url.origin)
        ) {
            record({ kind: 'fetch', procedure: `GET ${url.pathname}` });
        }
    });
    page.on('websocket', (socket) => {
        if (!new URL(socket.url()).pathname.startsWith('/trpc')) {
            return;
        }
        record({ kind: 'ws-open' });
        socket.on('close', () => record({ kind: 'ws-close' }));
        socket.on('framesent', ({ payload }) => {
            for (const message of parseFrames(payload)) {
                const procedure = message.params?.path ?? 'unknown';
                if (message.method === 'subscription') {
                    record({ kind: 'ws-subscribe', procedure });
                } else if (message.method === 'mutation' || message.method === 'query') {
                    record({ kind: 'ws-call', procedure });
                }
            }
        });
    });

    return {
        mark: () => entries.length,
        since: (mark) => entries.slice(mark).map(({ entry }) => entry),
        async settled({ quietMs = 2000, timeoutMs = 30_000 } = {}) {
            const deadline = performance.now() + timeoutMs;
            for (;;) {
                const last = entries
                    .filter(({ entry }) => entry.kind === 'trpc' || entry.kind === 'ws-subscribe')
                    .at(-1);
                const quietFor = last ? performance.now() - last.at : quietMs;
                if (quietFor >= quietMs) {
                    return;
                }
                if (performance.now() > deadline) {
                    throw new Error(`App traffic never went quiet for ${quietMs} ms`);
                }
                await page.waitForTimeout(Math.max(100, quietMs - quietFor));
            }
        },
    };
}

/** `name ×count` lines for a failure message, most frequent first. */
export function describeTraffic(entries: readonly TrafficEntry[]): string {
    const counts = new Map<string, number>();
    for (const entry of entries) {
        const key = 'procedure' in entry ? `${entry.kind} ${entry.procedure}` : entry.kind;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts]
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => `  ${key} ×${count}`)
        .join('\n');
}

function serverOrigin() {
    return `http://127.0.0.1:${process.env.HAUS_SERVER_PORT}`;
}

function parseFrames(payload: string | Buffer): { method?: string; params?: { path?: string } }[] {
    if (typeof payload !== 'string' || !(payload.startsWith('{') || payload.startsWith('['))) {
        return [];
    }
    try {
        const parsed = JSON.parse(payload) as unknown;
        return (Array.isArray(parsed) ? parsed : [parsed]) as {
            method?: string;
            params?: { path?: string };
        }[];
    } catch {
        return [];
    }
}
