#!/usr/bin/env node
// Correctness guard for transcript render optimizations (content-visibility,
// row virtualization, scroll restore). Run it after touching how message rows
// size or mount; a perf win that breaks anchoring is not a win.
//
// 1. Scroll-up anchoring: wheel up through older-page loads; a reference row
//    visible before each step must move by exactly the user's scroll, however
//    much content renders or loads above it. Reports the max row drift (px) and
//    every non-zero drift. Expect 0-1px.
// 2. View in chat: deep-link the thread of an old loaded message, choose
//    "View in chat", and sample whether that message lands and stays in view.
// 3. View in chat on the oldest loaded message: it lands at the top, where the
//    scroll loads the next older page; the message must stay put through it.
//
// Transcript rows outside the render window are empty placeholders without a
// `data-message-id`; references, targets, and drift only use rendered rows.
//
// Usage: node scripts/perf/scroll-anchor-check.mjs [--chat all] [--base <url>]
//          [--serve-dist <dir>] [--shots <dir>] [--headed]
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import {
    captureAuth,
    defaultBase,
    launchChrome,
    parseArgs,
    perfOutputRoot,
    serveDist,
    sidebarRow,
} from './browser-session.mjs';

const args = parseArgs(process.argv.slice(2));
const base = typeof args.base === 'string' ? args.base : defaultBase();
const distDir = typeof args['serve-dist'] === 'string' ? args['serve-dist'] : null;
const chat = typeof args.chat === 'string' ? args.chat : 'all';
const shots = path.resolve(typeof args.shots === 'string' ? args.shots : perfOutputRoot);
const viewportSelector =
    '[data-slot="chat-surface"]:visible [data-slot="message-scroller-viewport"]';

mkdirSync(shots, { recursive: true });
const browser = await launchChrome({ headed: args.headed === true });
const storageState = distDir ? await captureAuth(browser, base) : undefined;
const context = await browser.newContext({ storageState, viewport: { height: 900, width: 1440 } });
if (distDir) {
    await serveDist(context, base, distDir);
}
const page = await context.newPage();
await page.goto(`${base}/`);
await page.waitForSelector('[data-slot="sidebar-menu-item"]', { timeout: 60_000 });
await page.click(sidebarRow(chat));
await page.waitForTimeout(3000);
const chatUrl = page.url().split('?')[0];
const viewport = () => page.locator(viewportSelector).first();

const oldestLoaded = (await probe()).oldestTurnId;
const jumpTarget = await scrollUpAnchoring();
await viewInChat(jumpTarget, 'view-in-chat');
await viewInChat(oldestLoaded, 'view-in-chat-oldest-loaded');
await browser.close();

async function scrollUpAnchoring() {
    const box = await viewport().boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const drifts = [];
    let loads = 0;
    let last = await probe();
    const startCount = last.count;
    for (let i = 0; i < 160; i++) {
        const before = await probe();
        await page.mouse.wheel(0, -400);
        await page.waitForTimeout(250);
        const after = await probe(before.refId);
        // The wheel moves the reference row down by 400px, or by what was left
        // above it. Anything else is content above it moving the row: a
        // prepended page or rows rendering at their real height.
        const userScroll = Math.min(400, before.scrollTop);
        const drift = Math.round(after.refTop - before.refTop - userScroll);
        drifts.push(drift);
        if (Math.abs(drift) > 1) {
            const { jumpTargetId: _a, oldestTurnId: _b, ...shape } = after;
            console.error(
                JSON.stringify({
                    after: shape,
                    before: {
                        count: before.count,
                        refId: before.refId,
                        refTop: before.refTop,
                        scrollHeight: before.scrollHeight,
                        scrollTop: before.scrollTop,
                    },
                    drift,
                    step: i,
                })
            );
        }
        loads += after.count > before.count ? 1 : 0;
        last = after;
        if (i > 5 && after.scrollTop === 0 && after.count === before.count) {
            await page.waitForTimeout(1200); // give a pending older page a chance
            const again = await probe();
            if (again.count === after.count && again.scrollTop === 0) {
                break;
            }
        }
    }
    const maxRowDriftPx = Math.max(0, ...drifts.map(Math.abs));
    const nonZero = drifts.filter((d) => Math.abs(d) > 1);
    console.log(
        JSON.stringify({ endCount: last.count, loads, maxRowDriftPx, nonZero, startCount })
    );
    await page.screenshot({ path: path.join(shots, 'scroll-anchor-top.png') });
    return last.jumpTargetId;
}

async function viewInChat(rowId, step) {
    if (!rowId) {
        console.log(`${step} skipped: no turn row loaded`);
        return;
    }
    await page.goto(`${chatUrl}?thread=${rowId.slice('turn:'.length)}`);
    await page.waitForSelector(viewportSelector, { timeout: 60_000 });
    await page.waitForTimeout(3000);
    await page
        .getByRole('button', { name: /thread actions/ })
        .first()
        .click();
    await page.getByRole('menuitem', { name: 'View in chat' }).click();
    const samples = [];
    let elapsed = 0;
    for (const ms of [50, 150, 300, 500, 1000, 1500, 2000, 3000, 4000, 6000]) {
        await page.waitForTimeout(ms - elapsed);
        elapsed = ms;
        samples.push({ ms, ...(await locate(rowId)) });
    }
    // Older pages may still be loading in the first samples; judge from the landing on.
    const landed = samples.slice(
        Math.max(
            0,
            samples.findIndex((sample) => sample.found)
        )
    );
    const tops = landed.filter((sample) => sample.found).map((sample) => sample.top);
    const settledDriftPx = tops.length ? Math.max(...tops) - Math.min(...tops) : null;
    const allInView = tops.length > 0 && landed.every((sample) => sample.inView);
    console.log(JSON.stringify({ allInView, samples, settledDriftPx, step }));
    await page.screenshot({ path: path.join(shots, `scroll-anchor-${step}.png`) });
}

function probe(refId) {
    return viewport().evaluate((v, id) => {
        const top = v.getBoundingClientRect().top;
        const items = [...v.querySelectorAll('[data-slot="message-scroller-item"]')];
        const rows = items.filter((r) => r.dataset.messageId);
        const inView = rows.filter((r) => {
            const b = r.getBoundingClientRect();
            return b.bottom > top + 40 && b.top < top + v.clientHeight - 40;
        });
        const ref = id
            ? rows.find((r) => r.dataset.messageId === id)
            : inView[Math.floor(inView.length / 2)];
        const turns = rows.filter((r) => r.dataset.messageId?.startsWith('turn:'));
        return {
            count: items.length,
            // 60 rows in from the top: far from the bottom, inside the jump's loaded window.
            jumpTargetId: (turns[60] ?? turns[0])?.dataset.messageId ?? null,
            oldestTurnId:
                items
                    .map((r) => r.dataset.messageId ?? r.dataset.transcriptPlaceholder)
                    .find((id) => id?.startsWith('turn:')) ?? null,
            refId: ref?.dataset.messageId,
            refTop: ref ? ref.getBoundingClientRect().top - top : null,
            scrollHeight: v.scrollHeight,
            scrollTop: v.scrollTop,
        };
    }, refId);
}

function locate(rowId) {
    return viewport().evaluate((v, id) => {
        const r = v.querySelector(`[data-slot="message-scroller-item"][data-message-id="${id}"]`);
        if (!r) {
            return {
                count: v.querySelectorAll('[data-slot="message-scroller-item"]').length,
                found: false,
                scrollTop: Math.round(v.scrollTop),
            };
        }
        const b = r.getBoundingClientRect();
        const t = v.getBoundingClientRect();
        return {
            count: v.querySelectorAll('[data-slot="message-scroller-item"]').length,
            found: true,
            inView: b.bottom > t.top && b.top < t.bottom,
            scrollTop: Math.round(v.scrollTop),
            top: Math.round(b.top - t.top),
        };
    }, rowId);
}
