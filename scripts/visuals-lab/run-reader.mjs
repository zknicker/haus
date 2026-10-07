// Reading finished runs back off disk: what the page shows for each cell.
//
// Every fact here is derived from a stamped run directory, and those are never
// rewritten — so each file is read once and the answer cached forever.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findingsFileFor } from './engine/findings.mjs';
import { countPreviewCallsInTrace } from './engine/preview-calls.mjs';
import { fragmentFiles, skillModules } from './engine/skill-fragments.mjs';
import { backfillFindings } from './findings-backfill.mjs';
import { stripVisualFences } from './reply-html.mjs';

/** Where every run lands. Gitignored: these are big and disposable. */
export const resultsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'results');

/** The newest result per prompt, per model. */
export const readResults = async (models) => {
    const results = {};
    for (const spec of models) {
        results[spec.id] = await latestRun(spec.id);
    }
    return results;
};

const latestRun = async (model) => {
    // Newest run per prompt, not per directory: a narrow `only` run must not
    // hide an older run's other prompts.
    const dir = path.join(resultsDir, model);
    const stamps = await readdir(dir).catch(() => []);
    const bySlug = new Map();
    let newest = null;
    for (const stamp of stamps.sort().reverse()) {
        const runDir = path.join(dir, stamp);
        const manifest = await readFile(path.join(runDir, 'run.json'), 'utf8').catch(() => null);
        if (!manifest) {
            continue;
        }
        const base = `/results/${model}/${stamp}`;
        const run = JSON.parse(manifest);
        newest ??= { ...run, logUrl: `${base}/job.log`, stamp };
        for (const prompt of run.prompts) {
            if (bySlug.has(prompt.slug) || prompt.status === 'pending') {
                continue;
            }
            bySlug.set(
                prompt.slug,
                await promptEntry(prompt, { base, runDir, stamp, width: run.width })
            );
        }
    }
    return newest ? { ...newest, prompts: [...bySlug.values()] } : null;
};

const promptEntry = async (prompt, { base, runDir, stamp, width }) => {
    const files = prompt.files ?? {};
    const refs = files.trace ? await traceReads(path.join(runDir, files.trace)) : null;
    const quality = await qualityFor(prompt, { runDir, width });
    return {
        ...prompt,
        consoleErrors: quality?.console.length ?? null,
        findings: quality,
        layoutFindings: quality?.layout.length ?? null,
        // Older manifests never counted previews; the trace still shows them.
        previewCalls: prompt.previewCalls ?? refs?.previewCalls ?? null,
        height: files.dark ? await pngHeight(path.join(runDir, files.dark)) : null,
        logUrl: `${base}/job.log`,
        refs,
        reply: files.reply ? await replyStats(path.join(runDir, files.reply)) : null,
        stamp,
        urls: Object.fromEntries(
            Object.entries(files).map(([key, file]) => [key, `${base}/${file}`])
        ),
    };
};

const derived = new Map();
const onceByPath = async (file, compute) => {
    if (!derived.has(file)) {
        derived.set(file, await compute(file));
    }
    return derived.get(file);
};

// The prose the model shipped around the visual, measured: the frame above
// already shows the fence, so the word count is the message, not the markup.
const tableRow = /^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)+\|?[ \t]*$/gmu;
const replyStats = (file) =>
    onceByPath(file, async () => {
        const markdown = await readFile(file, 'utf8').catch(() => null);
        if (markdown === null) {
            return null;
        }
        const prose = stripVisualFences(markdown);
        return {
            tables: (prose.match(tableRow) ?? []).length,
            words: (prose.trim().match(/\S+/gu) ?? []).length,
        };
    });

// Which of the skill's files the turn actually opened.
//
// Match the file's own name, not a path shape: the runtimes agree on nothing
// else. One records a `file_path`, another a shell string whose quotes arrive
// backslash-escaped; the claude bridge logs the skill load as
// `{"skill":"visuals"}` instead of a read; and a model that `cd`s into the
// skill directory and then cats `kpi-row.md` never writes a full path at all.
// A name out of the skill's own inventory can only reach the trace because the
// turn asked for that file.
const named = (text, names) =>
    names.filter((name) => new RegExp(`(?<![a-z0-9-])${name}\\.md`, 'u').test(text));
const withoutExtension = (name) => name.replace(/\.md$/u, '');
const skillRead = /SKILL\.md|\\?"skill\\?"\s*:\s*\\?"visuals\\?"/u;
const traceReads = (file) =>
    onceByPath(file, async () => {
        const text = await readFile(file, 'utf8').catch(() => null);
        if (text === null) {
            return null;
        }
        return {
            fragments: named(text, fragmentFiles().map(withoutExtension)),
            modules: named(text, skillModules.map(withoutExtension)),
            previewCalls: countPreviewCallsInTrace(text),
            skill: skillRead.test(text),
        };
    });

// What the shipped fences did in the real frame: the findings sidecar
// (findings.mjs). A run from before the lab probed layout has none, so queue a
// backfill and report nothing until it lands; only a sidecar that exists is
// cached, so the next poll picks it up.
const qualityFor = async (prompt, { runDir, width }) => {
    if (prompt.status !== 'ok' || !(prompt.fenceCount > 0)) {
        return null;
    }
    const file = path.join(runDir, findingsFileFor(prompt.slug));
    if (derived.has(file)) {
        return derived.get(file);
    }
    const text = await readFile(file, 'utf8').catch(() => null);
    if (text === null) {
        backfillFindings({ fenceCount: prompt.fenceCount, runDir, slug: prompt.slug, width });
        return null;
    }
    const quality = JSON.parse(text);
    derived.set(file, quality);
    return quality;
};

// The rendered height of the visual, straight off the capture: the PNG is shot
// at deviceScaleFactor 2, so its IHDR height is twice the frame's CSS height.
const pngHeight = (file) =>
    onceByPath(file, async () => {
        const head = await Bun.file(file)
            .slice(0, 24)
            .arrayBuffer()
            .catch(() => null);
        if (!head || head.byteLength < 24) {
            return null;
        }
        return Math.round(new DataView(head).getUint32(20) / 2);
    });
