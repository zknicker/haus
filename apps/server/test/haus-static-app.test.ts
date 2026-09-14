import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { registerHausStaticApp } from '../src/haus-static-app.ts';

test('website documents and build marker bypass caches across a deployment', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-build-test-'));
    const app = Fastify();
    try {
        await writeFile(join(root, 'index.html'), '<html>first build</html>');
        await writeFile(join(root, 'haus-app-build.json'), JSON.stringify({ buildId: 'first' }));
        await registerHausStaticApp(app, root);
        for (const url of ['/', '/index.html', '/s/home', '/haus-app-build.json']) {
            const result = await app.inject({ url, headers: { accept: 'text/html' } });
            expect(result.statusCode).toBe(200);
            expect(result.headers['cache-control']).toBe('no-store');
        }
        await writeFile(join(root, 'haus-app-build.json'), JSON.stringify({ buildId: 'second' }));
        expect((await app.inject('/haus-app-build.json')).json()).toEqual({ buildId: 'second' });
    } finally {
        await app.close();
        await rm(root, { recursive: true, force: true });
    }
});
