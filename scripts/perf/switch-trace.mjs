#!/usr/bin/env node
// Profiles ONE chat switch to find where main-thread time goes. Lands on the
// default chat, visits --warmup chats (so the measured switch is warm unless
// --cold), then records the switch to --chat with either a Chrome trace (task
// lengths + Layout/Style/Paint/script totals) or a V8 CPU profile (top self-time
// functions; open the .cpuprofile in DevTools > Performance). Prod bundles keep
// function names readable enough; build with sourcemaps if you need more.
//
// Usage: node scripts/perf/switch-trace.mjs [flags]
//   --chat <name>        switch target (default all)
//   --warmup <a,b>       chats visited first (default product,automations,all)
//   --cold               skip the warmup visit of --chat itself (first visit)
//   --mode trace|cpu     default trace
//   --serve-dist <dir>   prod bundle (recommended); --base <url>; --cpu <n>
//   --out <file>         raw trace/profile (default .perf/switch-<mode>.json|.cpuprofile)
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
    captureAuth,
    defaultBase,
    launchChrome,
    parseArgs,
    perfOutputRoot,
    serveDist,
    sidebarRow,
    throttleCpu,
} from './browser-session.mjs';

const args = parseArgs(process.argv.slice(2));
const base = typeof args.base === 'string' ? args.base : defaultBase();
const distDir = typeof args['serve-dist'] === 'string' ? args['serve-dist'] : null;
const chat = typeof args.chat === 'string' ? args.chat : 'all';
const mode = args.mode === 'cpu' ? 'cpu' : 'trace';
const warmup = (typeof args.warmup === 'string' ? args.warmup : 'product,automations,all')
    .split(',')
    .filter((name) => !(args.cold && name === chat));
const out = path.resolve(
    typeof args.out === 'string'
        ? args.out
        : path.join(perfOutputRoot, mode === 'cpu' ? 'switch.cpuprofile' : 'switch-trace.json')
);
const traceNames = new Set([
    'Layout',
    'UpdateLayoutTree',
    'Paint',
    'PrePaint',
    'Layerize',
    'Commit',
    'FunctionCall',
    'EvaluateScript',
    'TimerFire',
    'FireAnimationFrame',
    'EventDispatch',
    'HitTest',
    'IntersectionObserverController::computeIntersections',
    'ResizeObserverController::BroadcastObservations',
]);

const browser = await launchChrome({ headed: args.headed === true });
const storageState = distDir ? await captureAuth(browser, base) : undefined;
const context = await browser.newContext({ storageState, viewport: { height: 900, width: 1440 } });
if (distDir) {
    await serveDist(context, base, distDir);
}
const page = await context.newPage();
await page.goto(`${base}/`);
await page.waitForSelector('[data-slot="sidebar-menu-item"]', { timeout: 60_000 });
await page.waitForTimeout(3000);
for (const name of warmup) {
    console.log(`warmup ${name}: ${await switchTo(name)}ms`);
}
await throttleCpu(context, page, Number(args.cpu ?? 1));
mkdirSync(path.dirname(out), { recursive: true });
if (mode === 'cpu') {
    await cpuProfile();
} else {
    await trace();
}
await browser.close();

async function trace() {
    await browser.startTracing(page, {
        categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'],
    });
    const ms = await switchTo(chat);
    const buffer = await browser.stopTracing();
    writeFileSync(out, buffer);
    const events = JSON.parse(buffer.toString()).traceEvents.filter((e) => e.ph === 'X' && e.dur);
    const tasks = events.filter((e) => e.name === 'RunTask').map((e) => Math.round(e.dur / 1000));
    const totals = new Map();
    for (const e of events.filter((ev) => traceNames.has(ev.name))) {
        totals.set(e.name, (totals.get(e.name) ?? 0) + e.dur);
    }
    console.log(
        `switch to ${chat}: ${ms}ms; longest tasks ${tasks.sort((a, b) => b - a).slice(0, 6)}`
    );
    for (const [name, us] of [...totals].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${(us / 1000).toFixed(1)}ms ${name}`);
    }
    console.log(`trace: ${out}`);
}

async function cpuProfile() {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
    await cdp.send('Profiler.start');
    const ms = await switchTo(chat);
    const { profile } = await cdp.send('Profiler.stop');
    writeFileSync(out, JSON.stringify(profile));
    const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
    const self = new Map();
    profile.samples.forEach((id, i) => {
        const { callFrame } = nodes.get(id);
        const file = callFrame.url.split('/').pop();
        const key = `${callFrame.functionName || '(anon)'} ${file}:${callFrame.lineNumber}`;
        self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[i] ?? 0));
    });
    console.log(`switch to ${chat}: ${ms}ms; top self time:`);
    const ranked = [...self].filter(([key]) => !key.startsWith('(idle)'));
    for (const [key, us] of ranked.sort((a, b) => b[1] - a[1]).slice(0, 40)) {
        console.log(`  ${(us / 1000).toFixed(1)}ms ${key}`);
    }
    console.log(`profile: ${out}`);
}

// Press the row and resolve on the rAF after the target surface is displayed with rows.
async function switchTo(name) {
    const ms = await page.evaluate(
        (selector) =>
            new Promise((resolve) => {
                const row = document.querySelector(selector);
                const norm = (v) => (v ?? '').replace(/#/g, '').trim().toLowerCase();
                const label = norm(`Message ${row.getAttribute('aria-label')}`);
                const control = row.querySelector('a,button') ?? row;
                const t0 = performance.now();
                const check = () => {
                    const shown = [...document.querySelectorAll('[data-slot="chat-surface"]')].find(
                        (s) =>
                            s.checkVisibility() &&
                            s.querySelector('[data-slot="message-scroller-item"]') &&
                            norm(
                                s
                                    .querySelector('[aria-label^="Message "]')
                                    ?.getAttribute('aria-label')
                            ) === label
                    );
                    if (shown) {
                        requestAnimationFrame(() => resolve(Math.round(performance.now() - t0)));
                        return;
                    }
                    requestAnimationFrame(check);
                };
                control.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                control.click();
                requestAnimationFrame(check);
            }),
        sidebarRow(name)
    );
    await page.waitForTimeout(1200);
    return ms;
}
