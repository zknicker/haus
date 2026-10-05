import { expect, test } from 'bun:test';
import { createSessionShare } from './clerk-session-share.ts';

type Listener = (event: object, ...args: unknown[]) => unknown;

const main = require('../../electron/clerk-session-handoff.cjs') as {
    registerClerkSessionHandoff(options: {
        appUrl: string;
        BrowserWindow: { fromWebContents(contents: unknown): unknown };
        ipcMain: {
            handle(name: string, run: Listener): void;
            on(name: string, run: Listener): void;
        };
        now: () => number;
    }): void;
};

const appUrl = 'https://haus.chat';
const tokenLifetimeSeconds = 60;
const sessionWatchIntervalMs = 30_000;

function jwt(claims: Record<string, unknown>) {
    const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${part({ alg: 'RS256' })}.${part(claims)}.signature`;
}

/**
 * One App window and main's handoff, wired through Electron-shaped IPC events,
 * with a token cache that follows clerk-js: a cached token is reused until it
 * has under `leeway + 5` seconds left (leeway defaults to 10). Native Clerk runs
 * no poller, so tokens only change when the window reads one.
 */
function harness({ refreshes }: { refreshes: boolean }) {
    const clock = { now: 1_000_000_000 };
    const timers: { at: number; run: () => void }[] = [];
    const handlers = new Map<string, Listener>();
    const contents = {
        getURL: () => `${appUrl}/`,
        mainFrame: { frameTreeNodeId: 1, url: `${appUrl}/` },
    };
    main.registerClerkSessionHandoff({
        appUrl,
        BrowserWindow: {
            fromWebContents: (sender) => (sender === contents ? { webContents: contents } : null),
        },
        ipcMain: {
            handle: (name, run) => handlers.set(name, run),
            on: (name, run) => handlers.set(name, run),
        },
        now: () => clock.now,
    });
    const event = () => ({ sender: contents, senderFrame: { ...contents.mainFrame } });

    let cached: { exp: number; token: string } | null = null;
    const getToken = (options?: { leewayInSeconds: number }) => {
        const nowSeconds = Math.floor(clock.now / 1000);
        const leeway = options?.leewayInSeconds ?? 10;
        if (!cached || cached.exp - nowSeconds < leeway + 5) {
            const exp = nowSeconds + tokenLifetimeSeconds;
            cached = { exp, token: jwt({ exp, iat: nowSeconds, sid: 'sess_1', sub: 'user_1' }) };
        }
        return cached.token;
    };
    const session = createSessionShare({
        clearTimer: (handle) => timers.splice(timers.indexOf(handle as never), 1),
        now: () => clock.now,
        publish: async (token) => {
            await handlers.get('desktop:auth:session-share')?.(event(), token);
        },
        refresh: () => {
            if (refreshes) {
                session.share(getToken({ leewayInSeconds: 25 }));
            }
        },
        setTimer: (run, ms) => {
            const timer = { at: clock.now + ms, run };
            timers.push(timer);
            return timer;
        },
    });
    // The Server reads (session watch, connection params) the window makes anyway.
    const read = () => session.share(getToken());

    const peek = () => {
        let reply: unknown;
        const peekEvent = event();
        // Electron's IpcMainEvent.returnValue is write-only.
        Object.defineProperty(peekEvent, 'returnValue', {
            get: () => undefined,
            set: (value) => {
                reply = value;
            },
        });
        handlers.get('desktop:auth:session-peek')?.(peekEvent);
        return reply;
    };
    const advance = async (ms: number) => {
        clock.now += ms;
        for (const timer of timers.filter((due) => due.at <= clock.now)) {
            timers.splice(timers.indexOf(timer), 1);
            timer.run();
        }
        await Promise.resolve();
    };
    return { advance, peek, read };
}

async function emptyPeekSeconds(refreshes: boolean) {
    const h = harness({ refreshes });
    h.read();
    await Promise.resolve();
    const empty: number[] = [];
    for (let second = 1; second <= 300; second += 1) {
        await h.advance(1000);
        if ((second * 1000) % sessionWatchIntervalMs === 0) {
            h.read();
            await Promise.resolve();
        }
        if (typeof h.peek() !== 'string') {
            empty.push(second);
        }
    }
    return empty;
}

test('a signed-in window keeps a handed-off token available as Clerk refreshes it', async () => {
    expect(await emptyPeekSeconds(true)).toEqual([]);
});

test('without the refresh the shared token lapses between reads', async () => {
    expect((await emptyPeekSeconds(false)).length).toBeGreaterThan(0);
});
