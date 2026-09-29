import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { _electron, expect } from '@playwright/test';

const websiteRoot = fileURLToPath(new URL('../', import.meta.url));
const electronPath = process.env.HAUS_ELECTRON_EXECUTABLE ?? (await import('electron')).default;
const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(
        `<title>${request.url === '/' ? 'Haus test' : 'Browser test'}</title><h1>${request.url}</h1><a href="/two" target="_blank">Popup</a>`
    );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
let app;
try {
    app = await _electron.launch({
        args: ['electron/main.cjs'],
        cwd: websiteRoot,
        executablePath: electronPath,
        env: {
            ...process.env,
            HAUS_ELECTRON_DEV_URL: url,
            HAUS_CLERK_ISSUER_URL: 'https://clerk.browser-smoke.test',
            HAUS_DEV_STACK_ID: `browser-smoke-${Date.now()}`,
        },
    });
    const page = await app.firstWindow();
    await page.waitForFunction(() => Boolean(window.hausDesktop?.browserCommand));
    await page.evaluate(() => window.hausDesktop.browserCommand({ kind: 'mount' }));
    await page.evaluate(
        (address) => window.hausDesktop.browserCommand({ kind: 'open', url: `${address}/one` }),
        url
    );
    const snapshot = () => page.evaluate(() => window.hausDesktop.browserSnapshot());
    await expect.poll(async () => (await snapshot()).tabs[0]?.title).toBe('Browser test');
    await page.evaluate(() =>
        window.hausDesktop.browserBounds({ x: 250, y: 100, width: 700, height: 500 })
    );
    const isolated = await app.evaluate(async ({ webContents }) => {
        const contents = webContents
            .getAllWebContents()
            .find((item) => item.getURL().endsWith('/one'));
        return {
            bridge: await contents.executeJavaScript('typeof window.hausDesktop'),
            node: await contents.executeJavaScript('typeof require'),
            partition:
                contents.session !==
                webContents.getAllWebContents().find((item) => item.getURL().endsWith('/')).session,
        };
    });
    assert.deepEqual(isolated, { bridge: 'undefined', node: 'undefined', partition: true });
    await app.evaluate(async ({ webContents }) => {
        const contents = webContents
            .getAllWebContents()
            .find((item) => item.getURL().endsWith('/one'));
        await contents.executeJavaScript(
            "document.cookie = 'haus_browser_smoke=1; path=/'; document.querySelector('a').click()"
        );
    });
    await expect.poll(async () => (await snapshot()).tabs.length).toBe(2);
    await expect.poll(async () => (await snapshot()).tabs.every((tab) => !tab.loading)).toBe(true);
    const cookies = await app.evaluate(async ({ webContents }) =>
        webContents
            .getAllWebContents()
            .find((item) => item.getURL().endsWith('/two'))
            .executeJavaScript('document.cookie')
    );
    assert.match(cookies, /haus_browser_smoke=1/);
    await page.evaluate(
        (address) =>
            window.hausDesktop.browserCommand({
                kind: 'navigate',
                action: 'url',
                url: `${address}/three`,
            }),
        url
    );
    await expect
        .poll(async () =>
            (await snapshot()).tabs.some((tab) => tab.url.endsWith('/three') && tab.canGoBack)
        )
        .toBe(true);
    await page.evaluate(() =>
        window.hausDesktop.browserCommand({ kind: 'navigate', action: 'back' })
    );
    await expect
        .poll(async () =>
            (await snapshot()).tabs.some((tab) => tab.url.endsWith('/two') && tab.canGoForward)
        )
        .toBe(true);
    const order = (await snapshot()).tabs.map((tab) => tab.id).reverse();
    await page.evaluate(
        (ids) => window.hausDesktop.browserCommand({ kind: 'reorder', ids }),
        order
    );
    assert.deepEqual(
        (await snapshot()).tabs.map((tab) => tab.id),
        order
    );
    await page.evaluate(async () => {
        await window.hausDesktop.browserCommand({ kind: 'new' });
        await window.hausDesktop.browserCommand({ kind: 'new' });
    });
    assert.equal((await snapshot()).tabs.length, 4);
    await expect.poll(async () => (await snapshot()).tabs.every((tab) => !tab.loading)).toBe(true);
    assert.equal((await snapshot()).tabs.filter((tab) => tab.title === 'New tab').length, 2);
    await page.evaluate(() => window.hausDesktop.browserCommand({ kind: 'reset' }));
    assert.deepEqual(await snapshot(), { activeId: null, tabs: [] });
    console.log(
        'PASS: real Electron browsing, isolated preload/session, website cookies, popup tabs, history, reordering, fresh tabs and cleanup'
    );
} finally {
    await app?.close();
    await new Promise((resolve) => server.close(resolve));
}
