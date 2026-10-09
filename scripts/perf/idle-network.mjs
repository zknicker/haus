#!/usr/bin/env node
// Idle network audit: what the App sends while nobody touches it.
// Process and past results: .agents/skills/perf-haus-app/SKILL.md ("Idle traffic").
//
// Usage: node scripts/perf/idle-network.mjs [flags]
//   --scenario <name>   channel (default) | inbox | profile | hide-show | ws-drop | offline-online
//                       channel/inbox/profile: land there and sit idle.
//                       hide-show: channel, hidden for half the window, then shown.
//                       ws-drop: channel; every App socket is closed at the midpoint.
//                       offline-online: channel; the browser goes offline for 5s at the midpoint.
//   --seconds <n>       measured window after the page settles. Default 180.
//   --channel <name>    sidebar channel to idle on. Default product.
//   --serve-dist <dir>  prod bundle on the dev origin (scripts/perf/build-prod-bundle.sh).
//   --electron          drive the desktop App (dev bundle) through Playwright _electron
//                       against the same dev stack instead of Chrome.
//   --base <url>        website origin. Default HAUS_PERF_BASE, else this checkout's port group.
//   --json <file>       also write the raw log and counts as JSON.
//   --headed            show the browser.
//
// Logs every HTTP tRPC request (procedure names split out of batched URLs), every
// other same-origin fetch, and each App WebSocket's opens, closes, subscription
// starts, and in-place session refreshes; then prints per-procedure counts per
// minute. "Idle" means after a settle period, so first-load reads are excluded.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
    captureAuth,
    defaultBase,
    launchChrome,
    parseArgs,
    repositoryRoot,
    serveDist,
    sidebarRow,
} from './browser-session.mjs';

const args = parseArgs(process.argv.slice(2));
const scenario = typeof args.scenario === 'string' ? args.scenario : 'channel';
const seconds = Number(args.seconds ?? 180);
const channel = typeof args.channel === 'string' ? args.channel : 'product';
const base = typeof args.base === 'string' ? args.base : defaultBase();
const distDir = typeof args['serve-dist'] === 'string' ? path.resolve(args['serve-dist']) : null;
const scenarios = ['channel', 'inbox', 'profile', 'hide-show', 'ws-drop', 'offline-online'];
if (!scenarios.includes(scenario)) {
    throw new Error(`unknown --scenario ${scenario}; one of ${scenarios.join(', ')}`);
}

const events = [];
let windowStart = null;
const now = () => Date.now();
const record = (kind, detail = {}) => {
    if (windowStart !== null) {
        events.push({ at: now() - windowStart, kind, ...detail });
    }
};

const session = args.electron === true ? await openElectron() : await openChrome();
const { page } = session;
await page.addInitScript(socketRecorder);
watchNetwork(page);

await page.goto(`${base}/`);
await page.waitForSelector('[data-slot="sidebar-menu-item"]', { timeout: 60_000 });
await openScenarioView(page);
// First-load reads, prefetch, and the first session-watch tick land here, not in the window.
await page.waitForTimeout(15_000);

windowStart = now();
console.error(`[idle] ${scenario} for ${seconds}s on ${page.url()}`);
await runScenario(page);
const measuredSeconds = (now() - windowStart) / 1000;
windowStart = null;
await session.close();

report(measuredSeconds);

async function openChrome() {
    const browser = await launchChrome({ headed: args.headed === true });
    browser.on('disconnected', () => abandon('Chrome exited mid-run'));
    const storageState = distDir ? await captureAuth(browser, base) : undefined;
    const context = await browser.newContext({
        storageState,
        viewport: { height: 900, width: 1440 },
    });
    if (distDir) {
        await serveDist(context, base, distDir);
    }
    const page = await context.newPage();
    return {
        close: () => browser.close(),
        page,
        setOffline: (offline) => context.setOffline(offline),
    };
}

async function openElectron() {
    const websiteRoot = path.join(repositoryRoot, 'apps/website');
    const websiteRequire = createRequire(path.join(websiteRoot, 'package.json'));
    const { _electron } = websiteRequire('@playwright/test');
    // Electron must not inherit the dev-port vars, or its quit cleanup stops the stack's Vite.
    const { HAUS_WEBSITE_PORT: _websitePort, ...inherited } = process.env;
    const env = {
        ...inherited,
        HAUS_DEV_STACK_ID: `idle-network-${now()}`,
        HAUS_ELECTRON_DEV_URL: base,
    };
    const app = await _electron.launch({
        args: ['electron/main.cjs'],
        cwd: websiteRoot,
        env,
        executablePath: websiteRequire('electron'),
    });
    app.on('close', () => abandon('Electron exited mid-run'));
    const page = await app.firstWindow();
    return {
        close: () => app.close(),
        page,
        setOffline: (offline) => page.context().setOffline(offline),
    };
}

async function openScenarioView(target) {
    if (scenario === 'inbox') {
        // The desktop App routes by hash (`/#/s/<slug>/...`), the web by path.
        const url = new URL(target.url());
        const route = url.hash.startsWith('#/') ? url.hash.slice(1) : url.pathname;
        const inbox = route.replace(/^(\/s\/[^/]+).*$/u, '$1/inbox');
        await target.evaluate(
            ([href, useHash]) => {
                if (useHash) {
                    location.hash = href;
                    return;
                }
                history.pushState(null, '', href);
                dispatchEvent(new PopStateEvent('popstate'));
            },
            [inbox, url.hash.startsWith('#/')]
        );
        await target.waitForTimeout(2000);
        return;
    }
    await target.click(sidebarRow(channel));
    await target.waitForTimeout(2000);
    if (scenario === 'profile') {
        await target
            .getByRole('button', { name: /^Open .+'s profile$/ })
            .first()
            .click();
        await target.waitForURL(/\/agents\//, { timeout: 15_000 });
    }
}

async function runScenario(target) {
    const half = (seconds * 1000) / 2;
    if (scenario === 'hide-show') {
        await setVisibility(target, 'hidden');
        record('hidden');
        await target.waitForTimeout(half);
        await setVisibility(target, 'visible');
        record('visible');
        await target.waitForTimeout(half);
        return;
    }
    if (scenario === 'ws-drop') {
        await target.waitForTimeout(half);
        record('drop', { sockets: await target.evaluate(() => window.__idleDropSockets()) });
        await target.waitForTimeout(half);
        return;
    }
    if (scenario === 'offline-online') {
        await target.waitForTimeout(half);
        record('offline');
        await session.setOffline(true);
        await target.waitForTimeout(5000);
        await session.setOffline(false);
        record('online');
        await target.waitForTimeout(half - 5000);
        return;
    }
    await target.waitForTimeout(seconds * 1000);
}

// A browser that dies mid-window would otherwise leave the run waiting forever.
function abandon(reason) {
    if (windowStart !== null) {
        console.error(`[idle] ${reason}; discard this run`);
        process.exit(2);
    }
}

function setVisibility(target, state) {
    return target.evaluate((next) => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: next });
        Object.defineProperty(document, 'hidden', {
            configurable: true,
            value: next === 'hidden',
        });
        document.dispatchEvent(new Event('visibilitychange'));
    }, state);
}

function watchNetwork(target) {
    target.on('request', (request) => {
        const url = new URL(request.url());
        if (request.resourceType() === 'websocket' || !url.protocol.startsWith('http')) {
            return;
        }
        // A dev bundle (Electron included) may call the Server port directly.
        if (url.pathname.startsWith('/trpc/')) {
            record('http-batch');
            for (const procedure of url.pathname.slice('/trpc/'.length).split(',')) {
                record('trpc', { procedure: decodeURIComponent(procedure) });
            }
            return;
        }
        if (
            url.origin === new URL(base).origin &&
            ['fetch', 'xhr'].includes(request.resourceType())
        ) {
            record('fetch', { procedure: `GET ${url.pathname}` });
        }
    });
    target.on('websocket', (socket) => {
        if (!new URL(socket.url()).pathname.startsWith('/trpc')) {
            return;
        }
        record('ws-open');
        socket.on('close', () => record('ws-close'));
        socket.on('framesent', ({ payload }) => {
            for (const message of parseFrames(payload)) {
                if (message.method === 'subscription') {
                    record('ws-subscribe', { procedure: message.params?.path });
                } else if (message.method === 'mutation' || message.method === 'query') {
                    record('ws-call', { procedure: message.params?.path });
                }
            }
        });
    });
}

function parseFrames(payload) {
    if (typeof payload !== 'string' || !(payload.startsWith('{') || payload.startsWith('['))) {
        return [];
    }
    try {
        const parsed = JSON.parse(payload);
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
        return [];
    }
}

// Runs in the page: keeps every App socket so ws-drop can close them like a network blip.
function socketRecorder() {
    const sockets = new Set();
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
        constructor(...socketArgs) {
            super(...socketArgs);
            sockets.add(this);
            this.addEventListener('close', () => sockets.delete(this));
        }
    };
    window.__idleDropSockets = () => {
        const open = [...sockets].filter((socket) => new URL(socket.url).pathname === '/trpc');
        for (const socket of open) {
            socket.close();
        }
        return open.length;
    };
}

function report(measured) {
    const minutes = measured / 60;
    const counts = new Map();
    for (const event of events) {
        const key = `${event.kind} ${event.procedure ?? ''}`.trim();
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const http = events.filter((event) => event.kind === 'trpc').length;
    const batches = events.filter((event) => event.kind === 'http-batch').length;
    const rows = [...counts]
        .sort((a, b) => b[1] - a[1])
        .map(
            ([key, count]) =>
                `${(count / minutes).toFixed(2).padStart(7)}/min ${String(count).padStart(4)}  ${key}`
        );
    const target = args.electron === true ? 'electron' : distDir ? 'prod' : 'dev';
    console.log(`scenario ${scenario} (${target}), ${measured.toFixed(0)}s measured`);
    console.log(
        `HTTP tRPC: ${batches} requests (${(batches / minutes).toFixed(2)}/min), ${http} procedures (${(http / minutes).toFixed(2)}/min)`
    );
    console.log(rows.join('\n') || '  (no traffic)');
    const marks = events.filter(
        (event) => !['fetch', 'http-batch', 'trpc', 'ws-call'].includes(event.kind)
    );
    for (const mark of marks) {
        console.log(`  @${(mark.at / 1000).toFixed(1)}s ${mark.kind} ${mark.procedure ?? ''}`);
    }
    if (typeof args.json === 'string') {
        writeFileSync(
            args.json,
            JSON.stringify(
                { base, counts: Object.fromEntries(counts), events, measured, scenario, target },
                null,
                2
            )
        );
    }
}
