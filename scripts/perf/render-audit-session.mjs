// Electron and sender plumbing for render-audit.mjs (see its header).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { captureAuth, launchChrome, repositoryRoot, sidebarRow } from './browser-session.mjs';
import { installRenderCounter } from './render-audit-counter.mjs';

const websiteRequire = createRequire(path.join(repositoryRoot, 'apps/website/package.json'));
const { _electron } = websiteRequire('@playwright/test');
const serverPaths = /^\/(trpc|api|healthz|wiki)(\/|$)/;
const contentTypes = {
    '.css': 'text/css',
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm',
    '.woff2': 'font/woff2',
};

/** Real Electron on the dev origin, signed in, running the render-count prod bundle. */
export async function launchAuditedElectron({ base, dist, serverPort, source }) {
    const app = await _electron.launch({
        args: ['electron/main.cjs', '--disable-features=LocalNetworkAccessChecks'],
        cwd: path.join(repositoryRoot, 'apps/website'),
        env: {
            ...process.env,
            HAUS_DEV_STACK_ID: process.env.HAUS_RENDER_AUDIT_PROFILE ?? 'perf-render-audit',
            HAUS_ELECTRON_DEV_URL: base,
        },
        // The electron package exports its binary path (run its install.js if missing).
        executablePath: websiteRequire('electron'),
        timeout: 60_000,
    });
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
        const shown = BrowserWindow.getAllWindows()[0];
        shown.setBounds({ height: 900, width: 1440, x: 0, y: 0 });
        shown.show();
    });
    page.on('pageerror', (error) => console.error('pageerror', error.message.slice(0, 200)));
    await page.addInitScript(
        `globalThis.__hausAuditServerPort = ${serverPort}; globalThis.__hausAuditSource = ${JSON.stringify(source ?? null)};`
    );
    await page.addInitScript(installRenderCounter);
    // Dev bundle first: native Clerk signs in; then serve the prod bundle.
    await page.waitForSelector('[data-slot="sidebar-menu-item"]', { timeout: 90_000 });
    await serveDist(page, base, dist);
    await page.reload();
    await page.waitForSelector(sidebarRow('all'), { timeout: 90_000 });
    const prod = await page.evaluate(
        () =>
            !document.querySelector('script[src*="@vite/client"]') && '__hausRenders' in globalThis
    );
    if (!prod) {
        throw new Error('the render-count prod bundle did not load');
    }
    return { app, page };
}

/** browser-session.mjs's serveDist, through CDP Fetch on Electron's webContents. */
async function serveDist(page, base, dist) {
    if (!existsSync(path.join(dist, 'index.html'))) {
        throw new Error(`${dist} has no index.html`);
    }
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Fetch.enable', {
        patterns: [{ requestStage: 'Request', urlPattern: `${base}/*` }],
    });
    cdp.on('Fetch.requestPaused', async ({ request, requestId }) => {
        const url = new URL(request.url);
        if (
            url.origin !== base ||
            serverPaths.test(url.pathname) ||
            url.pathname.startsWith('/@')
        ) {
            await cdp.send('Fetch.continueRequest', { requestId }).catch(() => undefined);
            return;
        }
        const requested = path.join(dist, decodeURIComponent(url.pathname));
        const isFile =
            requested.startsWith(dist) && existsSync(requested) && statSync(requested).isFile();
        const file = isFile ? requested : path.join(dist, 'index.html');
        const ext = path.extname(file);
        const cache = ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable';
        await cdp
            .send('Fetch.fulfillRequest', {
                body: readFileSync(file).toString('base64'),
                requestId,
                responseCode: 200,
                responseHeaders: [
                    {
                        name: 'content-type',
                        value: contentTypes[ext] ?? 'application/octet-stream',
                    },
                    { name: 'cache-control', value: cache },
                ],
            })
            .catch(() => undefined);
    });
}

/**
 * A headless dev-bundle session (same human, another device) that posts
 * messages over HTTP tRPC, so the audited renderer sees only realtime events.
 */
export async function openSender(base) {
    const headers = {
        'x-haus-app-protocol-version': String(readAppProtocolVersion()),
        'x-haus-product-version': 'render-audit',
    };
    const browser = await launchChrome();
    const storageState = await captureAuth(browser, base);
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    await page.goto(`${base}/`);
    await page.waitForSelector('[data-slot="sidebar-menu-item"]', { timeout: 60_000 });
    const targets = await page.evaluate(readTargets, headers);
    return {
        browser,
        async send(name, content) {
            const target = targets.byName[name];
            if (!target) {
                throw new Error(`no chat named ${name}`);
            }
            const input = {
                content: `${content} (${Date.now()})`,
                nonce: `render-audit-${Date.now()}`,
                serverId: targets.serverId,
                ...(typeof target === 'string'
                    ? { chatId: target }
                    : { agentId: target.agentId, targetKind: 'agent-dm' }),
            };
            const status = await page.evaluate(postMessage, { headers, input });
            if (status !== 200) {
                throw new Error(`chat.send answered ${status}`);
            }
        },
    };
}

// In page: channels by name, Agent DMs by Agent name.
async function readTargets(headers) {
    const token = await globalThis.Clerk.session.getToken();
    const authorized = { ...headers, authorization: `Bearer ${token}` };
    const read = (path) => fetch(path, { headers: authorized }).then((response) => response.json());
    const servers = await read('/trpc/server.list');
    const serverId = servers.result.data[0].id;
    const input = encodeURIComponent(JSON.stringify({ serverId }));
    const [chats, agents] = await Promise.all([
        read(`/trpc/chat.list?input=${input}`),
        read(`/trpc/agent.list?input=${input}`),
    ]);
    const byName = {};
    for (const chat of chats.result.data) {
        if (chat.kind === 'channel') {
            byName[chat.name] = chat.id;
        }
    }
    for (const agent of agents.result.data) {
        byName[agent.displayName] = { agentId: agent.id };
    }
    return { byName, serverId };
}

// In page: one `chat.send`.
async function postMessage({ headers, input }) {
    const token = await globalThis.Clerk.session.getToken();
    const response = await fetch('/trpc/chat.send', {
        body: JSON.stringify(input),
        headers: {
            ...headers,
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
        },
        method: 'POST',
    });
    return response.status;
}

function readAppProtocolVersion() {
    const source = readFileSync(
        path.join(repositoryRoot, 'packages/haus-api/src/app-protocol.ts'),
        'utf8'
    );
    const version = /appProtocolVersion = (\d+)/.exec(source)?.[1];
    if (!version) {
        throw new Error('appProtocolVersion not found in packages/haus-api/src/app-protocol.ts');
    }
    return Number(version);
}
