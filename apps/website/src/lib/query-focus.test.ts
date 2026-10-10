import { afterEach, expect, test } from 'bun:test';
import { focusManager, QueryClient, QueryObserver } from '@tanstack/react-query';
import { installQueryFocusSources } from './query-focus.ts';
import { focusStaleWindowMs, queryClientDefaultOptions, refetchesOnFocus } from './query-policy.ts';
import { createStartReconciliation } from './start-reconciliation.ts';

const chatList = [['chat', 'list'], { input: { serverId: 'srv_1' }, type: 'query' }];
const chatMessage = [
    ['chat', 'message'],
    { input: { chatId: 'cht_a', messageId: 'msg_1', serverId: 'srv_1' }, type: 'query' },
];

function fakeSources() {
    const listeners = new Map<string, () => void>();
    let native: ((focused: boolean) => void) | null = null;
    let visibility: DocumentVisibilityState = 'visible';
    const held = new Set<() => void>();
    return {
        /** Runs the held focus passes, as if `focusReturnDelayMs` elapsed. */
        returnNow: () => {
            const due = [...held];
            held.clear();
            for (const run of due) {
                run();
            }
            return due.length;
        },
        blur: () => listeners.get('blur')?.(),
        focus: () => listeners.get('focus')?.(),
        hide: () => {
            visibility = 'hidden';
            listeners.get('visibilitychange')?.();
        },
        nativeFocus: (focused: boolean) => native?.(focused),
        show: () => {
            visibility = 'visible';
            listeners.get('visibilitychange')?.();
        },
        sources: {
            document: {
                addEventListener: (type: string, listener: () => void) => {
                    listeners.set(type, listener);
                },
                removeEventListener: (type: string) => {
                    listeners.delete(type);
                },
            } as unknown as Pick<Document, 'addEventListener' | 'removeEventListener'>,
            onWindowFocusChanged: (listener: (focused: boolean) => void) => {
                native = listener;
                return () => {
                    native = null;
                };
            },
            target: {
                addEventListener: (type: string, listener: () => void) => {
                    listeners.set(type, listener);
                },
                removeEventListener: (type: string) => {
                    listeners.delete(type);
                },
            } as unknown as Pick<Window, 'addEventListener' | 'removeEventListener'>,
            schedule: (run: () => void) => {
                held.add(run);
                return () => held.delete(run);
            },
            visibility: () => visibility,
        },
    };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let uninstall: () => void = () => undefined;
afterEach(() => uninstall());

function observe(queryClient: QueryClient, queryKey: unknown[], updatedAt: number) {
    let fetches = 0;
    queryClient.setQueryData(queryKey, 'cached', { updatedAt });
    const observer = new QueryObserver(queryClient, {
        queryFn: async () => {
            fetches += 1;
            return 'fresh';
        },
        queryKey,
        refetchOnMount: false,
    });
    const stop = observer.subscribe(() => undefined);
    return { fetches: () => fetches, stop };
}

test('the focus pass refetches only reads older than the 3-minute window', () => {
    const now = 10 * 60_000;
    const read = (age: number) => ({
        queryKey: chatList,
        state: { dataUpdatedAt: now - age },
    });
    expect(refetchesOnFocus(read(focusStaleWindowMs + 1) as never, now)).toBe(true);
    expect(refetchesOnFocus(read(focusStaleWindowMs - 1) as never, now)).toBe(false);
    expect(
        refetchesOnFocus(
            { queryKey: ['haus-website-build'], state: { dataUpdatedAt: 0 } } as never,
            now
        )
    ).toBe(false);
});

test('returning to the window refetches old active reads once and skips entities and fresh reads', async () => {
    const fake = fakeSources();
    uninstall = installQueryFocusSources(fake.sources);
    const queryClient = new QueryClient({ defaultOptions: queryClientDefaultOptions });
    queryClient.setQueryDefaults([['chat', 'message']], {
        refetchOnWindowFocus: false,
        staleTime: Number.POSITIVE_INFINITY,
    });
    queryClient.mount();
    const old = Date.now() - focusStaleWindowMs - 1000;
    const list = observe(queryClient, chatList, old);
    const entity = observe(queryClient, chatMessage, old);
    const fresh = observe(
        queryClient,
        [['agent', 'list'], { input: { serverId: 'srv_1' } }],
        Date.now()
    );

    // A quick alt-tab on desktop: blur, then native focus.
    fake.blur();
    // A blurred, visible window stays focused, so its polls keep running.
    expect(focusManager.isFocused()).toBe(true);
    fake.nativeFocus(true);
    expect(fake.returnNow()).toBe(1);
    await flush();

    expect(list.fetches()).toBe(1);
    expect(entity.fetches()).toBe(0);
    expect(fresh.fetches()).toBe(0);

    // Hidden, then shown again right away: the list just refetched, so it stays quiet.
    fake.hide();
    fake.show();
    fake.returnNow();
    await flush();
    expect(list.fetches()).toBe(1);

    for (const observer of [list, entity, fresh]) {
        observer.stop();
    }
    queryClient.unmount();
});

test('a wake that also reconnects the socket reads each stream-owned read once', async () => {
    const fake = fakeSources();
    uninstall = installQueryFocusSources(fake.sources);
    const queryClient = new QueryClient({ defaultOptions: queryClientDefaultOptions });
    const starts = createStartReconciliation(queryClient);
    queryClient.mount();
    const list = observe(queryClient, chatList, Date.now() - focusStaleWindowMs - 1000);

    // Asleep: hidden. The wake shows the window and drops the socket together.
    fake.hide();
    fake.show();
    await flush();
    // The reconnect's stream starts reconcile their owned reads.
    starts.run(() => starts.queue({ exact: false, queryKey: chatList }));
    starts.flush();
    await flush();
    expect(list.fetches()).toBe(1);

    // The focus pass then finds the list fresh.
    fake.returnNow();
    await flush();
    expect(list.fetches()).toBe(1);

    list.stop();
    queryClient.unmount();
});
