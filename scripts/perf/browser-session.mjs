// Shared browser plumbing for the scripts/perf tools: CLI flags, defaults,
// installed-Chrome launch, and the prod-bundle trick.
//
// Prod-bundle trick: a `HAUS_HOSTED_APP=1 vite build` (build-prod-bundle.sh) is
// served by Playwright route interception on the DEV origin. Two reasons it
// cannot run on its own origin: the Server rejects Clerk tokens whose `azp` is
// another origin, and dev auto sign-in is compiled out of prod. So the tools
// sign in once through the dev bundle (`captureAuth`), reuse its cookies, and
// answer every same-origin request from the dist directory except the Server
// paths the Vite dev proxy forwards (/trpc, /api, /healthz, /wiki).
//
// Installed Google Chrome (channel 'chrome') is required: Playwright's bundled
// headless shell gets SIGKILLed in agent sandboxes. Run these tools unsandboxed.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDevPorts } from '../dev-ports.mjs';

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const perfOutputRoot = path.join(repositoryRoot, '.perf');

const websiteRequire = createRequire(path.join(repositoryRoot, 'apps/website/package.json'));
const { chromium } = websiteRequire('@playwright/test');

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

// `--flag value` or bare `--flag` (true). A bare flag never swallows the next `--flag`.
export function parseArgs(list) {
    const options = {};
    for (let i = 0; i < list.length; i++) {
        const key = list[i].replace(/^--/, '');
        const next = list[i + 1];
        options[key] = next !== undefined && !next.startsWith('--') ? list[++i] : true;
    }
    return options;
}

// Default website origin: HAUS_PERF_BASE, else the dev port group this checkout
// resolves (honors HAUS_DEV_PORT_BASE / HAUS_DEV_STACK_ID like the dev stack).
export function defaultBase() {
    if (process.env.HAUS_PERF_BASE) {
        return process.env.HAUS_PERF_BASE;
    }
    const { websitePort } = resolveDevPorts({ repositoryRoot });
    return `http://localhost:${websitePort}`;
}

export function launchChrome({ headed = false } = {}) {
    return chromium.launch({ channel: 'chrome', headless: !headed });
}

export function sidebarRow(name) {
    return `[data-slot="sidebar-menu-item"][aria-label="${name}"]`;
}

// Signs in through the dev bundle (auto sign-in is DEV-only) and returns the
// storage state for prod-bundle contexts on the same origin.
export async function captureAuth(browser, base) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${base}/`);
    await page.waitForSelector('[data-slot="sidebar-menu-item"]', { timeout: 60_000 });
    await page.waitForTimeout(1500);
    const state = await context.storageState();
    await context.close();
    return state;
}

// Serves distDir for same-origin requests; unknown paths get index.html (SPA
// fallback, like `vite preview`). Server paths fall through to the Vite proxy.
export async function serveDist(context, base, distDir) {
    const root = path.resolve(distDir);
    if (!existsSync(path.join(root, 'index.html'))) {
        throw new Error(`${root} has no index.html; run scripts/perf/build-prod-bundle.sh first`);
    }
    await context.route(`${base}/**`, (route) => {
        const url = new URL(route.request().url());
        if (serverPaths.test(url.pathname)) {
            return route.fallback();
        }
        const requested = path.join(root, decodeURIComponent(url.pathname));
        const isFile =
            requested.startsWith(root) && existsSync(requested) && statSync(requested).isFile();
        const file = isFile ? requested : path.join(root, 'index.html');
        const ext = path.extname(file);
        return route.fulfill({
            body: readFileSync(file),
            headers: {
                'cache-control':
                    ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
                'content-type': contentTypes[ext] ?? 'application/octet-stream',
            },
            status: 200,
        });
    });
}

export async function throttleCpu(context, page, rate) {
    if (rate > 1) {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    }
}
