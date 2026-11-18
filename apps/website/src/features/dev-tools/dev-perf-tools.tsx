import * as React from 'react';
import { startRenderLog } from './render-log.ts';

const ReactQueryDevtools = React.lazy(() =>
    import('@tanstack/react-query-devtools').then((module) => ({
        default: module.ReactQueryDevtools,
    }))
);

/**
 * Dev-build perf toggles, loaded only under `import.meta.env.DEV`
 * (lib/haus-server.tsx), so no prod bundle carries them:
 *
 * - Alt+Shift+Q: React Query Devtools for the Server query cache.
 * - Alt+Shift+R: render log, the top rendering components per second in the
 *   console (the same fiber walk as the App e2e render budgets).
 *
 * Each toggle persists per device until pressed again.
 */
export default function DevPerfTools() {
    const [queryDevtools, toggleQueryDevtools] = useStoredToggle('haus.dev.queryDevtools');
    const [renderLog, toggleRenderLog] = useStoredToggle('haus.dev.renderLog');

    React.useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (!(event.altKey && event.shiftKey) || event.metaKey || event.ctrlKey) {
                return;
            }
            if (event.code === 'KeyQ') {
                event.preventDefault();
                toggleQueryDevtools();
            } else if (event.code === 'KeyR') {
                event.preventDefault();
                toggleRenderLog();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [toggleQueryDevtools, toggleRenderLog]);

    React.useEffect(() => (renderLog ? startRenderLog() : undefined), [renderLog]);

    return queryDevtools ? (
        <React.Suspense fallback={null}>
            <ReactQueryDevtools buttonPosition="bottom-left" initialIsOpen />
        </React.Suspense>
    ) : null;
}

function useStoredToggle(key: string) {
    const [on, setOn] = React.useState(() => readFlag(key));
    const toggle = React.useCallback(() => {
        // Idempotent: StrictMode runs this updater twice in dev.
        setOn((current) => {
            const next = !current;
            try {
                localStorage.setItem(key, next ? 'on' : 'off');
            } catch {
                // Storage can be unavailable; the toggle still works for this page.
            }
            return next;
        });
    }, [key]);
    return [on, toggle] as const;
}

function readFlag(key: string) {
    try {
        return localStorage.getItem(key) === 'on';
    } catch {
        return false;
    }
}
