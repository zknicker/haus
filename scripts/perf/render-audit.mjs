// Render audit: counts React component renders per interaction in real Electron
// (desktop tabs, five kept chat views) against a render-counting prod bundle.
//
// The bundle comes from `HAUS_PERF_RENDER_AUDIT=1 scripts/perf/build-prod-bundle.sh <dir>`:
// a build-time transform (render-audit.vite.config.mjs) makes React's
// `renderWithHooks` call `globalThis.__hausRenderCount` for every function
// component render. node_modules is untouched. The count is "component renders",
// mounts included; it is the number that exploded in the October 2026 audit
// (one message anywhere = every row of every kept transcript re-rendered).
//
// Setup: a perf stack (ensure-dev-stack.sh with its own HAUS_DEV_STACK_ID and
// port base) seeded with seed-perf.sql. Run under the env loader, unsandboxed:
//   agent-varlock -- ./node_modules/.bin/varlock run -- node scripts/perf/render-audit.mjs ...
// Electron's main process needs the Clerk env, and Electron's binary must be
// installed (`node apps/website/node_modules/electron/install.js` if missing).
// Electron first loads the dev bundle (native Clerk sign-in), then the prod
// bundle is served on the dev origin via CDP Fetch (browser-session.mjs says
// why). The prod socket dials the website origin, which Chrome's Local Network
// Access checks block here, so Electron runs with
// `--disable-features=LocalNetworkAccessChecks` and the socket is rewritten to
// the Server port (website port + 3). Messages come from a headless Chrome on
// the dev bundle (same human, another device), so the audited renderer only
// sees realtime events.
//
// Usage: node scripts/perf/render-audit.mjs --dist .perf/dist-rc [--out file.json]
//   [--scenarios idle,message-open,message-other,warm-switch,agent-profile,tab-switch,agent-turn]
//   [--idle-ms 60000] [--turn-ms 60000] [--top 15] [--reps 1] [--source ComponentName]
// Each scenario reports its total, the top components, and the cascade roots:
// components that re-rendered with unchanged props (their own state or a
// context), which is where a storm starts. `--source` explains one root's
// renders (render-audit-counter.mjs). Live Agents and automations add noise;
// use --reps and read the median.
// Env: HAUS_PERF_BASE (website origin; default from dev ports), HAUS_PERF_SERVER_PORT,
// HAUS_RENDER_AUDIT_PROFILE (Electron profile id).
// Chats: #all is shown; #product, #automations and the Tiny and Blippy DMs are kept.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { defaultBase, parseArgs, repositoryRoot, sidebarRow } from './browser-session.mjs';
import { launchAuditedElectron, openSender } from './render-audit-session.mjs';

const args = parseArgs(process.argv.slice(2));
if (typeof args.dist !== 'string') {
    throw new Error('--dist <render-count bundle> is required');
}
const base = defaultBase();
const idleMs = Number(args['idle-ms'] ?? 60_000);
const turnMs = Number(args['turn-ms'] ?? 60_000);
const top = Number(args.top ?? 15);
const reps = Number(args.reps ?? 1);
const scenarios = (
    typeof args.scenarios === 'string'
        ? args.scenarios
        : 'idle,message-open,message-other,warm-switch,agent-profile,tab-switch,agent-turn'
).split(',');
const keptChats = ['product', 'automations', 'Tiny', 'Blippy', 'all'];

const sender = await openSender(base);
const { app, page } = await launchAuditedElectron({
    base,
    dist: path.resolve(repositoryRoot, args.dist),
    serverPort: Number(process.env.HAUS_PERF_SERVER_PORT ?? Number(new URL(base).port) + 3),
    source: args.source,
});

const scenarioRunners = {
    idle: () => measure(() => page.waitForTimeout(idleMs), { settleMs: 0 }),
    'message-open': () => measure(() => sender.send('all', 'Render audit: shown chat')),
    'message-other': () => measure(() => sender.send('product', 'Render audit: kept chat')),
    'warm-switch': async () => {
        const there = await measure(() => clickRow('product'));
        const back = await measure(() => clickRow('all'));
        return combine(there, back);
    },
    'agent-profile': async () => {
        const result = await measure(openAgentProfile);
        await closeLastTab();
        return result;
    },
    'tab-switch': async () => {
        await openAgentProfile();
        await page.waitForTimeout(2500);
        const tabs = page.locator('[data-tab-id]');
        await tabs.first().click();
        await page.waitForTimeout(1000);
        const toProfile = await measure(() => tabs.last().click());
        const toChat = await measure(() => tabs.first().click());
        await closeLastTab();
        return combine(toProfile, toChat);
    },
    'agent-turn': async () => {
        await clickRow('Tiny');
        await page.waitForTimeout(1500);
        const prompt = 'Render audit: reply with three short paragraphs about caching, then stop.';
        const result = await measure(() => sender.send('Tiny', prompt), { settleMs: turnMs });
        await clickRow('all');
        return result;
    },
};

const results = {};
try {
    await keepChats();
    for (const scenario of scenarios) {
        const run = scenarioRunners[scenario];
        if (!run) {
            throw new Error(`unknown scenario ${scenario}`);
        }
        results[scenario] = await repeat(run);
        report(scenario, results[scenario]);
    }
} finally {
    await app.close().catch(() => undefined);
    await sender.browser.close().catch(() => undefined);
}
if (typeof args.out === 'string') {
    writeFileSync(path.resolve(args.out), JSON.stringify(results, null, 2));
}

async function measure(action, { settleMs = 2500 } = {}) {
    await page.evaluate(() => {
        const state = globalThis.__hausRenders;
        for (const map of [state.byName, state.roots, state.sources]) {
            map.clear();
        }
        state.total = 0;
        state.on = true;
    });
    const started = Date.now();
    await action();
    if (settleMs > 0) {
        await page.waitForTimeout(settleMs);
    }
    const counted = await page.evaluate((limit) => {
        const state = globalThis.__hausRenders;
        state.on = false;
        const sorted = (map) => [...map].sort((a, b) => b[1] - a[1]).slice(0, limit);
        return {
            roots: sorted(state.roots),
            sources: sorted(state.sources),
            top: sorted(state.byName),
            total: state.total,
        };
    }, top);
    return { ...counted, ms: Date.now() - started };
}

function combine(...runs) {
    const merge = (key) => {
        const byName = new Map();
        for (const run of runs) {
            for (const [name, count] of run[key]) {
                byName.set(name, (byName.get(name) ?? 0) + count);
            }
        }
        return [...byName].sort((a, b) => b[1] - a[1]).slice(0, top);
    };
    return {
        ms: runs.reduce((sum, run) => sum + run.ms, 0),
        parts: runs.map((run) => run.total),
        roots: merge('roots'),
        sources: merge('sources'),
        top: merge('top'),
        total: runs.reduce((sum, run) => sum + run.total, 0),
    };
}

/** Runs a scenario `reps` times; reports every total and keeps the median run's detail. */
async function repeat(run) {
    const runs = [];
    for (let rep = 0; rep < reps; rep += 1) {
        runs.push(await run());
    }
    const sorted = [...runs].sort((a, b) => a.total - b.total);
    const median = sorted[Math.floor((sorted.length - 1) / 2)];
    return { ...median, reps: runs.map((run) => run.total) };
}

function report(scenario, result) {
    const parts = result.parts ? ` (${result.parts.join(' + ')})` : '';
    const repeats = result.reps.length > 1 ? ` [reps ${result.reps.join(', ')}; median shown]` : '';
    console.log(
        `\n=== ${scenario}: ${result.total} renders${parts} over ${result.ms} ms${repeats}`
    );
    const print = ([name, count]) => console.log(`  ${String(count).padStart(6)} ${name}`);
    result.top.forEach(print);
    console.log('  -- cascade roots (own state or context):');
    result.roots.forEach(print);
    for (const [why, count] of result.sources) {
        console.log(`  source x${count}: ${why.replaceAll('\n', ' ')}`);
    }
}

async function keepChats() {
    for (const name of keptChats) {
        await clickRow(name);
        await page.waitForTimeout(1500);
    }
    await page.waitForSelector(
        '[data-slot="chat-surface"]:visible [data-slot="message-scroller-item"]'
    );
    // Let idle warming, presence and read marks settle before counting.
    await page.waitForTimeout(5000);
}

/** Opens the last visible Agent avatar's profile: a new tab after the chat's. */
async function openAgentProfile() {
    await page
        .locator('[data-slot="chat-surface"]:visible button[aria-label$="\'s profile"]')
        .last()
        .click();
}

/** Closes the newest tab and returns to the chat tab. */
async function closeLastTab() {
    const tabs = page.locator('[data-tab-id]');
    await tabs.last().hover();
    await tabs.last().locator('button[aria-label^="Close"]').click({ force: true });
    await tabs.first().click();
    await page.waitForTimeout(1000);
}

async function clickRow(name) {
    await page.locator(sidebarRow(name)).first().click();
}
