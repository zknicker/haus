// `run.json`: the machine-readable index of one eval run.
//
// It is rewritten after every state change rather than once at the end, so a
// watcher tailing the run directory sees each prompt flip from pending to
// running to its outcome while the run is still going.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Creates `<outDir>/run.json`, already flushed with every prompt pending. */
export const createRunManifest = async ({ items, meta, outDir }) => {
    const manifest = {
        ...meta,
        finishedAt: null,
        prompts: items.map((item) => ({
            ask: item.ask,
            designSystemRead: false,
            fenceCount: 0,
            files: {},
            slug: item.slug,
            status: 'pending',
            tokens: null,
            wallMs: null,
        })),
    };
    const file = path.join(outDir, 'run.json');
    const flush = () => writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
    const update = async (slug, fields) => {
        const entry = manifest.prompts.find((prompt) => prompt.slug === slug);
        if (!entry) {
            throw new Error(`run.json has no prompt entry for "${slug}"`);
        }
        Object.assign(entry, fields);
        await flush();
    };

    await flush();
    return {
        file,
        finish: async () => {
            manifest.finishedAt = new Date().toISOString();
            await flush();
        },
        record: update,
        start: (slug) => update(slug, { status: 'running' }),
    };
};

/** Flattens the harness usage snapshot into the manifest's token shape. */
export const manifestTokens = (usage) =>
    usage
        ? {
              cacheRead: usage.cacheReadTokens,
              input: usage.inputTokens,
              output: usage.outputTokens,
              total: usage.totalTokens,
          }
        : null;
