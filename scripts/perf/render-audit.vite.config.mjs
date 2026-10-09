// Vite config for a render-counting prod bundle (scripts/perf/render-audit.mjs).
// Wraps the website config and adds one build-time transform: React DOM's
// `renderWithHooks` calls `globalThis.__hausRenderCount(Component, mounting,
// props, previousProps, currentFiber)` on every function-component render (memo and
// forwardRef included). node_modules stays untouched; the hook is a no-op until
// the audit installs the global. Built by `HAUS_PERF_RENDER_AUDIT=1
// scripts/perf/build-prod-bundle.sh <out-dir>`.
import websiteConfig from '../../apps/website/vite.config.ts';

const reactDomClient = /react-dom[\\/]cjs[\\/]react-dom-client\.production\.js$/;
const renderEntry = `  renderLanes = nextRenderLanes;
  currentlyRenderingFiber = workInProgress;
  workInProgress.memoizedState = null;`;
const counted = `  renderLanes = nextRenderLanes;
  if (globalThis.__hausRenderCount) globalThis.__hausRenderCount(Component, current === null, props, current === null ? null : current.memoizedProps, current);
  currentlyRenderingFiber = workInProgress;
  workInProgress.memoizedState = null;`;

function renderCountPlugin() {
    let instrumented = false;
    return {
        name: 'haus-perf-render-count',
        enforce: 'pre',
        transform(code, id) {
            if (!reactDomClient.test(id)) {
                return null;
            }
            if (code.split(renderEntry).length !== 2) {
                this.error(
                    'React DOM internals changed; update scripts/perf/render-audit.vite.config.mjs'
                );
            }
            instrumented = true;
            return {
                code: code.replace(renderEntry, counted),
                map: null,
            };
        },
        buildEnd() {
            if (!instrumented) {
                this.error('react-dom-client.production.js was never transformed');
            }
        },
    };
}

export default async (env) => {
    const config = typeof websiteConfig === 'function' ? await websiteConfig(env) : websiteConfig;
    return {
        ...config,
        // Unminified so the audit names components; render counts do not depend on it.
        build: { ...config.build, minify: false },
        plugins: [renderCountPlugin(), ...(config.plugins ?? [])],
    };
};
