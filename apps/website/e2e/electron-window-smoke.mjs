// Headless smoke for File > New Window plumbing: launches the real Electron app against a
// plain Vite dev server, verifies that openWindow spawns a second BrowserWindow seeded at
// the requested route and that closeWindow (the last-tab-close path) closes it. Tear-off
// and cross-window drag are out (ADR 0039). No backend required. Run with node (bun
// stalls on the Electron inspector handshake): node e2e/electron-window-smoke.mjs
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { _electron } from '@playwright/test';
import electronPath from 'electron';

const websiteRoot = fileURLToPath(new URL('../', import.meta.url));
const seededRoute = '/s/electron-smoke';

function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            server.close((error) => (error ? reject(error) : resolve(port)));
        });
        server.on('error', reject);
    });
}

async function waitForHttp(url, deadlineMs) {
    const deadline = Date.now() + deadlineMs;
    while (Date.now() < deadline) {
        try {
            await fetch(url);
            return;
        } catch {
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
    }
    throw new Error(`Vite dev server never came up at ${url}`);
}

const port = await getFreePort();
const viteUrl = `http://localhost:${port}`;
const vite = spawn('bun', ['run', 'dev'], {
    cwd: websiteRoot,
    env: { ...process.env, HAUS_WEBSITE_PORT: String(port) },
    stdio: 'ignore',
});

// Electron must not inherit the dev-port vars or its quit-cleanup would kill our Vite.
// A smoke-scoped stack id keeps this instance off a running dev app's single-instance lock.
const electronEnv = {
    ...process.env,
    HAUS_CLERK_ISSUER_URL: 'https://clerk.window-smoke.test',
    HAUS_DEV_STACK_ID: `window-smoke-${Date.now()}`,
    HAUS_ELECTRON_DEV_URL: viteUrl,
};
for (const key of ['HAUS_WEBSITE_PORT']) {
    delete electronEnv[key];
}

let app;
let failed = false;
try {
    await waitForHttp(viteUrl, 30_000);

    app = await _electron.launch({
        args: ['electron/main.cjs'],
        cwd: websiteRoot,
        env: electronEnv,
        executablePath: electronPath,
    });

    const first = await app.firstWindow();
    await first.waitForFunction(() => Boolean(window.hausDesktop), null, { timeout: 20_000 });

    await first.evaluate((route) => window.hausDesktop.openWindow(route), seededRoute);

    const deadline = Date.now() + 15_000;
    while (app.windows().length < 2 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const windows = app.windows();
    assert(windows.length === 2, `expected 2 windows, saw ${windows.length}`);

    const second = windows.find((page) => page !== first);
    await second.waitForLoadState('domcontentloaded');
    assert(
        second.url().includes(seededRoute),
        `second window url ${second.url()} should include ${seededRoute}`
    );

    console.log('PASS: openWindow spawned a second window seeded at', seededRoute);

    // closeWindow drops the calling window (the last-tab-close path on desktop).
    await second.waitForFunction(() => Boolean(window.hausDesktop), null, { timeout: 20_000 });
    await second.evaluate(() => window.hausDesktop.closeWindow());
    await waitForWindowCount(app, 1);
    assert(
        app.windows().length === 1,
        `expected 1 window after close, saw ${app.windows().length}`
    );
    console.log('PASS: closeWindow closed the second window');
} catch (error) {
    failed = true;
    console.error('FAIL:', error instanceof Error ? error.message : error);
} finally {
    await app?.close().catch(() => {});
    vite.kill('SIGTERM');
}

process.exit(failed ? 1 : 0);

async function waitForWindowCount(app, count) {
    const deadline = Date.now() + 15_000;
    while (app.windows().length !== count && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}
