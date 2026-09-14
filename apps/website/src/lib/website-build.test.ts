import { expect, test } from 'bun:test';
import { mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { appBuildPlugin } from '../../vite-app-build.ts';

test('each website build ships the same unique marker in its renderer and manifest', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-website-build-')));
    try {
        await writeFile(join(root, 'index.html'), '<script type="module" src="/main.js"></script>');
        await writeFile(
            join(root, 'main.js'),
            'window.buildId = import.meta.env.VITE_HAUS_APP_BUILD_ID;'
        );
        const ids = new Set<string>();
        for (let index = 0; index < 2; index += 1) {
            await build({
                root,
                configFile: false,
                logLevel: 'silent',
                plugins: [appBuildPlugin()],
            });
            const manifest = JSON.parse(
                await readFile(join(root, 'dist/haus-app-build.json'), 'utf8')
            );
            const assets = await readdir(join(root, 'dist/assets'));
            const script = assets.find((name) => name.endsWith('.js'));
            expect(script).toBeDefined();
            const renderer = await readFile(join(root, 'dist/assets', script ?? ''), 'utf8');
            expect(renderer).toContain(manifest.buildId);
            ids.add(manifest.buildId);
        }
        expect(ids.size).toBe(2);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
