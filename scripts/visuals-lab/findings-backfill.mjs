// Quality facts for runs recorded before the lab probed layout.
//
// The reader asks for a prompt's findings sidecar; when an old run has none,
// it queues the prompt here and shows "…" until the next poll finds the file.
// One headless browser, one probe at a time, closed again once the queue has
// been idle for a while, so a page left open costs nothing after the backfill.
//
// The sidecar is the only file this ever adds to a stamped run directory, and
// it is derived purely from the fences already there.
import { existsSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fenceFilesFor, findingsFileFor } from './engine/findings.mjs';
import { createVisualRenderer } from './engine/render.mjs';

const idleCloseMs = 30_000;

const queued = new Set();
const failed = new Set();
let chain = Promise.resolve();
let renderer = null;
let rendererWidth = null;
let idleTimer = null;

/** Queues one prompt's probe unless it is queued, already written, or failed before. */
export const backfillFindings = ({ fenceCount, runDir, slug, width = 736 }) => {
    const target = path.join(runDir, findingsFileFor(slug));
    if (queued.has(target) || failed.has(target) || existsSync(target)) {
        return;
    }
    queued.add(target);
    chain = chain
        .then(() => probePrompt({ fenceCount, runDir, slug, target, width }))
        .catch((error) => {
            failed.add(target);
            process.stderr.write(`findings backfill failed for ${target}: ${String(error)}\n`);
        })
        .finally(() => {
            queued.delete(target);
            scheduleClose();
        });
};

async function probePrompt({ fenceCount, runDir, slug, target, width }) {
    const active = await rendererFor(width);
    const quality = { console: [], layout: [] };
    for (const file of fenceFilesFor(slug, fenceCount)) {
        const html = await readFile(path.join(runDir, file), 'utf8');
        const fence = file.replace(/\.visual\.html$/u, '');
        const { consoleErrors, findings } = await active.probe({ html });
        quality.console.push(...consoleErrors.map((text) => `${fence}: ${text}`));
        quality.layout.push(...findings.map((text) => `${fence}: ${text}`));
    }
    // Written whole and renamed, so a poll never reads half a file.
    const partial = `${target}.partial`;
    await writeFile(partial, `${JSON.stringify(quality, null, 2)}\n`);
    await rename(partial, target);
}

async function rendererFor(width) {
    clearTimeout(idleTimer);
    if (renderer && rendererWidth !== width) {
        await renderer.close();
        renderer = null;
    }
    if (!renderer) {
        renderer = await createVisualRenderer({ width });
        rendererWidth = width;
    }
    return renderer;
}

function scheduleClose() {
    clearTimeout(idleTimer);
    if (queued.size > 0) {
        return;
    }
    idleTimer = setTimeout(() => {
        const closing = renderer;
        renderer = null;
        closing?.close().catch(() => null);
    }, idleCloseMs);
}
