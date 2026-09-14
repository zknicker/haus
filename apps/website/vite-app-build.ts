import { randomUUID } from 'node:crypto';
import type { Plugin } from 'vite';

/** The marker and renderer are emitted together, independent of release publication. */
export function appBuildPlugin(): Plugin {
    const buildId = randomUUID();
    return {
        name: 'haus-app-build',
        config: () => ({
            define: { 'import.meta.env.VITE_HAUS_APP_BUILD_ID': JSON.stringify(buildId) },
        }),
        configureServer(server) {
            server.middlewares.use('/haus-app-build.json', (_request, response) => {
                response.setHeader('content-type', 'application/json');
                response.setHeader('cache-control', 'no-store');
                response.end(JSON.stringify({ buildId }));
            });
        },
        generateBundle() {
            this.emitFile({
                type: 'asset',
                fileName: 'haus-app-build.json',
                source: JSON.stringify({ buildId }),
            });
        },
    };
}
