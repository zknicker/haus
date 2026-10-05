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
    await page.evaluate(() => {
        window.__openRequests = [];
        window.hausDesktop.onBrowserOpenRequest((request) => window.__openRequests.push(request));
        return window.hausDesktop.browserCommand({ kind: 'mount' });
    });
    await page.evaluate(
        (address) =>
            window.hausDesktop.browserCommand({
                kind: 'open',
                url: `${address}/one`,
                viewId: 'one',
            }),
        url
    );
    const snapshot = () => page.evaluate(() => window.hausDesktop.browserSnapshot());
    await expect.poll(async () => (await snapshot()).tabs[0]?.title).toBe('Browser test');
    await page.evaluate(() =>
        window.hausDesktop.browserLayout([
            { viewId: 'one', bounds: { x: 250, y: 100, width: 700, height: 500 }, focused: true },
        ])
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
    // The popup asks the App for a tab beside its opener; the App then opens the named view.
    await expect.poll(() => page.evaluate(() => window.__openRequests.length)).toBe(1);
    const [request] = await page.evaluate(() => window.__openRequests);
    assert.deepEqual(request, { url: `${url}/two`, openerId: 'one', background: false });
    await page.evaluate(
        (target) => window.hausDesktop.browserCommand({ kind: 'open', url: target, viewId: 'two' }),
        request.url
    );
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
                id: 'two',
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
        window.hausDesktop.browserCommand({ kind: 'navigate', action: 'back', id: 'two' })
    );
    await expect
        .poll(async () =>
            (await snapshot()).tabs.some((tab) => tab.url.endsWith('/two') && tab.canGoForward)
        )
        .toBe(true);
    // ⌘T opens the App's new tab page (no view); a web tab opens its view by name and URL.
    await page.evaluate(async (address) => {
        await window.hausDesktop.browserCommand({
            kind: 'open',
            url: `${address}/three`,
            viewId: 'three',
        });
        await window.hausDesktop.browserCommand({
            kind: 'open',
            url: `${address}/four`,
            viewId: 'four',
        });
        // A remounted tab page re-opens its view by name: same live page, no second view.
        await window.hausDesktop.browserCommand({
            kind: 'open',
            url: `${address}/elsewhere`,
            viewId: 'three',
        });
    }, url);
    assert.equal((await snapshot()).tabs.length, 4);
    await expect.poll(async () => (await snapshot()).tabs.every((tab) => !tab.loading)).toBe(true);
    assert.ok(
        (await snapshot()).tabs.some((tab) => tab.id === 'three' && tab.url.endsWith('/three'))
    );
    await page.evaluate(() => window.hausDesktop.browserCommand({ kind: 'close', id: 'four' }));
    assert.deepEqual(
        (await snapshot()).tabs.map((tab) => tab.id),
        ['one', 'two', 'three']
    );
    // Tab menu: items follow the focused window's report; View's sidebar label follows it too.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.focus());
    await page.evaluate(() =>
        window.hausDesktop.reportMenuState({
            sidebarOpen: false,
            tabs: {
                duplicate: true,
                moveToNewWindow: true,
                moveToOtherPane: false,
                selectOther: true,
            },
        })
    );
    const menu = () =>
        app.evaluate(({ Menu }) =>
            Object.fromEntries(
                Menu.getApplicationMenu()
                    .items.filter((item) => ['Tab', 'View'].includes(item.label))
                    .flatMap((item) => item.submenu.items)
                    .filter((item) => item.label)
                    .map((item) => [item.label, item.enabled])
            )
        );
    await expect.poll(async () => (await menu())['Move Tab to New Window']).toBe(true);
    assert.equal((await menu())['Move Tab to Other Pane'], false);
    assert.equal((await menu())['Show Sidebar'], true);
    // Move to new window: a new window takes the tab's live view before the call resolves.
    const tab = {
        history: {
            entries: [
                {
                    key: 'k',
                    location: { kind: 'browser', title: 'x', url: `${url}/three`, viewId: 'three' },
                    pageState: {},
                },
            ],
            index: 0,
        },
        id: 'tab-three',
    };
    const moved = await page.evaluate(
        (bundle) => window.hausDesktop.tabMoveToNewWindow({ bundle, route: '/', serverId: 'acme' }),
        { activeTabId: tab.id, tabs: [tab] }
    );
    assert.equal(moved, true);
    assert.deepEqual(
        (await snapshot()).tabs.map((item) => item.id),
        ['one', 'two']
    );
    assert.equal(
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
        2
    );
    await page.evaluate(() => window.hausDesktop.browserCommand({ kind: 'reset' }));
    assert.deepEqual(await snapshot(), { tabs: [] });
    console.log(
        'PASS: real Electron browsing, App-named views, isolated preload/session, website cookies, popup open requests, history, named view reopen, Tab menu state, move to new window, close and cleanup'
    );
} finally {
    await app?.close();
    await new Promise((resolve) => server.close(resolve));
}
