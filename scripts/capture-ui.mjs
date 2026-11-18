// Captures a screenshot, and optionally a video, of the running dev stack's website.
//
//   bun run ui:capture -- /s/dev --out shot.png
//   bun run ui:capture -- /s/dev/chats/<id> --video out/ --send "Hi Cove" --wait 90000
//
// A bare path resolves against this checkout's website port (scripts/dev-ports.mjs).
// Chromium is HAUS_CAPTURE_CHROMIUM, else Playwright's bundled build, else the
// preinstalled `$PLAYWRIGHT_BROWSERS_PATH/chromium` that Linux cloud sessions ship.
import { existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { resolveDevPorts } from './dev-ports.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(path.join(repositoryRoot, 'apps/website/package.json'))(
    '@playwright/test'
);

const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
        height: { default: '900', type: 'string' },
        out: { type: 'string' },
        send: { type: 'string' },
        video: { type: 'string' },
        wait: { default: '8000', type: 'string' },
        width: { default: '1440', type: 'string' },
    },
});
const target = positionals[0] ?? '/';
const url = /^https?:\/\//u.test(target)
    ? target
    : new URL(target, `http://localhost:${resolveDevPorts({ repositoryRoot }).websitePort}`).href;
const viewport = { height: Number(values.height), width: Number(values.width) };
const out = values.out ?? path.join(tmpdir(), 'haus-ui-captures', `capture-${Date.now()}.png`);
mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
if (values.video) {
    mkdirSync(values.video, { recursive: true });
}

const browser = await chromium.launch({ executablePath: chromiumPath() });
const context = await browser.newContext({
    viewport,
    ...(values.video ? { recordVideo: { dir: values.video, size: viewport } } : {}),
});
const page = await context.newPage();
await page.goto(url);
await page.waitForLoadState('networkidle').catch(() => undefined);
if (values.send) {
    await page.getByRole('textbox').last().click();
    await page.keyboard.type(values.send, { delay: 20 });
    await page.keyboard.press('Enter');
}
await page.waitForTimeout(Number(values.wait));
await page.screenshot({ path: out });
const video = page.video();
await context.close();
await browser.close();
console.log(`screenshot ${path.resolve(out)}`);
if (video) {
    console.log(`video ${await video.path()}`);
}

function chromiumPath() {
    const candidates = [
        process.env.HAUS_CAPTURE_CHROMIUM,
        chromium.executablePath(),
        process.env.PLAYWRIGHT_BROWSERS_PATH &&
            path.join(process.env.PLAYWRIGHT_BROWSERS_PATH, 'chromium'),
    ];
    const found = candidates.find((candidate) => candidate && existsSync(candidate));
    if (!found) {
        throw new Error(
            'No Chromium found. Set HAUS_CAPTURE_CHROMIUM or run `bunx playwright install chromium` in apps/website.'
        );
    }
    return found;
}
