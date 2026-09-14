import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { appBuildPlugin } from './vite-app-build.ts';
import { rejectNodeBuiltins } from './vite-browser-module-guard.ts';

const websiteRoot = path.dirname(fileURLToPath(import.meta.url));
const websitePort = Number(process.env.HAUS_WEBSITE_PORT ?? '3100');
const serverPort = Number(process.env.HAUS_SERVER_PORT ?? '8090');
const serverOrigin = process.env.VITE_HAUS_SERVER_ORIGIN ?? `http://localhost:${serverPort}`;
// Hosted avatar bytes are served by the Haus Server, not the local API. In
// production Haus App shares that origin, so the stored avatar URL stays
// relative; only the dev proxy has to be pointed at the Server explicitly.
const hausServerOrigin = serverOrigin;

const repositoryRoot = path.resolve(websiteRoot, '../..');
const productVersion = readJson<{ version: string }>(
    path.join(repositoryRoot, 'packages/haus-api/haus-product.json')
).version;
const releaseSnapshot = resolveReleaseSnapshot();

export default defineConfig(({ command }) => ({
    base: command === 'build' && process.env.HAUS_HOSTED_APP !== '1' ? './' : '/',
    define: {
        'import.meta.env.VITE_HAUS_PRODUCT_VERSION': JSON.stringify(
            process.env.VITE_HAUS_PRODUCT_VERSION ?? productVersion
        ),
        'import.meta.env.VITE_HAUS_RELEASE_SNAPSHOT': JSON.stringify(releaseSnapshot),
    },
    plugins: [appBuildPlugin(), rejectNodeBuiltins(), tailwindcss(), react()],
    resolve: {
        alias: {
            '@': path.join(websiteRoot, 'src'),
        },
    },
    server: {
        port: websitePort,
        strictPort: true,
        proxy: {
            '/api/avatars': {
                target: hausServerOrigin,
            },
            '/api/haus-release': {
                target: hausServerOrigin,
            },
            '/healthz': {
                target: serverOrigin,
            },
            '/trpc': {
                target: serverOrigin,
                ws: true,
            },
            '/wiki/attachments': {
                target: serverOrigin,
            },
        },
    },
}));

function resolveReleaseSnapshot() {
    const ledger = readJson<
        Array<{
            date: string;
            targets: Record<string, null | string | { buildNumber: number; version: string }>;
            version: string | null;
        }>
    >(path.join(repositoryRoot, 'releases.json'));
    const latest = ledger.at(-1);
    if (!latest) {
        throw new Error('releases.json must contain a release');
    }
    if (!latest.version) {
        throw new Error('latest releases.json entry must have a Haus version');
    }
    const target = (name: string) => {
        for (let index = ledger.length - 1; index >= 0; index -= 1) {
            const value = ledger[index]?.targets[name];
            if (value) {
                return value;
            }
        }
        return null;
    };
    const ios = target('ios');
    return {
        components: {
            agent: target('agent'),
            computer: target('computer'),
            desktopApp: target('app'),
            ios: typeof ios === 'object' ? ios : null,
            server: target('server'),
        },
        date: latest.date,
        schemaVersion: 1,
        sourceRevision:
            process.env.HAUS_SOURCE_REVISION ?? '0000000000000000000000000000000000000000',
        version: latest.version,
    };
}

function readJson<T>(filePath: string): T {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}
