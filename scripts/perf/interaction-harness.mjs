#!/usr/bin/env node
// Haus App interaction perf harness: channel/DM switch and Agent profile open,
// measured from a real pointerdown in installed Chrome against a running dev stack.
// Process, metric definitions, and past results: .agents/skills/perf-haus-app/SKILL.md.
//
// Usage: bun run perf:web [flags]      (= node scripts/perf/interaction-harness.mjs)
//   --target dev|prod   dev = Vite dev bundle (2-3x inflated); prod = built bundle
//                       served on the dev origin (default dist .perf/dist-prod; build it
//                       with scripts/perf/build-prod-bundle.sh). Default dev.
//   --serve-dist <dir>  prod bundle directory (implies --target prod).
//   --base <url>        website origin. Default HAUS_PERF_BASE, else this checkout's dev
//                       port group (honors HAUS_DEV_PORT_BASE / HAUS_DEV_STACK_ID).
//   --reps <n>          fresh browser contexts (cold caches each rep). Default 3.
//   --cpu <n>           CDP CPU throttling rate; 4 amplifies main-thread cost. Default 1.
//   --channels [a,b]    bare = channel/DM passes only; with names = which channels
//                       (default all,product,automations).
//   --dms <a,b>         DM rows by sidebar label. Default Tiny,Blippy.
//   --agents [A,B]      bare = profile passes only; with names = which Agents
//                       (default Blippy,Tiny). --profile-from <channel> (default product).
//   --quiet             silence progress logs.  --quiet-ms <n> stable window (default 300).
//   --timeout <ms>      per-interaction cap (default 10000).  --headed  show the browser.
//   --out <file>        result JSON. Default .perf/results-<target>-cpu<n>.json.
//
// Per rep: land on the default chat, switch to every channel/DM once ("cold" = first
// visit this session) then again ("warm" = revisit, kept-alive view), then open Agent
// profiles from a message avatar: "first" = first profile this session, "cold" =
// another Agent's first open, "warm" = reopen. Each interaction hovers ~120ms (a real
// cursor dwells, so hover prefetch counts), presses, and polls until the required
// regions are displayed and [data-slot=app-layout-main] has had no childList /
// characterData mutation for --quiet-ms. summarize.mjs and compare.mjs read the JSON.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
import { shapeSample } from './sample-shape.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const args = parseArgs(process.argv.slice(2));
const list = (value, fallback) => (typeof value === 'string' ? value : fallback).split(',');
const distDir =
    typeof args['serve-dist'] === 'string'
        ? path.resolve(args['serve-dist'])
        : args.target === 'prod'
          ? path.join(perfOutputRoot, 'dist-prod')
          : null;
const target = distDir ? 'prod' : 'dev';
const base = typeof args.base === 'string' ? args.base : defaultBase();
const reps = Number(args.reps ?? 3);
const cpu = Number(args.cpu ?? 1);
const QUIET_MS = Number(args['quiet-ms'] ?? 300);
const LOG = args.quiet !== true;
const TIMEOUT = Number(args.timeout ?? 10_000);
const CHANNELS = list(args.channels, 'all,product,automations');
const DMS = list(args.dms, 'Tiny,Blippy');
const AGENTS = list(args.agents, 'Blippy,Tiny');
const CHANNELS_ONLY = args.channels === true;
const AGENTS_ONLY = args.agents === true;
const PROFILE_FROM = args['profile-from'] ?? 'product';
const out = path.resolve(
    typeof args.out === 'string'
        ? args.out
        : path.join(perfOutputRoot, `results-${target}-cpu${cpu}.json`)
);
const probeSources = ['interaction-probe-scenarios.js', 'interaction-probe.js'].map((f) =>
    readFileSync(path.join(here, f), 'utf8')
);

const browser = await launchChrome({ headed: args.headed === true });
const storageState = distDir ? await captureAuth(browser, base) : undefined;
const runs = [];
for (let rep = 0; rep < reps; rep++) {
    const started = Date.now();
    const samples = await runRep(rep);
    runs.push({ rep, samples });
    log(`rep ${rep + 1}/${reps}: ${samples.length} samples in ${seconds(started)}s`);
}
await browser.close();
mkdirSync(path.dirname(out), { recursive: true });
const result = { at: new Date().toISOString(), base, cpu, quietMs: QUIET_MS, reps, runs, target };
writeFileSync(out, JSON.stringify(result, null, 2));
const flagged = runs.flatMap((r) => r.samples).filter((s) => s.timedOut || s.missing.length);
console.error(`wrote ${out} (${flagged.length} samples timed out or missing regions)`);

async function runRep(rep) {
    const context = await browser.newContext({
        storageState,
        viewport: { height: 900, width: 1440 },
    });
    for (const source of probeSources) {
        await context.addInitScript(source);
    }
    if (distDir) {
        await serveDist(context, base, distDir);
    }
    const page = await context.newPage();
    page.on('pageerror', (e) => console.error('pageerror', e.message.slice(0, 200)));
    await page.goto(`${base}/`);
    await page.waitForSelector('[data-slot="sidebar-menu-item"]', { timeout: 60_000 });
    await page.waitForSelector('[data-slot="app-layout-main"] header', { timeout: 60_000 });
    await settle(page, 1500, 25_000);
    await throttleCpu(context, page, cpu);
    const samples = [...(await chatPasses(page, rep)), ...(await profilePasses(page, rep))];
    await context.close();
    return samples;
}

async function chatPasses(page, rep) {
    if (AGENTS_ONLY) {
        return [];
    }
    const samples = [];
    const visited = new Set([new URL(page.url()).pathname]);
    const plan = [
        ...CHANNELS.map((name) => ({ kind: 'channel', name })),
        ...DMS.map((name) => ({ kind: 'dm', name })),
    ];
    for (const pass of ['cold', 'warm']) {
        for (const { kind, name } of plan) {
            const href = await page.getAttribute(sidebarRow(name), 'data-href');
            if (pass === 'cold' && visited.has(href)) {
                continue; // the landing chat is already warm
            }
            samples.push({ kind, pass, rep, ...(await switchChat(page, name, href)) });
            visited.add(href);
        }
    }
    return samples;
}

// Open from a channel via the message avatar, go back, reopen the first Agent (warm).
async function profilePasses(page, rep) {
    if (CHANNELS_ONLY) {
        return [];
    }
    const samples = [];
    const seen = new Set();
    for (const agent of [...AGENTS, AGENTS[0]]) {
        const fromHref = await page.getAttribute(sidebarRow(PROFILE_FROM), 'data-href');
        await switchChat(page, PROFILE_FROM, fromHref);
        const pass = seen.has(agent) ? 'warm' : seen.size === 0 ? 'first' : 'cold';
        samples.push({ kind: 'profile', pass, rep, ...(await openProfile(page, agent)) });
        seen.add(agent);
    }
    return samples;
}

async function switchChat(page, name, href) {
    const row = page.locator(sidebarRow(name));
    await row.scrollIntoViewIfNeeded();
    await page.evaluate(([s, p]) => window.__perfArm(s, p), ['channel', { name }]);
    const required = ['header', 'firstRow'];
    const raw = await press(page, row, required);
    return { href, label: name, ...shapeSample(raw, required, (n) => n.url.includes(href)) };
}

async function openProfile(page, agent) {
    const avatar = await visibleAvatar(page, agent);
    await page.evaluate(([s, p]) => window.__perfArm(s, p), ['profile', { name: agent }]);
    const required = ['identity', 'hubCards', 'chatRows'];
    const raw = await press(page, avatar, required);
    return { label: agent, ...shapeSample(raw, required, (n) => n.url.includes('/agents/')) };
}

async function visibleAvatar(page, agent) {
    const buttons = page.getByRole('button', { name: `Open ${agent}'s profile` });
    for (let i = (await buttons.count()) - 1; i >= 0; i--) {
        const box = await buttons.nth(i).boundingBox();
        if (box && box.y > 60 && box.y + box.height < 820) {
            return buttons.nth(i);
        }
    }
    throw new Error(`no visible avatar for ${agent} in #${PROFILE_FROM}`);
}

// Hover ~120ms, then pointerdown/up; poll until required regions are seen and the
// main pane has been quiet for QUIET_MS.
async function press(page, locator, required) {
    const box = await locator.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 2 });
    await page.waitForTimeout(120);
    await page.mouse.down();
    await page.mouse.up();
    const started = Date.now();
    while (Date.now() - started <= TIMEOUT) {
        await page.waitForTimeout(50);
        const s = await page.evaluate(() => window.__perfStatus());
        const ready = s.t0 !== null && required.every((k) => s.seen[k]);
        if (ready && s.quietFor >= QUIET_MS && s.sinceT0 > QUIET_MS) {
            break;
        }
    }
    const raw = await page.evaluate(() => window.__perfCollect());
    raw.timedOut = Date.now() - started > TIMEOUT;
    await page.waitForTimeout(250);
    return raw;
}

async function settle(page, quietMs, maxMs) {
    await page.evaluate(() => window.__perfArm('channel', { name: '' }));
    const started = Date.now();
    while (Date.now() - started <= maxMs) {
        await page.waitForTimeout(200);
        const s = await page.evaluate(() => window.__perfStatus());
        if (s.quietFor >= quietMs) {
            break;
        }
    }
    await page.evaluate(() => window.__perfCollect());
}

function log(message) {
    if (LOG) {
        console.error(message);
    }
}

function seconds(since) {
    return ((Date.now() - since) / 1000).toFixed(1);
}
