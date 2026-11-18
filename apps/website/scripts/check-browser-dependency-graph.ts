import { build, type InlineConfig } from 'vite';
import { rejectNodeBuiltins } from '../vite-browser-module-guard.ts';

const apiRootEntry = decodeURIComponent(
    new URL('../../../packages/haus-api/src/index.ts', import.meta.url).pathname
);

await buildBrowserEntry(apiRootEntry);
await expectBuildFailure(
    'virtual:node-only-entry',
    'Node-only module node:crypto reached the Website browser graph'
);
await expectBuildFailure(
    'virtual:node-config-entry',
    'No known conditions for "./node/config" specifier'
);

console.log('Website browser dependency boundary passed');

async function expectBuildFailure(entry: string, expectedMessage: string) {
    try {
        await buildBrowserEntry(entry);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes(expectedMessage)) {
            return;
        }
        throw error;
    }

    throw new Error(`Expected the browser build to fail with: ${expectedMessage}`);
}

function buildBrowserEntry(entry: string) {
    const config: InlineConfig = {
        build: {
            lib: {
                entry,
                formats: ['es'],
            },
            write: false,
        },
        configFile: false,
        logLevel: 'silent',
        plugins: [
            {
                name: 'node-only-test-entry',
                resolveId(source) {
                    if (source.endsWith('/virtual:node-only-entry')) {
                        return '\0virtual:node-only-entry';
                    }
                    if (source.endsWith('/virtual:node-config-entry')) {
                        return '\0virtual:node-config-entry';
                    }
                },
                load(id) {
                    if (id === '\0virtual:node-only-entry') {
                        return "export { createHash } from 'node:crypto';";
                    }
                    if (id === '\0virtual:node-config-entry') {
                        return "export * from '@haus/api/node/config';";
                    }
                },
            },
            rejectNodeBuiltins(),
        ],
    };

    return build(config);
}
