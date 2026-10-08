#!/usr/bin/env node
// Frames-to-visible for a chat switch: samples the DOM on every rAF from
// pointerdown on a sidebar row until the target chat's surface is the only
// displayed one with on-screen rows AND exactly one displayed header names it.
// Answers "how many frames did the old view stay painted?" (React Router 7 wraps
// navigations in startTransition, so a slow render keeps the old chat on screen).
// 1 frame = the switch landed in the first frame after the press.
//
// Usage: node scripts/perf/frames-to-visible.mjs [flags]
//   --base <url>  --serve-dist <dir> (prod bundle)  --reps <n> (default 3)
//   --cpu <n>     --sequence cold:product,cold:automations,warm:all,...  --headed
// The landing chat must be #all for the default sequence (cold = first visit).
import {
    captureAuth,
    defaultBase,
    launchChrome,
    parseArgs,
    serveDist,
    sidebarRow,
    throttleCpu,
} from './browser-session.mjs';

const args = parseArgs(process.argv.slice(2));
const base = typeof args.base === 'string' ? args.base : defaultBase();
const distDir = typeof args['serve-dist'] === 'string' ? args['serve-dist'] : null;
const reps = Number(args.reps ?? 3);
const cpu = Number(args.cpu ?? 1);
const sequence = (
    typeof args.sequence === 'string'
        ? args.sequence
        : 'cold:product,cold:automations,warm:all,warm:product,warm:automations,warm:all'
)
    .split(',')
    .map((step) => step.split(':'));

const browser = await launchChrome({ headed: args.headed === true });
const storageState = distDir ? await captureAuth(browser, base) : undefined;
const all = [];
for (let rep = 0; rep < reps; rep++) {
    all.push(...(await runRep(rep)));
}
await browser.close();
for (const pass of ['cold', 'warm']) {
    const ok = all.filter((x) => x.pass === pass && x.surfaceFrame);
    console.log(
        `${pass.toUpperCase()} median surfaceFrame=${median(ok.map((x) => x.surfaceFrame))} ` +
            `headerFrame=${median(ok.map((x) => x.headerFrame ?? 999))} ` +
            `ms=${median(ok.map((x) => x.ms))} n=${ok.length}`
    );
}

async function runRep(rep) {
    const context = await browser.newContext({
        storageState,
        viewport: { height: 900, width: 1440 },
    });
    await context.addInitScript(installFrameProbe);
    if (distDir) {
        await serveDist(context, base, distDir);
    }
    const page = await context.newPage();
    page.on('pageerror', (e) => console.error('pageerror', e.message.slice(0, 200)));
    await page.goto(`${base}/`);
    await page.waitForSelector('[data-slot="message-scroller-item"]', { timeout: 60_000 });
    await page.waitForTimeout(3000);
    await throttleCpu(context, page, cpu);
    const results = [];
    for (const [pass, name] of sequence) {
        const box = await page.locator(sidebarRow(name)).boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(150);
        const pending = page.evaluate((n) => window.__frames(n), name);
        await page.mouse.down();
        await page.mouse.up();
        const r = await pending;
        const firstFrames = r.frames
            .slice(0, 6)
            .map((f) => `[${f.t} h=${f.h.join('|')} rows=${f.rows}]`);
        console.log(
            `${rep} ${pass.padEnd(4)} ${name.padEnd(12)} surface@${r.surfaceFrame} ` +
                `header@${r.headerFrame} ms=${r.ms} ${firstFrames.join(' ')}`
        );
        results.push({ pass, rep, name, ...r, frames: undefined });
        await page.waitForTimeout(1500);
    }
    await context.close();
    return results;
}

// Runs in the page. Resolves once both conditions hold, or after 120 frames.
function installFrameProbe() {
    const displayed = (el) => el.getBoundingClientRect().height > 0;
    const sample = (target) => {
        const headers = [...document.querySelectorAll('[data-slot="app-layout-main"] header h1')]
            .filter(displayed)
            .map((h) => h.textContent.trim().replace(/^#/, '').toLowerCase());
        const surfaces = [...document.querySelectorAll('[data-slot="chat-surface"]')].filter(
            displayed
        );
        const label = (s) =>
            (s.querySelector('[aria-label^="Message "]')?.getAttribute('aria-label') ?? '?')
                .slice('Message '.length)
                .toLowerCase();
        const surface = surfaces.length === 1 && label(surfaces[0]) === target ? surfaces[0] : null;
        const rows = surface
            ? [...surface.querySelectorAll('[data-slot="message-scroller-item"]')].filter((r) => {
                  const b = r.getBoundingClientRect();
                  return b.height > 0 && b.bottom > 0 && b.top < innerHeight;
              }).length
            : 0;
        return { h: headers, rows };
    };
    window.__frames = (name) =>
        new Promise((resolve) => {
            const target = name.toLowerCase();
            const frames = [];
            const t0 = performance.now();
            let surfaceFrame = null;
            let headerFrame = null;
            const tick = () => {
                const s = sample(target);
                frames.push({ t: Math.round(performance.now() - t0), ...s });
                if (surfaceFrame === null && s.rows > 0) {
                    surfaceFrame = frames.length;
                }
                if (headerFrame === null && s.h.length === 1 && s.h[0] === target) {
                    headerFrame = frames.length;
                }
                const ok = surfaceFrame !== null && headerFrame !== null;
                if (ok || frames.length > 120) {
                    resolve({
                        frames,
                        headerFrame,
                        ms: Math.round(performance.now() - t0),
                        ok,
                        surfaceFrame,
                    });
                    return;
                }
                requestAnimationFrame(tick);
            };
            window.addEventListener('pointerdown', () => requestAnimationFrame(tick), {
                capture: true,
                once: true,
            });
        });
}

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}
