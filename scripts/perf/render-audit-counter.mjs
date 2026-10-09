// In-page half of render-audit.mjs, installed with addInitScript before the app
// loads. Serialized on its own, so it may reference nothing outside itself.
//
// Counts every function-component render the instrumented bundle reports
// (render-audit.vite.config.mjs). `roots` counts updates whose props object did
// not change: the component's own state or a context it reads started that
// render, so it heads a cascade. `--source Name` explains each root render of
// one component: the contexts whose value changed, hooks with queued updates,
// and external stores (React Query observers) with a new snapshot.
export function installRenderCounter() {
    const state = { byName: new Map(), on: false, roots: new Map(), sources: new Map(), total: 0 };
    globalThis.__hausRenders = state;
    globalThis.__hausRenderCount = (Component, mounting, props, previousProps, fiber) => {
        if (!state.on) {
            return;
        }
        state.total += 1;
        const base = Component?.displayName || Component?.name || 'Anonymous';
        const name = mounting ? `${base} (mount)` : base;
        state.byName.set(name, (state.byName.get(name) ?? 0) + 1);
        if (mounting || props !== previousProps) {
            return;
        }
        state.roots.set(base, (state.roots.get(base) ?? 0) + 1);
        if (base === globalThis.__hausAuditSource) {
            const why = [String(Component).slice(0, 120), ...renderReasons(fiber)].join(' | ');
            state.sources.set(why, (state.sources.get(why) ?? 0) + 1);
        }
    };

    function renderReasons(fiber) {
        const reasons = [...contextReasons(fiber), ...hookReasons(fiber)];
        return reasons.length > 0 ? reasons : ['no context, store, or queued update'];
    }

    function contextReasons(fiber) {
        const reasons = [];
        for (let dep = fiber?.dependencies?.firstContext; dep; dep = dep.next) {
            const value = dep.context._currentValue;
            if (Object.is(value, dep.memoizedValue)) {
                continue;
            }
            const shape =
                value && typeof value === 'object'
                    ? Object.keys(value).slice(0, 6).join(',')
                    : String(value);
            reasons.push(`context ${dep.context.displayName ?? `{${shape}}`}`);
        }
        return reasons;
    }

    function hookReasons(fiber) {
        const reasons = [];
        let index = 0;
        for (let hook = fiber?.memoizedState; hook?.next !== undefined; hook = hook.next) {
            if (hook.queue?.pending || hook.baseQueue) {
                reasons.push(`hook #${index} update`);
            }
            const snapshot = hook.queue?.getSnapshot?.();
            if (hook.queue?.getSnapshot && !Object.is(snapshot, hook.memoizedState)) {
                reasons.push(`store #${index} ${describeChange(hook.memoizedState, snapshot)}`);
            }
            index += 1;
        }
        return reasons;
    }

    function describeChange(previous, next) {
        if (!(previous && next && typeof previous === 'object' && typeof next === 'object')) {
            return '';
        }
        const changed = Object.keys(next).filter((key) => !Object.is(previous[key], next[key]));
        const data = next.data;
        let shape = '';
        if (Array.isArray(data)) {
            shape = `data[${data.length}]`;
        } else if (data && typeof data === 'object') {
            shape = `data{${Object.keys(data).slice(0, 4).join(',')}}`;
        }
        return `${shape} changed:${changed.slice(0, 6).join(',')}`;
    }

    // Prod dials the website origin; point it at the Server port (render-audit.mjs header).
    const NativeWebSocket = globalThis.WebSocket;
    const serverPort = globalThis.__hausAuditServerPort;
    globalThis.WebSocket = class extends NativeWebSocket {
        constructor(url, protocols) {
            const target = new URL(String(url));
            if (serverPort && target.pathname.startsWith('/trpc')) {
                target.port = String(serverPort);
            }
            super(target.toString(), protocols);
        }
    };
}
